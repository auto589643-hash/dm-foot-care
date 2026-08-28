import crypto from 'node:crypto'
import { readCookie, sendJson, setCookie } from './http.mjs'

const REFRESH_COOKIE = 'dmfc_refresh'
const DEFAULT_SESSION_MAX_AGE = 60 * 60 * 24 * 30
const AUTH_CACHE_TTL_MS = 10_000
const ROLE_CACHE_TTL_MS = 10_000
const CACHE_MAX_ENTRIES = 256
const tokenUserCache = new Map()
const roleCache = new Map()
const signedUrlCache = new Map()

function config() {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '')
  const serviceKey = process.env.SUPABASE_SECRET_KEY || ''
  const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || ''
  if (!url || !serviceKey || !publishableKey) throw new Error('Supabase server variables are not configured')
  return { url, serviceKey, publishableKey }
}

function cacheGet(cache, key) {
  const entry = cache.get(key)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key)
    return null
  }
  return entry.value
}

function cacheSet(cache, key, value, ttlMs) {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
  cache.set(key, { value, expiresAt: Date.now() + ttlMs })
}

function tokenCacheKey(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function rememberTokenUser(token, user) {
  if (token && user?.id) cacheSet(tokenUserCache, tokenCacheKey(token), user, AUTH_CACHE_TTL_MS)
}

export function clearCachedRole(userId) {
  if (userId) roleCache.delete(userId)
}

export async function requireSupabaseUser(req, res) {
  const authorization = req.headers.authorization || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length).trim() : ''
  if (!token) {
    sendJson(res, 401, { message: 'Authorization bearer token is required' })
    return null
  }

  const key = tokenCacheKey(token)
  const cachedUser = cacheGet(tokenUserCache, key)
  if (cachedUser) return { token, user: cachedUser }

  const { url, publishableKey } = config()
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: publishableKey, authorization: `Bearer ${token}` },
  })
  if (!response.ok) {
    tokenUserCache.delete(key)
    sendJson(res, 401, { message: 'Invalid or expired session' })
    return null
  }
  const user = await response.json()
  rememberTokenUser(token, user)
  return { token, user }
}

export async function requireAdminUser(req, res) {
  const session = await requireSupabaseUser(req, res)
  if (!session) return null
  let role = cacheGet(roleCache, session.user.id)
  if (!role) {
    const roles = await supabaseRest(`/rest/v1/user_roles?select=role&user_id=eq.${encodeURIComponent(session.user.id)}&limit=1`)
    role = roles[0]?.role || 'user'
    cacheSet(roleCache, session.user.id, role, ROLE_CACHE_TTL_MS)
  }
  if (role !== 'admin') {
    sendJson(res, 403, { message: 'สิทธิ์ผู้ดูแลระบบไม่เพียงพอ' })
    return null
  }
  return { ...session, role }
}

export function setRefreshCookie(res, refreshToken) {
  const configured = Number(process.env.DMFC_SESSION_MAX_AGE_SECONDS)
  const maxAge = Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_SESSION_MAX_AGE
  setCookie(res, REFRESH_COOKIE, refreshToken, { maxAge, httpOnly: true, secure: process.env.NODE_ENV !== 'development', sameSite: 'Lax' })
}

export function clearRefreshCookie(res) {
  setCookie(res, REFRESH_COOKIE, '', { maxAge: 0, httpOnly: true, secure: process.env.NODE_ENV !== 'development', sameSite: 'Lax' })
}

export async function refreshSupabaseSession(req) {
  const refreshToken = readCookie(req, REFRESH_COOKIE)
  if (!refreshToken) return null
  const { url, publishableKey } = config()
  const response = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: publishableKey, 'content-type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
  if (!response.ok) return null
  const token = await response.json()
  if (!token?.access_token || !token?.refresh_token || !token?.user?.id) return null
  rememberTokenUser(token.access_token, token.user)
  return { token: token.access_token, refreshToken: token.refresh_token, expiresIn: token.expires_in, user: token.user }
}

