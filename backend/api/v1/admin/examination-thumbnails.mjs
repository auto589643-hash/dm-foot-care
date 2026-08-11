import { downloadThumbnail } from '../../_lib/drive.mjs'
import { handleOptions, sendJson, setCors } from '../../_lib/http.mjs'
import { createStorageSignedUrl, requireAdminUser, supabaseRest, supabaseStorage } from '../../_lib/supabase.mjs'

const positionMap = new Map([
  ['left_dorsal', 'left-dorsal'],
  ['left_sole', 'left-sole'],
  ['right_dorsal', 'right-dorsal'],
  ['right_sole', 'right-sole'],
])
const maxPreviewBytes = 2_500_000

function queryParam(req, name) {
  const value = req.query?.[name]
  return Array.isArray(value) ? value[0] : value
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function extensionFor(mimeType) {
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'image/webp') return 'webp'
  return 'jpg'
}

async function prepareThumbnail(examination, image) {
  const position = positionMap.get(image.position)
  if (!position) return null
  if (image.thumbnail_path) {
    try { return [position, await createStorageSignedUrl('dm-foot-thumbnails', image.thumbnail_path)] }
    catch (error) { console.warn('admin cached thumbnail signing failed', examination.id, position, error instanceof Error ? error.message : error) }
  }
  if (!image.drive_file_id) return null
  try {
    const preview = await downloadThumbnail(image.drive_file_id)
    if (!String(preview.mimeType).startsWith('image/') || preview.data.length > maxPreviewBytes) return null
    const path = `${examination.user_id}/${examination.id}/${position}-drive-preview.${extensionFor(preview.mimeType)}`
    await supabaseStorage(`/object/dm-foot-thumbnails/${path.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'POST',
      headers: { 'content-type': preview.mimeType, 'x-upsert': 'true', 'cache-control': '31536000' },
      body: preview.data,
    })
    await supabaseRest(`/rest/v1/examination_images?examination_id=eq.${encodeURIComponent(examination.id)}&position=eq.${encodeURIComponent(image.position)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ thumbnail_path: path, thumbnail_metadata: { mimeType: preview.mimeType, generatedAt: new Date().toISOString(), source: 'google_drive_preview' } }),
    })
    return [position, await createStorageSignedUrl('dm-foot-thumbnails', path)]
  } catch (error) {
    console.warn('admin Drive thumbnail backfill failed', examination.id, position, error instanceof Error ? error.message : error)
    return null
  }
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  setCors(res)
  if (req.method !== 'GET') return sendJson(res, 405, { message: 'Method not allowed' })
  try {
    const session = await requireAdminUser(req, res)
    if (!session) return
    const examinationId = String(queryParam(req, 'examinationId') || '')
    if (!isUuid(examinationId)) return sendJson(res, 400, { message: 'รหัสผลตรวจไม่ถูกต้อง' })
    const examinations = await supabaseRest(`/rest/v1/examinations?select=id,user_id&id=eq.${encodeURIComponent(examinationId)}&limit=1`)
    const examination = examinations[0]
    if (!examination) return sendJson(res, 404, { message: 'ไม่พบรายการตรวจ' })
    const images = await supabaseRest(`/rest/v1/examination_images?select=examination_id,position,drive_file_id,thumbnail_path&examination_id=eq.${encodeURIComponent(examinationId)}`)
    const entries = await Promise.all(images.map((image) => prepareThumbnail(examination, image)))
    res.setHeader('Cache-Control', 'private, no-store')
    return sendJson(res, 200, { thumbnails: Object.fromEntries(entries.filter(Boolean)) })
  } catch (error) {
    console.error('admin examination thumbnails failed', error)
    return sendJson(res, 500, { message: 'ไม่สามารถโหลดภาพตัวอย่างจากผลตรวจได้' })
  }
}
