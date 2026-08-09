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
    const existing = await supabaseRest(`/rest/v1/ai_analysis_runs?select=id&examination_id=eq.${encodeURIComponent(examinationId)}&idempotency_key=eq.${encodeURIComponent(String(body.idempotencyKey || ''))}&limit=1`)
    if (existing?.[0]) return sendJson(res, 200, { runId: existing[0].id })
    const rows = await supabaseRest('/rest/v1/ai_analysis_runs', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ examination_id: examinationId, idempotency_key: String(body.idempotencyKey || ''), provider: String(body.provider || 'gemini'), model: String(body.model || 'gemini-2.5-flash'), disease_master_revision: Number(body.diseaseMasterRevision || 1), status: body.validation?.status === 'accepted' ? 'validated' : 'failed', raw_result: body.rawResult || {}, validation_errors: body.validation?.rejectedItems || [], started_at: new Date().toISOString(), completed_at: new Date().toISOString() }) })
    const runId = rows?.[0]?.id || body.runId
    const rawFindings = Array.isArray(body.validation?.findings) ? body.validation.findings : []
    for (const finding of rawFindings) {
      if (!finding?.diseaseId) continue
      const diseaseRows = await supabaseRest(`/rest/v1/diseases?select=id,code,name&id=eq.${encodeURIComponent(String(finding.diseaseId))}&limit=1`)
      const disease = diseaseRows?.[0]
      if (!disease) continue
      const severity = finding.suggestedSeverity ? await supabaseRest(`/rest/v1/disease_severity_levels?select=id,label&disease_id=eq.${encodeURIComponent(disease.id)}&label=eq.${encodeURIComponent(String(finding.suggestedSeverity))}&limit=1`) : []
      const positions = Array.isArray(finding.imagePositions) ? finding.imagePositions : []
      await supabaseRest('/rest/v1/ai_findings', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ run_id: runId, disease_id: disease.id, disease_code_snapshot: disease.code, disease_name_snapshot: disease.name, detected: Boolean(finding.detected), suggested_severity_id: severity?.[0]?.id || null, suggested_severity_label_snapshot: finding.suggestedSeverity || null, confidence: typeof finding.confidence === 'number' ? finding.confidence : null, image_position: positions[0] ? String(positions[0]).replace('-', '_') : null }) })
    }
    return sendJson(res, 201, { runId })
  } catch (error) {
    console.error('analysis run save failed', error)
    return sendJson(res, 500, { message: 'ไม่สามารถบันทึกผล AI ได้' })
  }
}
