import { handleOptions, readJsonBody, sendJson, setCors } from '../../_lib/http.mjs'
import { internalAuthEmail, internalAuthPassword, requireAdminUser, supabaseConfig, supabaseRest } from '../../_lib/supabase.mjs'

const USERNAME_PATTERN = /^[A-Z0-9_-]{3,32}$/
const PIN_PATTERN = /^\d{4}$/

function ageFromDate(value) {
  const birth = new Date(`${value}T00:00:00Z`)
  const today = new Date()
  let age = today.getUTCFullYear() - birth.getUTCFullYear()
  if (today.getUTCMonth() < birth.getUTCMonth() || (today.getUTCMonth() === birth.getUTCMonth() && today.getUTCDate() < birth.getUTCDate())) age -= 1
  return Math.max(0, age)
}

function toUserRecord(profile, lastExam = null) {
  return {
    id: profile.user_id,
    username: profile.username,
    name: profile.display_name || profile.username,
    dateOfBirth: profile.date_of_birth,
    age: ageFromDate(profile.date_of_birth),
    occupation: profile.occupation || '',
    sex: profile.sex || undefined,
    diabetesYears: profile.diabetes_years == null ? null : Number(profile.diabetes_years),
    latestHba1c: profile.latest_hba1c == null ? null : Number(profile.latest_hba1c),
    pinConfigured: Boolean(profile.pin_hash),
    status: profile.account_status,
    lastExam: lastExam ? String(lastExam).slice(0, 10) : 'ยังไม่มีประวัติ',
  }
}

function badRequest(message) {
  const error = new Error(message)
  error.status = 400
  return error
}

function normalizeCreateInput(body) {
  const username = String(body.username || '').trim().toUpperCase()
  const name = String(body.name || '').trim()
  const dateOfBirth = String(body.dateOfBirth || '').trim()
  const occupation = String(body.occupation || '').trim()
  const sexRaw = String(body.sex || '').trim()
  const sex = sexRaw && ['male', 'female', 'other', 'prefer_not_to_say'].includes(sexRaw) ? sexRaw : null
  const diabetesYears = body.diabetesYears === '' || body.diabetesYears == null ? null : Number(body.diabetesYears)
  const latestHba1c = body.latestHba1c === '' || body.latestHba1c == null ? null : Number(body.latestHba1c)
  const status = ['pending', 'inactive', 'active'].includes(body.status) ? body.status : ''
  const pin = String(body.pin || '')
  if (!USERNAME_PATTERN.test(username)) throw badRequest('Username ต้องมี 3-32 ตัวอักษร และใช้ A-Z, 0-9, _ หรือ - เท่านั้น')
  if (!name || name.length > 160) throw badRequest('กรุณาระบุชื่อ-นามสกุล')
  if (!occupation || occupation.length > 160) throw badRequest('กรุณาระบุอาชีพ')
  if (sexRaw && !sex) throw badRequest('เพศไม่ถูกต้อง')
  if (diabetesYears != null && (!Number.isInteger(diabetesYears) || diabetesYears < 0 || diabetesYears > 100)) throw badRequest('จำนวนปีที่เป็นเบาหวานไม่ถูกต้อง')
  if (latestHba1c != null && (!Number.isFinite(latestHba1c) || latestHba1c <= 0 || latestHba1c > 30)) throw badRequest('HbA1c ล่าสุดไม่ถูกต้อง')
  if (!PIN_PATTERN.test(pin)) throw badRequest('PIN ต้องเป็นตัวเลข 4 หลัก')
  if (!status) throw badRequest('สถานะผู้ใช้ไม่ถูกต้อง')
  const date = new Date(`${dateOfBirth}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateOfBirth || date > new Date()) {
    throw badRequest('วันเดือนปีเกิดไม่ถูกต้อง')
  }
  return { username, name, dateOfBirth, occupation, sex, diabetesYears, latestHba1c, status, pin }
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
    const error = new Error(payload?.msg || payload?.message || 'ไม่สามารถสร้างบัญชีผู้ใช้ได้')
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

export async function listUsers(sourceRows) {
  const [profiles, examinations, roles] = sourceRows
    ? [sourceRows.profiles, sourceRows.examinations, sourceRows.roles]
    : await Promise.all([
      supabaseRest('/rest/v1/profiles?select=user_id,username,display_name,date_of_birth,occupation,sex,diabetes_years,latest_hba1c,account_status,pin_hash&order=username'),
      supabaseRest('/rest/v1/examinations?select=user_id,examined_at,created_at&order=created_at.desc'),
      supabaseRest('/rest/v1/user_roles?select=user_id,role'),
    ])
  const userIds = new Set(roles.filter((item) => item.role === 'user' || item.role === 'patient').map((item) => item.user_id))
  const latestByUser = new Map()
  for (const row of examinations) if (!latestByUser.has(row.user_id)) latestByUser.set(row.user_id, row.examined_at || row.created_at)
  return profiles.filter((profile) => userIds.has(profile.user_id)).map((profile) => toUserRecord(profile, latestByUser.get(profile.user_id)))
}

async function createUser(body) {
  const input = normalizeCreateInput(body)
  const authUser = await createAuthUser(input.username)
  try {
    const pinHash = await supabaseRest('/rest/v1/rpc/hash_dmfc_pin', {
      method: 'POST',
      body: JSON.stringify({ p_pin: input.pin }),
    })
    const profiles = await supabaseRest('/rest/v1/profiles', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        user_id: authUser.id,
        username: input.username,
        display_name: input.name,
        date_of_birth: input.dateOfBirth,
        occupation: input.occupation,
        sex: input.sex,
        diabetes_years: input.diabetesYears,
        latest_hba1c: input.latestHba1c,
        account_status: input.status,
        pin_hash: pinHash,
      }),
    })
    await supabaseRest('/rest/v1/user_roles', {
      method: 'POST',
      body: JSON.stringify({ user_id: authUser.id, role: 'user' }),
    })
    return toUserRecord(profiles[0])
  } catch (error) {
    await deleteAuthUser(authUser.id).catch(() => {})
    throw error
  }
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  setCors(res)
  try {
    const session = await requireAdminUser(req, res)
    if (!session) return
    if (req.method === 'GET') return sendJson(res, 200, { users: await listUsers() })
    if (req.method === 'POST') return sendJson(res, 201, { user: await createUser(await readJsonBody(req)) })
    return sendJson(res, 405, { message: 'Method not allowed' })
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 500
    if (status >= 500) console.error('admin users failed', error)
    return sendJson(res, status, { message: status === 500 ? 'ไม่สามารถบันทึกข้อมูลผู้ใช้งานได้' : error.message })
  }
}
