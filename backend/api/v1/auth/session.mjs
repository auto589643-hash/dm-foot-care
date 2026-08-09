import { handleOptions, sendJson, setCors } from '../../_lib/http.mjs'
import { loadProfileForUser, requireSupabaseUser } from '../../_lib/supabase.mjs'

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  setCors(res)
  if (req.method !== 'GET') return sendJson(res, 405, { message: 'Method not allowed' })
  try {
    const session = await requireSupabaseUser(req, res)
    if (!session) return
    const profile = await loadProfileForUser(session.user.id)
    if (!profile) return sendJson(res, 403, { message: 'ไม่พบ profile ของผู้ใช้' })
    return sendJson(res, 200, { profile })
  } catch (error) {
    console.error('session failed', error)
    return sendJson(res, 500, { message: 'ไม่สามารถตรวจสอบ session ได้' })
  }
}
