import { handleOptions, readJsonBody, sendJson, setCors } from '../_lib/http.mjs'
import { requireSupabaseUser, supabaseConfig, supabaseRest } from '../_lib/supabase.mjs'
import { listCommittedResultRevisionsForExaminations, notificationFromRevision, revisionPayloadForServer } from '../_lib/result-revisions.mjs'

function queryParam(req, name) {
  const value = req.query?.[name]
  return Array.isArray(value) ? value[0] : value
}
function isAuditId(value) {
  return /^\d+$/.test(String(value || ''))
}
async function authAdminUser(userId) {
  const { url, serviceKey } = supabaseConfig()
  const response = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error('ไม่สามารถอ่านสถานะการแจ้งเตือนได้')
    error.status = response.status
    throw error
  }
  return payload?.user || payload
}
async function saveAcknowledgement(user, examinationId, revisionNo, acknowledgedAt) {
  const { url, serviceKey } = supabaseConfig()
  const currentMetadata = user?.app_metadata && typeof user.app_metadata === 'object' ? user.app_metadata : {}
  const currentAck = currentMetadata.dmfc_result_revision_ack && typeof currentMetadata.dmfc_result_revision_ack === 'object'
    ? currentMetadata.dmfc_result_revision_ack
    : {}
  const existing = currentAck[examinationId]
  const existingRevision = Number(existing?.revisionNo) || 0
  if (existingRevision >= revisionNo) return { acknowledgedAt: existing?.acknowledgedAt || acknowledgedAt, idempotent: true }

  const appMetadata = {
    ...currentMetadata,
    dmfc_result_revision_ack: {
      ...currentAck,
      [examinationId]: { revisionNo, acknowledgedAt },
    },
  }
  const response = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(user.id)}`, {
    method: 'PUT',
    headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ app_metadata: appMetadata }),
  })
  if (!response.ok) {
    const error = new Error('ไม่สามารถยืนยันการแจ้งเตือนได้')
    error.status = response.status
    throw error
  }
  return { acknowledgedAt, idempotent: false }
}
function acknowledgementMap(user) {
  const value = user?.app_metadata?.dmfc_result_revision_ack
  return value && typeof value === 'object' ? value : {}
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  setCors(res)
  if (!['GET', 'PATCH', 'POST'].includes(req.method || '')) return sendJson(res, 405, { message: 'Method not allowed' })
  const session = await requireSupabaseUser(req, res)
  if (!session) return

  try {
    const user = await authAdminUser(session.user.id)
    if (req.method === 'GET') {
      const unreadOnly = String(queryParam(req, 'unread') || 'true') !== 'false'
      const examinations = await supabaseRest(`/rest/v1/examinations?select=id&user_id=eq.${encodeURIComponent(session.user.id)}&status=eq.confirmed&order=examined_at.desc.nullslast,created_at.desc`)
      const revisions = await listCommittedResultRevisionsForExaminations(examinations.map((row) => row.id))
      const ack = acknowledgementMap(user)
      const notifications = revisions.flatMap((row) => {
        const payload = revisionPayloadForServer(row)
        const examinationId = String(payload.examinationId || row.entity_id || '')
        if (String(payload.patientUserId || '') !== session.user.id) return []
        const ackEntry = ack[examinationId]
        const ackRevision = Number(ackEntry?.revisionNo) || 0
        const revisionNo = Number(payload.revisionNo) || 0
        if (unreadOnly && revisionNo <= ackRevision) return []
        return [notificationFromRevision(row, revisionNo <= ackRevision ? ackEntry?.acknowledgedAt || null : null)]
      })
      notifications.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || Number(a.id) - Number(b.id))
      res.setHeader('Cache-Control', 'private, no-store')
      return sendJson(res, 200, { notifications, schemaReady: true })
    }

    const body = await readJsonBody(req)
    const notificationId = String(body.notificationId || queryParam(req, 'notificationId') || '')
    if (!isAuditId(notificationId)) return sendJson(res, 400, { message: 'รหัสการแจ้งเตือนไม่ถูกต้อง' })

    const rows = await supabaseRest(`/rest/v1/audit_logs?select=id,entity_id,payload,occurred_at&id=eq.${encodeURIComponent(notificationId)}&event_type=eq.human_review_edited&entity_type=eq.examination&limit=1`)
    const revision = rows[0]
    if (!revision) return sendJson(res, 404, { message: 'ไม่พบการแจ้งเตือน' })
    const payload = revisionPayloadForServer(revision)
    if (payload.kind !== 'staff_result_revision_v1' || payload.state !== 'committed') return sendJson(res, 404, { message: 'ไม่พบการแจ้งเตือน' })

    const examinationId = String(payload.examinationId || revision.entity_id || '')
    const owned = await supabaseRest(`/rest/v1/examinations?select=id&id=eq.${encodeURIComponent(examinationId)}&user_id=eq.${encodeURIComponent(session.user.id)}&limit=1`)
    if (!owned[0] || String(payload.patientUserId || '') !== session.user.id) return sendJson(res, 404, { message: 'ไม่พบการแจ้งเตือน' })

    const revisionNo = Number(payload.revisionNo) || 0
    const existing = acknowledgementMap(user)[examinationId]
    if ((Number(existing?.revisionNo) || 0) >= revisionNo) {
      return sendJson(res, 200, { notification: notificationFromRevision(revision, existing?.acknowledgedAt || null), idempotent: true })
    }

    const acknowledgedAt = new Date().toISOString()
    const saved = await saveAcknowledgement(user, examinationId, revisionNo, acknowledgedAt)
    return sendJson(res, 200, { notification: notificationFromRevision(revision, saved.acknowledgedAt), idempotent: saved.idempotent })
  } catch (error) {
    console.error('notification request failed', { status: error?.status || 500 })
    return sendJson(res, 500, { message: 'ไม่สามารถโหลดหรือยืนยันการแจ้งเตือนได้' })
  }
}
