import { handleOptions, readJsonBody, sendJson, setCors } from '../_lib/http.mjs'
import { requireSupabaseUser, supabaseRest } from '../_lib/supabase.mjs'

const eventTypes = new Set(['login', 'logout', 'examination_created', 'image_uploaded', 'ai_analysis_started', 'ai_analysis_completed', 'ai_result_recorded', 'human_review_edited', 'final_result_submitted', 'disease_master_created', 'disease_master_updated', 'user_created', 'user_updated'])
const entityTypes = new Set(['session', 'examination', 'image', 'ai_analysis', 'finding', 'disease', 'user'])

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  setCors(res)
  if (req.method !== 'POST') return sendJson(res, 405, { message: 'Method not allowed' })
  const session = await requireSupabaseUser(req, res)
  if (!session) return
  try {
    const body = await readJsonBody(req)
    if (!eventTypes.has(body.eventType) || !entityTypes.has(body.entityType)) return sendJson(res, 400, { message: 'Audit event is not allow-listed' })
    await supabaseRest('/rest/v1/audit_logs', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ actor_id: session.user.id, event_type: body.eventType, entity_type: body.entityType, entity_id: body.entityId || null, payload: body.payload || {}, occurred_at: body.occurredAt || new Date().toISOString() }) })
    return sendJson(res, 204, null)
  } catch (error) {
    console.error('audit event write failed', error)
    return sendJson(res, 500, { message: 'ไม่สามารถบันทึก audit event ได้' })
  }
}
