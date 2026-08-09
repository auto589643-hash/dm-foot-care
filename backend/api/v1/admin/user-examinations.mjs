import { handleOptions, sendJson, setCors } from '../../_lib/http.mjs'
import { requireAdminUser, supabaseRest } from '../../_lib/supabase.mjs'

function queryParam(req, name) {
  const value = req.query?.[name]
  return Array.isArray(value) ? value[0] : value
}

function formatThaiDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' }).format(date)
}

function formatThaiTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Bangkok' }).format(date)
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  setCors(res)
  if (req.method !== 'GET') return sendJson(res, 405, { message: 'Method not allowed' })
  try {
    const session = await requireAdminUser(req, res)
    if (!session) return
    const userId = String(queryParam(req, 'userId') || '')
    if (!isUuid(userId)) return sendJson(res, 400, { message: 'รหัสผู้ใช้งานไม่ถูกต้อง' })

    const examinations = await supabaseRest(`/rest/v1/examinations?select=id,examination_code,status,examined_at,created_at&user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc`)
    if (!examinations.length) return sendJson(res, 200, { examinations: [] })

    const ids = examinations.map((row) => row.id).join(',')
    const findings = await supabaseRest(`/rest/v1/confirmed_findings?select=examination_id,disease_code_snapshot,disease_name_snapshot,severity_label_snapshot,confirmed_at&examination_id=in.(${encodeURIComponent(ids)})&order=confirmed_at.asc`)
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

    return sendJson(res, 200, {
      examinations: examinations.map((row) => {
        const timestamp = row.examined_at || row.created_at
        return {
          id: row.id,
          date: timestamp ? new Date(timestamp).toISOString().slice(0, 10) : '',
          displayDate: formatThaiDate(timestamp),
          time: formatThaiTime(timestamp),
          status: row.status === 'confirmed' ? 'complete' : row.status === 'draft' ? 'draft' : 'processing',
          findings: findingsByExam.get(row.id) || [],
        }
      }),
    })
  } catch (error) {
    console.error('admin user examinations read failed', error)
    return sendJson(res, 500, { message: 'ไม่สามารถโหลดประวัติการตรวจได้' })
  }
}
