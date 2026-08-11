import { handleOptions, readBinaryBody, sendJson, setCors } from '../_lib/http.mjs'
import { getFileMetadata, uploadFile } from '../_lib/drive.mjs'
import { requireSupabaseUser, supabaseRest } from '../_lib/supabase.mjs'

const validPositions = new Set(['left-dorsal', 'left-sole', 'right-dorsal', 'right-sole'])

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
    const examinationId = String(req.headers['x-dmfc-examination-id'] || '')
    const rawFilename = String(req.headers['x-dmfc-drive-filename'] || `foot-${position}.jpg`)
    let filename
    try { filename = decodeURIComponent(rawFilename) } catch { return sendJson(res, 400, { message: 'Image filename is invalid' }) }
    if (!folderId || !validPositions.has(position)) return sendJson(res, 400, { message: 'Drive folder and valid image position are required' })

    const ownershipCheck = examinationId
      ? supabaseRest(`/rest/v1/examinations?select=id&id=eq.${encodeURIComponent(examinationId)}&user_id=eq.${encodeURIComponent(session.user.id)}&limit=1`)
      : Promise.resolve(null)
    const [folder, ownedExaminations] = await Promise.all([getFileMetadata(folderId), ownershipCheck])
    if (folder.mimeType !== 'application/vnd.google-apps.folder' || folder.appProperties?.dmfcOwnerUserId !== session.user.id) {
      return sendJson(res, 403, { message: 'ไม่มีสิทธิ์เขียนโฟลเดอร์นี้' })
    }
    if (examinationId && !ownedExaminations?.[0]) {
      return sendJson(res, 403, { message: 'ไม่มีสิทธิ์บันทึกรูปในรายการตรวจนี้' })
    }

    const data = await readBinaryBody(req)
    if (!data.length) return sendJson(res, 400, { message: 'Image body is empty' })
    const mimeType = req.headers['content-type'] || 'application/octet-stream'
    const driveStartedAt = Date.now()
    const file = await uploadFile(folderId, filename, mimeType, data)
    const driveMs = Date.now() - driveStartedAt

    // Preserve the storage architecture: the original remains only in Google
    // Drive. Supabase receives the Drive IDs + metadata, never the original
    // image bytes. Doing this in the same backend request removes one browser
    // API round trip per image.
    if (examinationId) {
      const databaseStartedAt = Date.now()
      await supabaseRest('/rest/v1/examination_images?on_conflict=examination_id,position', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({
          examination_id: examinationId,
          idempotency_key: `${examinationId}:${position}`,
          position: position.replace('-', '_'),
          drive_folder_id: folderId,
          drive_file_id: file.id,
          original_metadata: {
            mimeType,
            size: data.length,
            filename,
            uploadedAt: new Date().toISOString(),
          },
        }),
      })
      console.info(JSON.stringify({ event: 'dmfc_drive_upload_timing', examinationId, position, bytes: data.length, driveMs, databaseMs: Date.now() - databaseStartedAt, totalMs: Date.now() - startedAt }))
    } else {
      console.info(JSON.stringify({ event: 'dmfc_drive_upload_timing', position, bytes: data.length, driveMs, totalMs: Date.now() - startedAt }))
    }
    return sendJson(res, 201, { fileId: file.id })
  } catch (error) {
    console.error('Drive image upload failed', error)
    return sendJson(res, 500, { message: 'ไม่สามารถอัปโหลดรูปต้นฉบับได้' })
  }
}