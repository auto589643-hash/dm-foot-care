import { handleOptions, readJsonBody, sendJson, setCors } from '../../_lib/http.mjs'
import { internalAuthEmail, internalAuthPassword, supabaseConfig, supabaseRest } from '../../_lib/supabase.mjs'

const USERNAME_PATTERN = /^[A-Z0-9_-]{3,32}$/
const PIN_PATTERN = /^\d{4}$/

function badRequest(message) {
  const error = new Error(message)
  error.status = 400
  return error
}

function conflict(message) {
  const error = new Error(message)
  error.status = 409
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

async function listAuthUsers() {
  const { url, serviceKey } = supabaseConfig()
  const response = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=1000`, {
    headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error('ไม่สามารถตรวจสอบบัญชีเดิมได้')
    error.status = response.status
    throw error
  }
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.users)) return payload.users
  return []
}

async function findAuthUserByEmail(email) {
  const target = email.toLowerCase()
  const users = await listAuthUsers()
  return users.find((user) => String(user?.email || '').toLowerCase() === target) || null
}

async function createAuthUser(username) {
  const { url, serviceKey } = supabaseConfig()
  const response = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      email: internalAuthEmail(username),
      password: internalAuthPassword(username),
      email_confirm: true,
      user_metadata: { username },
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

async function createOrRecoverAuthUser(username) {
  try {
    return { user: await createAuthUser(username), created: true, recovered: false }
  } catch (error) {
    if (error?.status !== 409) throw error

    // A previous profile cleanup can leave an Auth identity behind. Reuse only
    // when the identity has no application profile; otherwise this is a real
    // duplicate username and registration must remain blocked.
    const existingAuthUser = await findAuthUserByEmail(internalAuthEmail(username))
    if (!existingAuthUser?.id) throw error

    const linkedProfiles = await supabaseRest(`/rest/v1/profiles?select=user_id,username&user_id=eq.${encodeURIComponent(existingAuthUser.id)}&limit=1`)
    if (linkedProfiles.length) throw conflict('Username นี้ถูกใช้งานแล้ว')

    const linkedRoles = await supabaseRest(`/rest/v1/user_roles?select=role&user_id=eq.${encodeURIComponent(existingAuthUser.id)}&limit=1`)
    if (linkedRoles[0]?.role === 'admin') throw conflict('บัญชีนี้ต้องให้ผู้ดูแลระบบตรวจสอบ')

    // Repair recovered identities to the same server-only credential mapping
    // used by normal sign-in, so the first approved login does not need an
    // additional Auth admin password update.
    const { url, serviceKey } = supabaseConfig()
    await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(existingAuthUser.id)}`, {
      method: 'PUT',
      headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ password: internalAuthPassword(username), email_confirm: true }),
    })

    return { user: existingAuthUser, created: false, recovered: true }
  }
}

async function deleteAuthUser(userId) {
  const { url, serviceKey } = supabaseConfig()
  await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
  })
}

async function cleanupApplicationRows(userId) {
  await supabaseRest(`/rest/v1/user_roles?user_id=eq.${encodeURIComponent(userId)}`, { method: 'DELETE' }).catch(() => {})
  await supabaseRest(`/rest/v1/profiles?user_id=eq.${encodeURIComponent(userId)}`, { method: 'DELETE' }).catch(() => {})
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  setCors(res)
  if (req.method !== 'POST') return sendJson(res, 405, { message: 'Method not allowed' })

  let authUser = null
  let createdAuthUser = false
  let applicationRowsStarted = false

  try {
    const input = normalizeInput(await readJsonBody(req))
    const existing = await supabaseRest(`/rest/v1/profiles?select=user_id&username=eq.${encodeURIComponent(input.username)}&limit=1`)
    if (existing.length) return sendJson(res, 409, { message: 'Username นี้ถูกใช้งานแล้ว' })

    const authResult = await createOrRecoverAuthUser(input.username)
    authUser = authResult.user
    createdAuthUser = authResult.created

    const pinHash = await supabaseRest('/rest/v1/rpc/hash_dmfc_pin', {
      method: 'POST',
      body: JSON.stringify({ p_pin: input.pin }),
    })

    applicationRowsStarted = true
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

    await supabaseRest('/rest/v1/user_roles?on_conflict=user_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ user_id: authUser.id, role: 'user' }),
    })

    return sendJson(res, 201, {
      ok: true,
      status: 'pending',
      recovered: authResult.recovered,
      message: 'ลงทะเบียนสำเร็จ กรุณารอผู้ดูแลระบบอนุมัติบัญชี',
    })
  } catch (error) {
    if (applicationRowsStarted && authUser?.id) await cleanupApplicationRows(authUser.id)
    if (createdAuthUser && authUser?.id) await deleteAuthUser(authUser.id).catch(() => {})
    const status = Number.isInteger(error.status) ? error.status : 500
    if (status >= 500) console.error('registration failed', error)
    return sendJson(res, status, { message: status >= 500 ? 'ระบบลงทะเบียนขัดข้องชั่วคราว' : error.message })
  }
}
