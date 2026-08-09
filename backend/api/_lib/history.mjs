import { createStorageSignedUrl, supabaseRest } from './supabase.mjs'

function bangkokParts(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date)
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
}

function toDate(value) {
  const parts = bangkokParts(value)
  return parts ? `${parts.year}-${parts.month}-${parts.day}` : ''
}

function toThaiDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' }).format(date)
}

function toThaiTime(value) {
  const parts = bangkokParts(value)
  return parts ? `${parts.hour}:${parts.minute}` : ''
}

function statusForClient(status) {
  return status === 'confirmed' ? 'complete' : status === 'draft' ? 'draft' : 'processing'
}

/** Hydrates each examination with findings and short-lived URLs for private thumbnails. */
export async function hydrateExaminationHistory(examinations) {
  if (!examinations.length) return []
  const ids = examinations.map((row) => row.id).join(',')
  const [findings, images] = await Promise.all([
    supabaseRest(`/rest/v1/confirmed_findings?select=examination_id,disease_code_snapshot,disease_name_snapshot,severity_label_snapshot,confirmed_at&examination_id=in.(${encodeURIComponent(ids)})&order=confirmed_at.asc`),
    supabaseRest(`/rest/v1/examination_images?select=examination_id,position,thumbnail_path&examination_id=in.(${encodeURIComponent(ids)})`),
  ])
  const findingsByExam = new Map()
  for (const finding of findings) {
    const list = findingsByExam.get(finding.examination_id) || []
    list.push({
      diseaseId: finding.disease_code_snapshot || '',
      name: finding.disease_name_snapshot || 'ไม่ระบุภาวะ',
      detected: true,
      severity: finding.severity_label_snapshot || 'เล็กน้อย',
      confidence: 100,
      comparison: 'คงที่',
    })
    findingsByExam.set(finding.examination_id, list)
  }
  const thumbnailsByExam = new Map()
  await Promise.all(images.filter((image) => image.thumbnail_path).map(async (image) => {
    try {
      const url = await createStorageSignedUrl('dm-foot-thumbnails', image.thumbnail_path)
      const thumbnails = thumbnailsByExam.get(image.examination_id) || {}
      thumbnails[image.position.replace('_', '-')] = url
      thumbnailsByExam.set(image.examination_id, thumbnails)
    } catch (error) {
      // A missing historical thumbnail must not hide the examination record.
      console.warn('history thumbnail signing skipped', image.examination_id, image.position, error instanceof Error ? error.message : error)
    }
  }))
  return examinations.map((row) => {
    const timestamp = row.examined_at || row.created_at
    return {
      id: row.id,
      date: toDate(timestamp),
      displayDate: toThaiDate(timestamp),
      time: toThaiTime(timestamp),
      status: statusForClient(row.status),
      findings: findingsByExam.get(row.id) || [],
      thumbnails: thumbnailsByExam.get(row.id) || {},
    }
  })
}
