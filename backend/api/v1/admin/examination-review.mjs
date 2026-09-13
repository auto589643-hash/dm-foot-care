import { handleOptions, readJsonBody, sendJson, setCors } from '../../_lib/http.mjs'
import { requireStaffUser } from '../../_lib/supabase.mjs'
import { createReviewedResultRevision, loadResultReviewDetail } from '../../_lib/result-revisions.mjs'

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
      const detail = await loadResultReviewDetail(examinationId)
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

    const result = await createReviewedResultRevision({
      examinationId,
      expectedCurrentRevision,
      findings,
      reviewNote: safeNote(body.reviewNote),
      reviewerId: session.user.id,
      requestKey: requestId,
    })
    const detail = await loadResultReviewDetail(examinationId)
    return sendJson(res, 200, { ...result, detail })
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : 500
    if (status >= 500) console.error('staff examination review failed', { status })
    return sendJson(res, status, {
      message: status >= 500 ? 'ไม่สามารถบันทึกการตรวจทานผลได้' : error.message,
      ...(Number.isInteger(error?.currentRevision) ? { currentRevision: error.currentRevision } : {}),
    })
  }
}
