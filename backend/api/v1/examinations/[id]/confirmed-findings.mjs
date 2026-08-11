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

    const inputs = Array.isArray(body.findings) ? body.findings : [body]
    const requested = inputs.filter((finding) => finding?.diseaseId)
    if (!requested.length) return sendJson(res, 204, null)

    const codes = [...new Set(requested.map((finding) => String(finding.diseaseId)))]
    const diseases = await supabaseRest(`/rest/v1/diseases?select=id,code,name&code=in.(${inFilter(codes)})`)
    const diseaseByCode = new Map(diseases.map((disease) => [disease.code, disease]))
    const missing = codes.filter((code) => !diseaseByCode.has(code))
    if (missing.length) return sendJson(res, 400, { message: `ไม่พบภาวะที่ยืนยัน: ${missing.join(', ')}` })

    const rows = requested.map((finding) => {
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
      body: JSON.stringify(rows),
    })
    return sendJson(res, 204, null)
  } catch (error) {
    console.error('confirmed finding save failed', error)
    return sendJson(res, 500, { message: 'ไม่สามารถบันทึกผลยืนยันได้' })
  }
}
