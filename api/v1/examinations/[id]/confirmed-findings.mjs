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
    const exam = await getOwnedExamination(session.user.id, examinationId)
    if (!exam) return sendJson(res, 404, { message: 'ไม่พบรายการตรวจ' })
    const diseases = await supabaseRest(`/rest/v1/diseases?select=id,code,name&code=eq.${encodeURIComponent(String(body.diseaseId || ''))}&limit=1`)
    const disease = diseases?.[0]
    if (!disease) return sendJson(res, 400, { message: 'ไม่พบภาวะที่ยืนยัน' })
    await supabaseRest('/rest/v1/confirmed_findings?on_conflict=examination_id,disease_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ examination_id: examinationId, disease_id: disease.id, disease_code_snapshot: disease.code, disease_name_snapshot: disease.name, severity_label_snapshot: body.severity || null, ai_finding_id: body.aiFindingId || null, confirmed_by: session.user.id }) })
    return sendJson(res, 204, null)
  } catch (error) {
    console.error('confirmed finding save failed', error)
    return sendJson(res, 500, { message: 'ไม่สามารถบันทึกผลยืนยันได้' })
  }
}
