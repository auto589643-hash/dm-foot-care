import { downloadThumbnail } from '../../_lib/drive.mjs'
import { handleOptions, sendJson, setCors } from '../../_lib/http.mjs'
import { createStorageSignedUrl, requireAdminUser, supabaseRest, supabaseStorage } from '../../_lib/supabase.mjs'

const positionMap = new Map([
  ['left-dorsal', 'left_dorsal'],
  ['left-sole', 'left_sole'],
  ['right-dorsal', 'right_dorsal'],
  ['right-sole', 'right_sole'],
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

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  setCors(res)
  if (req.method !== 'GET') return sendJson(res, 405, { message: 'Method not allowed' })
  try {
    const session = await requireAdminUser(req, res)
    if (!session) return

    const examinationId = String(queryParam(req, 'examinationId') || '')
    const position = String(queryParam(req, 'position') || '')
    const dbPosition = positionMap.get(position)
    if (!isUuid(examinationId) || !dbPosition) return sendJson(res, 400, { message: 'ข้อมูลรูปตรวจไม่ถูกต้อง' })

    const examinations = await supabaseRest(`/rest/v1/examinations?select=id,user_id&id=eq.${encodeURIComponent(examinationId)}&limit=1`)
    const examination = examinations[0]
    if (!examination) return sendJson(res, 404, { message: 'ไม่พบรายการตรวจ' })

    const images = await supabaseRest(`/rest/v1/examination_images?select=examination_id,position,drive_file_id,thumbnail_path&examination_id=eq.${encodeURIComponent(examinationId)}&position=eq.${encodeURIComponent(dbPosition)}&limit=1`)
    const image = images[0]
    if (!image) return sendJson(res, 404, { message: 'ไม่พบรูปในมุมที่เลือก' })

    if (image.thumbnail_path) {
      return sendJson(res, 200, { url: await createStorageSignedUrl('dm-foot-thumbnails', image.thumbnail_path), cached: true })
    }
    if (!image.drive_file_id) return sendJson(res, 404, { message: 'ไม่พบไฟล์ต้นฉบับของรูปนี้' })

    const preview = await downloadThumbnail(image.drive_file_id)
    if (!String(preview.mimeType).startsWith('image/')) return sendJson(res, 422, { message: 'ไฟล์ต้นฉบับไม่มี preview รูปภาพ' })
    if (preview.data.length > maxPreviewBytes) return sendJson(res, 413, { message: 'preview รูปภาพมีขนาดใหญ่เกินไป' })

    const path = `${examination.user_id}/${examinationId}/${position}-drive-preview.${extensionFor(preview.mimeType)}`
    await supabaseStorage(`/object/dm-foot-thumbnails/${path.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'POST',
      headers: { 'content-type': preview.mimeType, 'x-upsert': 'true', 'cache-control': '31536000' },
      body: preview.data,
    })
    await supabaseRest(`/rest/v1/examination_images?examination_id=eq.${encodeURIComponent(examinationId)}&position=eq.${encodeURIComponent(dbPosition)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ thumbnail_path: path, thumbnail_metadata: { mimeType: preview.mimeType, generatedAt: new Date().toISOString(), source: 'google_drive_preview' } }),
    })

    return sendJson(res, 200, { url: await createStorageSignedUrl('dm-foot-thumbnails', path), cached: false })
  } catch (error) {
    console.error('admin examination image read failed', error)
    return sendJson(res, 500, { message: 'ไม่สามารถเปิดรูปจากการตรวจได้' })
  }
}
