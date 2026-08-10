import { handleOptions, sendJson, setCors } from '../../_lib/http.mjs'
import { loadProfileForUser, refreshSupabaseSession, requireSupabaseUser, setRefreshCookie, supabaseRest } from '../../_lib/supabase.mjs'

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  setCors(res)
  if (req.method !== 'GET') return sendJson(res, 405, { message: 'Method not allowed' })
  try {
    const hasBearer = String(req.headers.authorization || '').startsWith('Bearer ')
    const session = hasBearer ? await requireSupabaseUser(req, res) : await refreshSupabaseSession(req)
    if (!session) {
      if (!hasBearer) return sendJson(res, 401, { message: 'ไม่พบ session หรือ session หมดอายุ' })
      return
    }
    const profile = await loadProfileForUser(session.user.id)
    const records = await supabaseRest(`/rest/v1/profiles?select=account_status&user_id=eq.${encodeURIComponent(session.user.id)}&limit=1`)
    if (!profile || records[0]?.account_status !== 'active') return sendJson(res, 403, { message: 'บัญชียังไม่ได้รับอนุมัติหรือถูกปิดใช้งาน' })
    if ('refreshToken' in session) setRefreshCookie(res, session.refreshToken)
    return sendJson(res, 200, { accessToken: session.token, profile })
  } catch (error) {
    console.error('session failed', error)
    return sendJson(res, 500, { message: 'ไม่สามารถตรวจสอบ session ได้' })
  }
}
