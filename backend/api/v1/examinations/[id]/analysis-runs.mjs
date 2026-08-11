import { handleOptions, readJsonBody, sendJson, setCors } from '../../../_lib/http.mjs'
import { getOwnedExamination, queryParam } from '../../../_lib/examinations.mjs'
import { requireSupabaseUser, supabaseRest } from '../../../_lib/supabase.mjs'

function inFilter(values) {
  return values.map((value) => encodeURIComponent(String(value))).join(',')
}

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

    const rows = await supabaseRest('/rest/v1/ai_analysis_runs', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        examination_id: examinationId,
        idempotency_key: String(body.idempotencyKey || ''),
        provider: String(body.provider || 'gemini'),
        model: String(body.model || 'gemini-2.5-flash'),
        disease_master_revision: Number(body.diseaseMasterRevision || 1),
        status: body.validation?.status === 'accepted' ? 'validated' : 'failed',
        raw_result: body.rawResult || {},
        validation_errors: body.validation?.rejectedItems || [],
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      }),
    })
    const runId = rows?.[0]?.id || body.runId
    const rawFindings = Array.isArray(body.validation?.findings) ? body.validation.findings.filter((finding) => finding?.diseaseId) : []
    if (!rawFindings.length) return sendJson(res, 201, { runId })

    const diseaseIds = [...new Set(rawFindings.map((finding) => String(finding.diseaseId)))]
    const diseases = await supabaseRest(`/rest/v1/diseases?select=id,code,name&id=in.(${inFilter(diseaseIds)})`)
    const diseaseById = new Map(diseases.map((disease) => [disease.id, disease]))
    const knownDiseaseIds = diseases.map((disease) => disease.id)
    const severityRows = knownDiseaseIds.length
      ? await supabaseRest(`/rest/v1/disease_severity_levels?select=id,disease_id,label&disease_id=in.(${inFilter(knownDiseaseIds)})`)
      : []
    const severityByDiseaseAndLabel = new Map(severityRows.map((level) => [`${level.disease_id}:${level.label}`, level.id]))

    const findingRows = rawFindings.flatMap((finding) => {
      const disease = diseaseById.get(String(finding.diseaseId))
      if (!disease) return []
      const positions = Array.isArray(finding.imagePositions) ? finding.imagePositions : []
      const severityLabel = finding.suggestedSeverity ? String(finding.suggestedSeverity) : null
      return [{
        run_id: runId,
        disease_id: disease.id,
        disease_code_snapshot: disease.code,
        disease_name_snapshot: disease.name,
        detected: Boolean(finding.detected),
        suggested_severity_id: severityLabel ? severityByDiseaseAndLabel.get(`${disease.id}:${severityLabel}`) || null : null,
        suggested_severity_label_snapshot: severityLabel,
        confidence: typeof finding.confidence === 'number' ? finding.confidence : null,
        image_position: positions[0] ? String(positions[0]).replace('-', '_') : null,
      }]
    })

    if (findingRows.length) {
      await supabaseRest('/rest/v1/ai_findings', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(findingRows),
      })
    }
    return sendJson(res, 201, { runId })
  } catch (error) {
    console.error('analysis run save failed', error)
    return sendJson(res, 500, { message: 'ไม่สามารถบันทึกผล AI ได้' })
  }
}
