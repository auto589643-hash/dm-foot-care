import { handleOptions, readJsonBody, sendJson, setCors } from '../../_lib/http.mjs'
import { requireAdminUser, supabaseRest } from '../../_lib/supabase.mjs'

const USERNAME_PATTERN = /^[A-Z0-9_-]{3,32}$/
const PIN_PATTERN = /^\d{4}$/
const ACCOUNT_STATUSES = new Set(['pending', 'active', 'inactive'])

function badRequest(message) {
  const error = new Error(message)
  error.status = 400
  return error
}

function validateDate(value) {
  const date = new Date(`${value}T00:00:00Z`)
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && date <= new Date()
}

async function updateUser(userId, body, action) {
  if (action === 'status') {
    const status = String(body.status || '')
    if (!ACCOUNT_STATUSES.has(status)) throw badRequest('สถานะผู้ใช้ไม่ถูกต้อง')
    await supabaseRest(`/rest/v1/profiles?user_id=eq.${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ account_status: status, updated_at: new Date().toISOString() }),
    })
    return { status }
  }

  const patch = {}
  if ('username' in body) {
    const username = String(body.username || '').trim().toUpperCase()
    if (!USERNAME_PATTERN.test(username)) throw badRequest('Username ไม่ถูกต้อง')
    patch.username = username
  }
  if ('name' in body) {
    const displayName = String(body.name || '').trim()
    if (!displayName || displayName.length > 160) throw badRequest('ชื่อ-นามสกุลไม่ถูกต้อง')
    patch.display_name = displayName
  }
  if ('dateOfBirth' in body) {
    const dateOfBirth = String(body.dateOfBirth || '').trim()
    if (!validateDate(dateOfBirth)) throw badRequest('วันเดือนปีเกิดไม่ถูกต้อง')
    patch.date_of_birth = dateOfBirth
  }
  if ('occupation' in body) {
    const occupation = String(body.occupation || '').trim()
    if (!occupation || occupation.length > 160) throw badRequest('อาชีพไม่ถูกต้อง')
    patch.occupation = occupation
  }
  if ('status' in body) {
    const status = String(body.status || '')
    if (!ACCOUNT_STATUSES.has(status)) throw badRequest('สถานะผู้ใช้ไม่ถูกต้อง')
    patch.account_status = status
  }
  if (body.pin) {
    const pin = String(body.pin)
    if (!PIN_PATTERN.test(pin)) throw badRequest('PIN ต้องเป็นตัวเลข 4 หลัก')
    patch.pin_hash = await supabaseRest('/rest/v1/rpc/hash_dmfc_pin', { method: 'POST', body: JSON.stringify({ p_pin: pin }) })
  }
  patch.updated_at = new Date().toISOString()
  const profiles = await supabaseRest(`/rest/v1/profiles?user_id=eq.${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(patch),
  })
  if (!profiles[0]) {
    const error = new Error('ไม่พบบัญชีผู้ใช้')
    error.status = 404
    throw error
  }
  return profiles[0]
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  setCors(res)
  try {
    const session = await requireAdminUser(req, res)
    if (!session) return
    if (req.method !== 'PATCH') return sendJson(res, 405, { message: 'Method not allowed' })
    const userId = String(req.query?.userId || '')
    if (!userId) return sendJson(res, 400, { message: 'ไม่พบรหัสผู้ใช้' })
    const result = await updateUser(userId, await readJsonBody(req), String(req.query?.action || ''))
    return sendJson(res, 200, { ok: true, result })
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 500
    if (status >= 500) console.error('admin user update failed', error)
    return sendJson(res, status, { message: status >= 500 ? 'ไม่สามารถแก้ไขบัญชีผู้ใช้ได้' : error.message })
  }
}
