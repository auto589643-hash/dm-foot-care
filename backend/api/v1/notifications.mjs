import { handleOptions, readJsonBody, sendJson, setCors } from '../_lib/http.mjs'
import { requireSupabaseUser, supabaseRest } from '../_lib/supabase.mjs'

function queryParam(req, name) {
  const value = req.query?.[name]
  return Array.isArray(value) ? value[0] : value
}
function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''))
}
function mapNotification(row) {
  return {
    id: row.id,
    type: row.type,
    examinationId: row.examination_id,
    resultRevisionNo: row.result_revision_no,
    title: row.title,
    body: row.body,
    acknowledgedAt: row.acknowledged_at,
    createdAt: row.created_at,
  }
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  setCors(res)
  if (!['GET', 'PATCH', 'POST'].includes(req.method || '')) return sendJson(res, 405, { message: 'Method not allowed' })
  const session = await requireSupabaseUser(req, res)
  if (!session) return

  try {
    if (req.method === 'GET') {
      const unread = String(queryParam(req, 'unread') || 'true') !== 'false'
      const filter = unread ? '&acknowledged_at=is.null' : ''
      let rows
      try {
        rows = await supabaseRest('/rest/v1/user_notifications?select=id,type,examination_id,result_revision_no,title,body,acknowledged_at,created_at&user_id=eq.' + encodeURIComponent(session.user.id) + filter + '&order=created_at.asc,id.asc')
      } catch (error) {
        if (error?.status === 404 || /user_notifications/i.test(String(error?.message || ''))) return sendJson(res, 200, { notifications: [], schemaReady: false })
        throw error
      }
      res.setHeader('Cache-Control', 'private, no-store')
      return sendJson(res, 200, { notifications: rows.map(mapNotification), schemaReady: true })
    }

    const body = await readJsonBody(req)
    const notificationId = String(body.notificationId || queryParam(req, 'notificationId') || '')
    if (!isUuid(notificationId)) return sendJson(res, 400, { message: 'รหัสการแจ้งเตือนไม่ถูกต้อง' })

    const rows = await supabaseRest('/rest/v1/user_notifications?select=id,type,examination_id,result_revision_no,title,body,acknowledged_at,created_at&id=eq.' + encodeURIComponent(notificationId) + '&user_id=eq.' + encodeURIComponent(session.user.id) + '&limit=1')
    const notification = rows[0]
    if (!notification) return sendJson(res, 404, { message: 'ไม่พบการแจ้งเตือน' })
    if (notification.acknowledged_at) return sendJson(res, 200, { notification: mapNotification(notification), idempotent: true })

    const acknowledgedAt = new Date().toISOString()
    const updated = await supabaseRest('/rest/v1/user_notifications?id=eq.' + encodeURIComponent(notificationId) + '&user_id=eq.' + encodeURIComponent(session.user.id), {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ acknowledged_at: acknowledgedAt }),
    })
    if (!updated?.length) return sendJson(res, 404, { message: 'ไม่พบการแจ้งเตือน' })
    return sendJson(res, 200, { notification: mapNotification(updated[0]), idempotent: false })
  } catch (error) {
    console.error('notification request failed', { status: error?.status || 500 })
    return sendJson(res, 500, { message: 'ไม่สามารถโหลดหรือยืนยันการแจ้งเตือนได้' })
  }
}
