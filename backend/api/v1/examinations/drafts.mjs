import { handleOptions, readJsonBody, sendJson, setCors } from '../../_lib/http.mjs'
import { requireSupabaseUser, supabaseRest } from '../../_lib/supabase.mjs'

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  setCors(res)
  if (req.method !== 'POST') return sendJson(res, 405, { message: 'Method not allowed' })
  try {
    const session = await requireSupabaseUser(req, res)
    if (!session) return
    await readJsonBody(req)
    const rows = await supabaseRest('/rest/v1/examinations', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ user_id: session.user.id, status: 'draft' }),
    })
    const examination = rows?.[0]
    if (!examination) return sendJson(res, 502, { message: 'ไม่สามารถสร้างรายการตรวจได้' })
    return sendJson(res, 201, { id: examination.id, userId: examination.user_id, status: examination.status })
  } catch (error) {
    console.error('draft creation failed', error)
    return sendJson(res, error.status === 409 ? 409 : 500, { message: 'ไม่สามารถสร้างรายการตรวจใหม่ได้' })
  }
}
