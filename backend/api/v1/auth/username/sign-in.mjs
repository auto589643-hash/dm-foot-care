import { handleOptions, readJsonBody, sendJson } from '../../../_lib/http.mjs'
import { setCors } from '../../../_lib/http.mjs'
import { setRefreshCookie, signInWithUsername } from '../../../_lib/supabase.mjs'

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  setCors(res)
  if (req.method !== 'POST') return sendJson(res, 405, { message: 'Method not allowed' })
  try {
    const body = await readJsonBody(req)
    const username = String(body.username || '').trim().toUpperCase()
    const pin = String(body.pin || '').trim()
    if (!/^[A-Z0-9_-]{3,32}$/.test(username) || !/^\d{4}$/.test(pin)) {
      return sendJson(res, 400, { message: 'ชื่อผู้ใช้หรือ PIN ไม่ถูกต้อง' })
    }
    const session = await signInWithUsername(username, pin)
    if (!session) return sendJson(res, 401, { message: 'ชื่อผู้ใช้หรือ PIN ไม่ถูกต้อง หรือบัญชีไม่ได้เปิดใช้งาน' })
    setRefreshCookie(res, session.refreshToken)
    const { refreshToken: _refreshToken, ...clientSession } = session
    void _refreshToken
    return sendJson(res, 200, clientSession)
  } catch (error) {
    console.error('sign-in failed', error)
    return sendJson(res, 500, { message: 'ระบบเข้าสู่ระบบขัดข้องชั่วคราว' })
  }
}
