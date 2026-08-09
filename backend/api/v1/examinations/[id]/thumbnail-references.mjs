import { handleOptions, readJsonBody, sendJson, setCors } from '../../../_lib/http.mjs'
import { getOwnedExamination, queryParam } from '../../../_lib/examinations.mjs'
import { requireSupabaseUser, supabaseRest } from '../../../_lib/supabase.mjs'

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  setCors(res)
  if (req.method !== 'POST') return sendJson(res, 405, { message: 'Method not allowed' })
  const session = await requireSupabaseUser(req, res)
  if (!session) return
  try {
    const examinationId = queryParam(req, 'id')
    const body = await readJsonBody(req)
    if (!await getOwnedExamination(session.user.id, examinationId)) return sendJson(res, 404, { message: 'ไม่พบรายการตรวจ' })
    for (const [position, path] of Object.entries(body.thumbnails || {})) {
      // The thumbnail endpoint already persists a safe storage path and returns
      // a short-lived URL for display. Never replace that path with the URL.
      if (/^https?:\/\//i.test(String(path))) continue
      await supabaseRest(`/rest/v1/examination_images?examination_id=eq.${encodeURIComponent(examinationId)}&position=eq.${encodeURIComponent(String(position).replace('-', '_'))}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ thumbnail_path: path }) })
    }
    return sendJson(res, 204, null)
  } catch (error) {
    console.error('thumbnail references save failed', error)
    return sendJson(res, 500, { message: 'ไม่สามารถบันทึกรูปย่อได้' })
  }
}
