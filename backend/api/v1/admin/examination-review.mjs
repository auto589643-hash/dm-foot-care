import { handleOptions, readJsonBody, sendJson, setCors } from '../../_lib/http.mjs'
import { requireStaffUser, supabaseRest } from '../../_lib/supabase.mjs'

function queryParam(req, name) {
  const value = req.query?.[name]
  return Array.isArray(value) ? value[0] : value
}
function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''))
}
function safeNote(value) {
  return typeof value === 'string' ? value.trim().slice(0, 500) : ''
}
function normalizeInputFindings(value) {
  if (!Array.isArray(value)) return null
  const rows = value.map((item) => ({
    diseaseId: typeof item?.diseaseId === 'string' ? item.diseaseId.trim() : '',
    severity: typeof item?.severity === 'string' ? item.severity.trim() : '',
  }))
  if (rows.some((item) => !item.diseaseId || !item.severity)) return null
  if (new Set(rows.map((item) => item.diseaseId)).size !== rows.length) return null
  return rows.sort((a, b) => a.diseaseId.localeCompare(b.diseaseId))
}
function mapFinding(row) {
  return {
    diseaseId: row.disease_code_snapshot || '',
    name: row.disease_name_snapshot || 'ไม่ระบุภาวะ',
    detected: row.detected ?? true,
    severity: row.suggested_severity_label_snapshot || row.severity_label_snapshot || 'เล็กน้อย',
    imagePosition: row.image_position || null,
  }
}

async function loadReviewDetail(examinationId) {
  const exams = await supabaseRest('/rest/v1/examinations?select=id,user_id,status,examined_at,created_at&id=eq.' + encodeURIComponent(examinationId) + '&limit=1')
  const exam = exams[0]
  if (!exam) return null

  const [runs, currentRows, revisions] = await Promise.all([
    supabaseRest('/rest/v1/ai_analysis_runs?select=id,created_at,completed_at&examination_id=eq.' + encodeURIComponent(examinationId) + '&status=eq.validated&order=completed_at.desc.nullslast,created_at.desc&limit=1'),
    supabaseRest('/rest/v1/confirmed_findings?select=disease_code_snapshot,disease_name_snapshot,severity_label_snapshot,confirmed_at&examination_id=eq.' + encodeURIComponent(examinationId) + '&order=disease_code_snapshot'),
    supabaseRest('/rest/v1/result_revisions?select=id,revision_no,reviewed_findings,change_set,review_note,reviewed_by,created_at&examination_id=eq.' + encodeURIComponent(examinationId) + '&order=revision_no.desc'),
  ])
  const run = runs[0] || null
  const aiRows = run
    ? await supabaseRest('/rest/v1/ai_findings?select=id,disease_code_snapshot,disease_name_snapshot,detected,suggested_severity_label_snapshot,image_position&run_id=eq.' + encodeURIComponent(run.id) + '&order=disease_code_snapshot')
    : []
  const reviewerIds = [...new Set(revisions.map((row) => row.reviewed_by).filter(Boolean))]
  const reviewerProfiles = reviewerIds.length
    ? await supabaseRest('/rest/v1/profiles?select=user_id,username,display_name&user_id=in.(' + reviewerIds.map(encodeURIComponent).join(',') + ')')
    : []
  const reviewerById = new Map(reviewerProfiles.map((row) => [row.user_id, row.display_name || row.username || 'เจ้าหน้าที่']))

  return {
    examinationId: exam.id,
    status: exam.status,
    currentRevision: revisions[0]?.revision_no || 0,
    originalAiFindings: aiRows.map(mapFinding),
    currentFindings: currentRows.map(mapFinding),
    revisions: revisions.map((row) => ({
      id: row.id,
      revisionNo: row.revision_no,
      reviewedFindings: Array.isArray(row.reviewed_findings) ? row.reviewed_findings : [],
      changeSet: row.change_set || {},
      reviewNote: row.review_note || '',
      reviewedBy: reviewerById.get(row.reviewed_by) || 'เจ้าหน้าที่',
      createdAt: row.created_at,
    })),
  }
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  setCors(res)
  if (!['GET', 'POST'].includes(req.method || '')) return sendJson(res, 405, { message: 'Method not allowed' })
  const session = await requireStaffUser(req, res)
  if (!session) return

  const examinationId = String(queryParam(req, 'examinationId') || '')
  if (!isUuid(examinationId)) return sendJson(res, 400, { message: 'รหัสรายการตรวจไม่ถูกต้อง' })

  try {
    if (req.method === 'GET') {
      const detail = await loadReviewDetail(examinationId)
      if (!detail) return sendJson(res, 404, { message: 'ไม่พบรายการตรวจ' })
      res.setHeader('Cache-Control', 'private, no-store')
      return sendJson(res, 200, detail)
    }

    const body = await readJsonBody(req)
    const findings = normalizeInputFindings(body.findings)
    const expectedCurrentRevision = Number(body.expectedCurrentRevision)
    const requestId = typeof body.requestId === 'string' ? body.requestId.trim() : ''
    if (!findings || !Number.isInteger(expectedCurrentRevision) || expectedCurrentRevision < 0 || requestId.length < 8 || requestId.length > 200) {
      return sendJson(res, 400, { message: 'ข้อมูลการตรวจทานไม่ถูกต้อง' })
    }

    let result
    try {
      result = await supabaseRest('/rest/v1/rpc/create_reviewed_result_revision', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          p_examination_id: examinationId,
          p_expected_current_revision: expectedCurrentRevision,
          p_reviewed_findings: findings,
          p_review_note: safeNote(body.reviewNote),
          p_reviewed_by: session.user.id,
          p_request_key: requestId,
        }),
      })
    } catch (error) {
      const stale = String(error?.message || '').match(/STALE_REVISION:(\d+)/)
      if (stale) return sendJson(res, 409, { message: 'ผลตรวจถูกแก้ไขโดยเจ้าหน้าที่อีกคน กรุณาโหลดข้อมูลล่าสุด', currentRevision: Number(stale[1]) })
      if (error?.status === 404 || /create_reviewed_result_revision|result_revisions/i.test(String(error?.message || ''))) {
        return sendJson(res, 503, { message: 'ระบบตรวจทานผลยังไม่พร้อม กรุณาติดต่อผู้ดูแลระบบ' })
      }
      throw error
    }

    const detail = await loadReviewDetail(examinationId)
    return sendJson(res, 200, { ...result, detail })
  } catch (error) {
    console.error('staff examination review failed', { status: error?.status || 500 })
    return sendJson(res, 500, { message: 'ไม่สามารถบันทึกการตรวจทานผลได้' })
  }
}
