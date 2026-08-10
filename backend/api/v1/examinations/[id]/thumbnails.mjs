import { handleOptions, readJsonBody, sendJson, setCors } from '../../../_lib/http.mjs'
import { getOwnedExamination, queryParam } from '../../../_lib/examinations.mjs'
import { createStorageSignedUrl, requireSupabaseUser, supabaseRest, supabaseStorage } from '../../../_lib/supabase.mjs'

const positions = new Set(['left-dorsal', 'left-sole', 'right-dorsal', 'right-sole'])
const maxThumbnailBytes = 750_000

function decodeThumbnail(value) {
  const match = /^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(String(value || ''))
  if (!match) throw new Error('รูปย่อมีรูปแบบไม่ถูกต้อง')
  const bytes = Buffer.from(match[2], 'base64')
  if (!bytes.length || bytes.length > maxThumbnailBytes) throw new Error('ขนาดรูปย่อไม่ถูกต้อง')
  return { mimeType: match[1], bytes }
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  setCors(res)
  if (req.method !== 'POST') return sendJson(res, 405, { message: 'Method not allowed' })
  const session = await requireSupabaseUser(req, res)
  if (!session) return
  try {
    const examinationId = queryParam(req, 'id')
    if (!await getOwnedExamination(session.user.id, examinationId)) return sendJson(res, 404, { message: 'ไม่พบรายการตรวจ' })
    const body = await readJsonBody(req)
    const startedAt = Date.now()
    const entries = await Promise.all(Object.entries(body.thumbnails || {}).map(async ([position, value]) => {
      if (!positions.has(position)) return null
      const { mimeType, bytes } = decodeThumbnail(value)
      const path = `${session.user.id}/${examinationId}/${position}.webp`
      await supabaseStorage(`/object/dm-foot-thumbnails/${path.split('/').map(encodeURIComponent).join('/')}`, {
        method: 'POST',
        headers: { 'content-type': mimeType, 'x-upsert': 'true', 'cache-control': '31536000' },
        body: bytes,
      })
      await supabaseRest(`/rest/v1/examination_images?examination_id=eq.${encodeURIComponent(examinationId)}&position=eq.${encodeURIComponent(position.replace('-', '_'))}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ thumbnail_path: path, thumbnail_metadata: { mimeType, generatedAt: new Date().toISOString() } }),
      })
      const signedUrl = await createStorageSignedUrl('dm-foot-thumbnails', path)
      return [position, signedUrl]
    }))
    const thumbnails = Object.fromEntries(entries.filter(Boolean))
    console.info(JSON.stringify({ event: 'dmfc_thumbnail_timing', examinationId, count: Object.keys(thumbnails).length, totalMs: Date.now() - startedAt }))
    return sendJson(res, 200, { thumbnails })
  } catch (error) {
    console.error('thumbnail request failed', error)
    return sendJson(res, 500, { message: 'ไม่สามารถเตรียมรูปย่อได้' })
  }
}
