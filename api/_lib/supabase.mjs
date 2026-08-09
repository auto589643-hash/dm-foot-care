import crypto from 'node:crypto'
import { sendJson } from './http.mjs'

function config() {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '')
  const serviceKey = process.env.SUPABASE_SECRET_KEY || ''
  const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || ''
  if (!url || !serviceKey || !publishableKey) throw new Error('Supabase server variables are not configured')
  return { url, serviceKey, publishableKey }
}

export async function requireSupabaseUser(req, res) {
  const authorization = req.headers.authorization || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length).trim() : ''
  if (!token) {
    sendJson(res, 401, { message: 'Authorization bearer token is required' })
    return null
  }
  const { url, publishableKey } = config()
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: publishableKey, authorization: `Bearer ${token}` },
  })
  if (!response.ok) {
    sendJson(res, 401, { message: 'Invalid or expired session' })
    return null
  }
  return { token, user: await response.json() }
}

export async function loadActiveDiseaseMaster() {
  const { url, serviceKey } = config()
  const baseHeaders = { apikey: serviceKey, authorization: `Bearer ${serviceKey}` }
  const diseaseResponse = await fetch(`${url}/rest/v1/diseases?select=id,code,name,description,detection_criteria,active,revision&active=eq.true&order=code`, { headers: baseHeaders })
  if (!diseaseResponse.ok) throw new Error(`Disease Master request failed (${diseaseResponse.status})`)
  const diseases = await diseaseResponse.json()
  const levelResponse = await fetch(`${url}/rest/v1/disease_severity_levels?select=disease_id,label,rank,criteria&order=rank`, { headers: baseHeaders })
  if (!levelResponse.ok) throw new Error(`Disease severity request failed (${levelResponse.status})`)
  const levels = await levelResponse.json()
  const levelsByDisease = new Map()
  for (const level of levels) {
    const list = levelsByDisease.get(level.disease_id) || []
    list.push(level)
    levelsByDisease.set(level.disease_id, list)
  }
  return diseases.map((disease) => ({
    ...disease,
    severityLevels: (levelsByDisease.get(disease.id) || []).sort((a, b) => a.rank - b.rank),
  }))
}

export function supabaseConfig() {
  return config()
}

export async function supabaseRest(path, init = {}) {
  const { url, serviceKey } = config()
  const headers = new Headers(init.headers || {})
  headers.set('apikey', serviceKey)
  headers.set('authorization', `Bearer ${serviceKey}`)
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json')
  const response = await fetch(`${url}${path}`, { ...init, headers })
  const raw = await response.text()
  let payload = null
  try { payload = raw ? JSON.parse(raw) : null } catch { payload = raw }
  if (!response.ok) {
    const message = payload?.message || payload?.hint || payload?.details || `Supabase request failed (${response.status})`
    const error = new Error(message)
    error.status = response.status
    throw error
  }
  return payload
}

export async function loadProfileForUser(userId) {
  const { url, serviceKey } = config()
  const headers = { apikey: serviceKey, authorization: `Bearer ${serviceKey}` }
  const profileResponse = await fetch(`${url}/rest/v1/profiles?select=user_id,username,date_of_birth,occupation,account_status&user_id=eq.${encodeURIComponent(userId)}&limit=1`, { headers })
  if (!profileResponse.ok) throw new Error(`Profile request failed (${profileResponse.status})`)
  const profiles = await profileResponse.json()
  if (!profiles[0]) return null
  const roleResponse = await fetch(`${url}/rest/v1/user_roles?select=role&user_id=eq.${encodeURIComponent(userId)}&limit=1`, { headers })
  if (!roleResponse.ok) throw new Error(`Role request failed (${roleResponse.status})`)
  const roles = await roleResponse.json()
  const profile = profiles[0]
  const birth = new Date(`${profile.date_of_birth}T00:00:00Z`)
  const today = new Date()
  let age = today.getUTCFullYear() - birth.getUTCFullYear()
  const beforeBirthday = today.getUTCMonth() < birth.getUTCMonth() || (today.getUTCMonth() === birth.getUTCMonth() && today.getUTCDate() < birth.getUTCDate())
  if (beforeBirthday) age -= 1
  // The current patient/doctor UI has one staff workspace. Keep database
  // authorization as `admin`, while exposing the staff workspace role to the
  // existing client until a distinct admin shell is introduced.
  const role = roles[0]?.role === 'doctor' || roles[0]?.role === 'admin' ? 'doctor' : 'patient'
  return {
    id: profile.user_id,
    username: profile.username,
    displayName: profile.username,
    dateOfBirth: profile.date_of_birth,
    age: Math.max(0, age),
    generation: '',
    occupation: profile.occupation || '',
    role,
  }
}

export async function signInWithUsername(username, pin) {
  const { url, serviceKey, publishableKey } = config()
  const headers = { apikey: serviceKey, authorization: `Bearer ${serviceKey}` }
  const profileResponse = await fetch(`${url}/rest/v1/profiles?select=user_id,account_status&username=eq.${encodeURIComponent(username)}&limit=1`, { headers })
  if (!profileResponse.ok) throw new Error(`Profile lookup failed (${profileResponse.status})`)
  const profiles = await profileResponse.json()
  const profile = profiles[0]
  if (!profile || profile.account_status !== 'active') return null

  const pinCheck = await fetch(`${url}/rest/v1/rpc/verify_dmfc_pin`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ p_user_id: profile.user_id, p_pin: pin }),
  })
  if (!pinCheck.ok || (await pinCheck.json()) !== true) return null

  const authUserResponse = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(profile.user_id)}`, { headers })
  if (!authUserResponse.ok) return null
  const authUser = await authUserResponse.json()
  if (!authUser.email) return null

  const internalPassword = crypto.createHash('sha256').update(`DMFC:${username}:${serviceKey}`).digest('hex')
  const passwordUpdate = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(profile.user_id)}`, {
    method: 'PUT',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ password: internalPassword, email_confirm: true }),
  })
  if (!passwordUpdate.ok) return null

  const tokenResponse = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: publishableKey, 'content-type': 'application/json' },
    // The patient-facing PIN is four digits, while Supabase Auth may enforce
    // a longer password policy. Store/use a deterministic server-only mapping
    // instead of weakening the project's Auth password requirements.
    body: JSON.stringify({ email: authUser.email, password: internalPassword }),
  })
  if (!tokenResponse.ok) return null
  const token = await tokenResponse.json()
  const mappedProfile = await loadProfileForUser(profile.user_id)
  return mappedProfile ? { accessToken: token.access_token, expiresIn: token.expires_in, profile: mappedProfile } : null
}
