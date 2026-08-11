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
  const startedAt = Date.now()
  const session = await requireSupabaseUser(req, res)
  if (!session) return
  try {
    const examinationId = queryParam(req, 'id')
    const body = await readJsonBody(req)
    const exam = await getOwnedExamination(session.user.id, examinationId)
    if (!exam) return sendJson(res, 404, { message: 'ไม่พบรายการตรวจ' })
    if (exam.status === 'confirmed') return sendJson(res, 200, { id: examinationId, status: 'confirmed', idempotent: true })

    const findings = Array.isArray(body.findings) ? body.findings.filter((finding) => finding?.diseaseId) : []
    const codes = [...new Set(findings.map((finding) => String(finding.diseaseId)))]
    if (codes.length) {
      const diseases = await supabaseRest(`/rest/v1/diseases?select=id,code,name&code=in.(${inFilter(codes)})`)
      const diseaseByCode = new Map(diseases.map((disease) => [disease.code, disease]))
      const missing = codes.filter((code) => !diseaseByCode.has(code))
      if (missing.length) return sendJson(res, 400, { message: `ไม่พบภาวะที่ยืนยัน: ${missing.join(', ')}` })
      const confirmedRows = findings.map((finding) => {
        const disease = diseaseByCode.get(String(finding.diseaseId))
        return {
          examination_id: examinationId,
          disease_id: disease.id,
          disease_code_snapshot: disease.code,
          disease_name_snapshot: disease.name,
          severity_label_snapshot: finding.severity || null,
          ai_finding_id: finding.aiFindingId || null,
          confirmed_by: session.user.id,
        }
      })
      await supabaseRest('/rest/v1/confirmed_findings?on_conflict=examination_id,disease_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(confirmedRows),
      })
    }

    const now = new Date().toISOString()
    const reviewChangedCount = Math.max(0, Number(body.reviewChangedCount || 0))
    const auditRows = []
    if (reviewChangedCount > 0) {
      auditRows.push({
        actor_id: session.user.id,
        event_type: 'human_review_edited',
        entity_type: 'finding',
        entity_id: examinationId,
        payload: { changedCount: reviewChangedCount },
        occurred_at: now,
      })
    }
    auditRows.push({
      actor_id: session.user.id,
      event_type: 'final_result_submitted',
      entity_type: 'examination',
      entity_id: examinationId,
      payload: { confirmedFindingCount: findings.length },
      occurred_at: now,
    })

    await Promise.all([
      supabaseRest(`/rest/v1/examinations?id=eq.${encodeURIComponent(examinationId)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'confirmed', examined_at: now }),
      }),
      supabaseRest('/rest/v1/audit_logs', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(auditRows),
      }),
    ])
    console.info(JSON.stringify({ event: 'dmfc_finalize_timing', examinationId, findingCount: findings.length, totalMs: Date.now() - startedAt }))
    return sendJson(res, 200, { id: examinationId, status: 'confirmed' })
  } catch (error) {
    console.error('examination finalize failed', error)
    return sendJson(res, 500, { message: 'ไม่สามารถยืนยันผลการตรวจได้' })
  }
}