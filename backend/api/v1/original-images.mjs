import { handleOptions, readBinaryBody, sendJson, setCors } from '../_lib/http.mjs'
import { getFileMetadata, uploadFile } from '../_lib/drive.mjs'
import { requireSupabaseUser } from '../_lib/supabase.mjs'

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  setCors(res)
  if (req.method !== 'POST') return sendJson(res, 405, { message: 'Method not allowed' })
  const startedAt = Date.now()
  try {
    const session = await requireSupabaseUser(req, res)
    if (!session) return
    const folderId = String(req.headers['x-dmfc-drive-folder'] || '')
    const position = String(req.headers['x-dmfc-image-position'] || '')
    const rawFilename = String(req.headers['x-dmfc-drive-filename'] || `foot-${position}.jpg`)
    let filename
    try { filename = decodeURIComponent(rawFilename) } catch { return sendJson(res, 400, { message: 'Image filename is invalid' }) }
    if (!folderId || !position) return sendJson(res, 400, { message: 'Drive folder and image position are required' })
    const folder = await getFileMetadata(folderId)
    if (folder.mimeType !== 'application/vnd.google-apps.folder' || folder.appProperties?.dmfcOwnerUserId !== session.user.id) {
      return sendJson(res, 403, { message: 'ไม่มีสิทธิ์เขียนโฟลเดอร์นี้' })
    }
    const data = await readBinaryBody(req)
    if (!data.length) return sendJson(res, 400, { message: 'Image body is empty' })
    const driveStartedAt = Date.now()
    const file = await uploadFile(folderId, filename, req.headers['content-type'] || 'application/octet-stream', data)
    console.info(JSON.stringify({ event: 'dmfc_drive_upload_timing', position, bytes: data.length, driveMs: Date.now() - driveStartedAt, totalMs: Date.now() - startedAt }))
    return sendJson(res, 201, { fileId: file.id })
  } catch (error) {
    console.error('Drive image upload failed', error)
    return sendJson(res, 500, { message: 'ไม่สามารถอัปโหลดรูปต้นฉบับได้' })
  }
}
