import crypto from 'node:crypto'
import { handleOptions, readJsonBody, sendJson, setCors } from '../../_lib/http.mjs'
import { supabaseConfig, supabaseRest } from '../../_lib/supabase.mjs'

const USERNAME_PATTERN = /^[A-Z0-9_-]{3,32}$/
const PIN_PATTERN = /^\d{4}$/

function badRequest(message) {
  const error = new Error(message)
  error.status = 400
  return error
}

function normalizeInput(body) {
  const username = String(body.username || '').trim().toUpperCase()
  const displayName = String(body.displayName || '').trim()
  const dateOfBirth = String(body.dateOfBirth || '').trim()
  const occupation = String(body.occupation || '').trim()
  const pin = String(body.pin || '').trim()
  if (!USERNAME_PATTERN.test(username)) throw badRequest('Username ต้องมี 3-32 ตัวอักษร และใช้ A-Z, 0-9, _ หรือ - เท่านั้น')
  if (!displayName || displayName.length > 160) throw badRequest('กรุณาระบุชื่อ-นามสกุล')
  if (!occupation || occupation.length > 160) throw badRequest('กรุณาระบุอาชีพ')
  if (!PIN_PATTERN.test(pin)) throw badRequest('PIN ต้องเป็นตัวเลข 4 หลัก')
  const date = new Date(`${dateOfBirth}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateOfBirth || date > new Date()) {
    throw badRequest('วันเดือนปีเกิดไม่ถูกต้อง')
  }
  return { username, displayName, dateOfBirth, occupation, pin }
}

async function createAuthUser(username) {
  const { url, serviceKey } = supabaseConfig()
  const response = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      email: `${username.toLowerCase()}@dmfc.local`,
      password: crypto.randomBytes(32).toString('base64url'),
      email_confirm: true,
    }),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(response.status === 422 ? 'Username นี้ถูกใช้งานแล้ว' : 'ไม่สามารถสร้างบัญชีได้')
    error.status = response.status === 422 ? 409 : response.status
    throw error
  }
  const user = payload?.user || payload
  if (!user?.id) throw new Error('Supabase ไม่ได้ส่งรหัสผู้ใช้กลับมา')
  return user
}

async function deleteAuthUser(userId) {
  const { url, serviceKey } = supabaseConfig()
  await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
  })
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  setCors(res)
  if (req.method !== 'POST') return sendJson(res, 405, { message: 'Method not allowed' })
  let authUser = null
  try {
    const input = normalizeInput(await readJsonBody(req))
    const existing = await supabaseRest(`/rest/v1/profiles?select=user_id&username=eq.${encodeURIComponent(input.username)}&limit=1`)
    if (existing.length) return sendJson(res, 409, { message: 'Username นี้ถูกใช้งานแล้ว' })
    authUser = await createAuthUser(input.username)
    const pinHash = await supabaseRest('/rest/v1/rpc/hash_dmfc_pin', {
      method: 'POST',
      body: JSON.stringify({ p_pin: input.pin }),
    })
    await supabaseRest('/rest/v1/profiles', {
      method: 'POST',
      body: JSON.stringify({
        user_id: authUser.id,
        username: input.username,
        display_name: input.displayName,
        date_of_birth: input.dateOfBirth,
        occupation: input.occupation,
        account_status: 'pending',
        pin_hash: pinHash,
      }),
    })
    await supabaseRest('/rest/v1/user_roles', {
      method: 'POST',
      body: JSON.stringify({ user_id: authUser.id, role: 'user' }),
    })
    return sendJson(res, 201, { ok: true, status: 'pending', message: 'ลงทะเบียนสำเร็จ กรุณารอผู้ดูแลระบบอนุมัติบัญชี' })
  } catch (error) {
    if (authUser?.id) await deleteAuthUser(authUser.id).catch(() => {})
    const status = Number.isInteger(error.status) ? error.status : 500
    if (status >= 500) console.error('registration failed', error)
    return sendJson(res, status, { message: status >= 500 ? 'ระบบลงทะเบียนขัดข้องชั่วคราว' : error.message })
  }
}