export async function loadActiveDiseaseMaster() {
  const { url, serviceKey } = config()
  const baseHeaders = { apikey: serviceKey, authorization: `Bearer ${serviceKey}` }
  const [diseaseResponse, levelResponse] = await Promise.all([
    fetch(`${url}/rest/v1/diseases?select=id,code,name,description,detection_criteria,active,revision&active=eq.true&order=code`, { headers: baseHeaders }),
    fetch(`${url}/rest/v1/disease_severity_levels?select=disease_id,label,rank,criteria&order=rank`, { headers: baseHeaders }),
  ])
  if (!diseaseResponse.ok) throw new Error(`Disease Master request failed (${diseaseResponse.status})`)
  if (!levelResponse.ok) throw new Error(`Disease severity request failed (${levelResponse.status})`)
  const [diseases, levels] = await Promise.all([diseaseResponse.json(), levelResponse.json()])
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

/** Server-only helper for the private Supabase Storage API. */
export async function supabaseStorage(path, init = {}) {
  const { url, serviceKey } = config()
  const headers = new Headers(init.headers || {})
  headers.set('apikey', serviceKey)
  headers.set('authorization', `Bearer ${serviceKey}`)
  const response = await fetch(`${url}/storage/v1${path}`, { ...init, headers })
  const raw = await response.text()
  let payload = null
  try { payload = raw ? JSON.parse(raw) : null } catch { payload = raw }
  if (!response.ok) {
    const message = payload?.message || payload?.error || payload?.hint || `Supabase Storage request failed (${response.status})`
    const error = new Error(message)
    error.status = response.status
    throw error
  }
  return payload
}

export async function createStorageSignedUrl(bucket, objectPath, expiresIn = 3600) {
  const cacheKey = `${bucket}:${objectPath}:${expiresIn}`
  const cached = cacheGet(signedUrlCache, cacheKey)
  if (cached) return cached
  const payload = await supabaseStorage(`/object/sign/${encodeURIComponent(bucket)}/${objectPath.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expiresIn }),
  })
  const signed = payload?.signedURL || payload?.signedUrl
  if (!signed) throw new Error('Supabase Storage did not return a signed URL')
  const { url } = config()
  const signedUrl = /^https?:\/\//i.test(signed) ? signed : `${url}/storage/v1${signed}`
  const safeTtlMs = Math.max(5_000, Math.min(expiresIn * 1000 - 60_000, 30 * 60_000))
  cacheSet(signedUrlCache, cacheKey, signedUrl, safeTtlMs)
  return signedUrl
}

function ageFromBirthDate(value) {
  const birth = new Date(`${value}T00:00:00Z`)
  const today = new Date()
  let age = today.getUTCFullYear() - birth.getUTCFullYear()
  const beforeBirthday = today.getUTCMonth() < birth.getUTCMonth() || (today.getUTCMonth() === birth.getUTCMonth() && today.getUTCDate() < birth.getUTCDate())
  if (beforeBirthday) age -= 1
  return Math.max(0, age)
}

function mapProfile(profile, role) {
  return {
    id: profile.user_id,
    username: profile.username,
    displayName: profile.display_name || profile.username,
    dateOfBirth: profile.date_of_birth,
    age: ageFromBirthDate(profile.date_of_birth),
    generation: '',
    occupation: profile.occupation || '',
    sex: profile.sex || undefined,
    diabetesYears: profile.diabetes_years == null ? null : Number(profile.diabetes_years),
    latestHba1c: profile.latest_hba1c == null ? null : Number(profile.latest_hba1c),
    role: role === 'admin' ? 'admin' : 'user',
  }
}

export async function loadProfileForUser(userId) {
  const { url, serviceKey } = config()
  const headers = { apikey: serviceKey, authorization: `Bearer ${serviceKey}` }
  const [profileResponse, roleResponse] = await Promise.all([
    fetch(`${url}/rest/v1/profiles?select=user_id,username,display_name,date_of_birth,occupation,sex,diabetes_years,latest_hba1c,account_status&user_id=eq.${encodeURIComponent(userId)}&limit=1`, { headers }),
    fetch(`${url}/rest/v1/user_roles?select=role&user_id=eq.${encodeURIComponent(userId)}&limit=1`, { headers }),
  ])
  if (!profileResponse.ok) throw new Error(`Profile request failed (${profileResponse.status})`)
  if (!roleResponse.ok) throw new Error(`Role request failed (${roleResponse.status})`)
  const [profiles, roles] = await Promise.all([profileResponse.json(), roleResponse.json()])
  if (!profiles[0]) return null
  return mapProfile(profiles[0], roles[0]?.role)
}

export function internalAuthEmail(username) {
  return `${String(username || '').trim().toLowerCase()}@dmfc.local`
}

export function internalAuthPassword(username) {
  const { serviceKey } = config()
  return crypto.createHash('sha256').update(`DMFC:${String(username || '').trim().toUpperCase()}:${serviceKey}`).digest('hex')
}

async function requestPasswordToken(url, publishableKey, email, password) {
  return fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: publishableKey, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
}

export async function signInWithUsername(username, pin) {
  const { url, serviceKey, publishableKey } = config()
  const normalizedUsername = String(username || '').trim().toUpperCase()
  const headers = { apikey: serviceKey, authorization: `Bearer ${serviceKey}` }
  const profileResponse = await fetch(`${url}/rest/v1/profiles?select=user_id,username,display_name,date_of_birth,occupation,sex,diabetes_years,latest_hba1c,account_status&username=eq.${encodeURIComponent(normalizedUsername)}&limit=1`, { headers })
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

  const preferredEmail = internalAuthEmail(normalizedUsername)
  const internalPassword = internalAuthPassword(normalizedUsername)
  let signInEmail = preferredEmail
  let tokenResponse = await requestPasswordToken(url, publishableKey, signInEmail, internalPassword)

  // Legacy accounts may use an internal Auth email that predates the visible
  // username convention. Resolve the immutable Auth user id only on the slow
  // fallback path, repair its password, then authenticate with its real email.
  if (!tokenResponse.ok) {
    const authUserResponse = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(profile.user_id)}`, {
      headers,
    })
    if (!authUserResponse.ok) return null
    const authUser = await authUserResponse.json()
    signInEmail = String(authUser?.email || '').trim().toLowerCase()
    if (!signInEmail) return null

    const passwordUpdate = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(profile.user_id)}`, {
      method: 'PUT',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ password: internalPassword, email_confirm: true }),
    })
    if (!passwordUpdate.ok) return null
    tokenResponse = await requestPasswordToken(url, publishableKey, signInEmail, internalPassword)
  }

  if (!tokenResponse.ok) return null
  const token = await tokenResponse.json()
  if (!token?.user?.id || token.user.id !== profile.user_id) return null
  const roleResponse = await fetch(`${url}/rest/v1/user_roles?select=role&user_id=eq.${encodeURIComponent(profile.user_id)}&limit=1`, { headers })
  if (!roleResponse.ok) throw new Error(`Role request failed (${roleResponse.status})`)
  const roles = await roleResponse.json()
  const mappedProfile = mapProfile(profile, roles[0]?.role)
  if (token?.user?.id) rememberTokenUser(token.access_token, token.user)
  cacheSet(roleCache, profile.user_id, mappedProfile.role, ROLE_CACHE_TTL_MS)
  return { accessToken: token.access_token, refreshToken: token.refresh_token, expiresIn: token.expires_in, profile: mappedProfile }
}
