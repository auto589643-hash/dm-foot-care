import { handleOptions, readJsonBody, sendJson, setCors } from '../../../_lib/http.mjs'
import { getOwnedExamination, queryParam } from '../../../_lib/examinations.mjs'
import { requireSupabaseUser, supabaseRest } from '../../../_lib/supabase.mjs'

const allowed = new Set(['draft', 'uploading', 'analyzing', 'awaiting_review', 'thumbnailing', 'confirmed', 'analysis_failed', 'thumbnail_failed'])

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  setCors(res)
  if (req.method !== 'PATCH') return sendJson(res, 405, { message: 'Method not allowed' })
  const session = await requireSupabaseUser(req, res)
  if (!session) return
  try {
    const examinationId = queryParam(req, 'id')
    const body = await readJsonBody(req)
    if (!allowed.has(body.status)) return sendJson(res, 400, { message: 'สถานะไม่ถูกต้อง' })
    const exam = await getOwnedExamination(session.user.id, examinationId)
    if (!exam) return sendJson(res, 404, { message: 'ไม่พบรายการตรวจ' })
    const rows = await supabaseRest(`/rest/v1/examinations?id=eq.${encodeURIComponent(examinationId)}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ status: body.status }) })
    return sendJson(res, 200, { id: rows?.[0]?.id || examinationId, status: body.status })
  } catch (error) {
    console.error('examination status update failed', error)
    return sendJson(res, 409, { message: 'เปลี่ยนสถานะรายการตรวจไม่ได้' })
  }
}
