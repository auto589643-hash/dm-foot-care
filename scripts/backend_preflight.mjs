/**
 * Deployment preflight for the browser-facing DMFC backend.
 *
 * Usage:
 *   DMFC_API_BASE_URL=https://api.example.test \
 *   DMFC_PREFLIGHT_ORIGIN=https://app.example.test \
 *   DMFC_PREFLIGHT_ACCESS_TOKEN=... \
 *   node scripts/backend_preflight.mjs
 *
 * The token is used only in memory and is never printed.
 */

const baseUrlValue = process.env.DMFC_API_BASE_URL ?? process.env.VITE_DMFC_API_BASE_URL
const origin = process.env.DMFC_PREFLIGHT_ORIGIN
const accessToken = process.env.DMFC_PREFLIGHT_ACCESS_TOKEN
const timeoutMs = Number(process.env.DMFC_PREFLIGHT_TIMEOUT_MS ?? 10000)

if (!baseUrlValue) fail('กำหนด DMFC_API_BASE_URL หรือ VITE_DMFC_API_BASE_URL ก่อนรัน preflight')
if (!origin) fail('กำหนด DMFC_PREFLIGHT_ORIGIN เป็น origin ของ frontend ที่ deploy แล้ว')
try {
  const parsedOrigin = new URL(origin)
  if (!['http:', 'https:'].includes(parsedOrigin.protocol) || parsedOrigin.pathname !== '/' || parsedOrigin.search || parsedOrigin.hash) throw new Error('invalid origin')
} catch {
  fail('DMFC_PREFLIGHT_ORIGIN ต้องเป็น origin เช่น https://app.example.test')
}

let baseUrl
try {
  baseUrl = new URL(baseUrlValue)
} catch {
  fail('Backend base URL ไม่ใช่ URL ที่ถูกต้อง')
}
if (baseUrl.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(baseUrl.hostname)) {
  fail('Backend base URL ต้องใช้ HTTPS นอก local development')
}

const normalizedBaseUrl = baseUrl.toString().endsWith('/') ? baseUrl.toString() : `${baseUrl}/`
const headers = new Headers({
  origin,
  accept: 'application/json',
})
if (accessToken) headers.set('authorization', `Bearer ${accessToken}`)

const checks = [
  await request('/v1/auth/session', 'GET'),
  await request('/v1/knowledge', 'GET'),
  await request('/v1/examinations', 'GET'),
]

const unauthorizedExpected = !accessToken
for (const check of checks) {
  const allowed = check.status >= 200 && check.status < 300
  const expectedUnauthorized = unauthorizedExpected && check.status === 401
  if (!allowed && !expectedUnauthorized) fail(`${check.method} ${check.path} ได้ HTTP ${check.status}`)
  if (allowed) validateResponseShape(check)
  console.log(`${check.method} ${check.path}: ${check.status}${expectedUnauthorized ? ' (expected without token)' : ''}`)
}

const cors = await request('/v1/knowledge', 'OPTIONS', {
  'access-control-request-method': 'GET',
  'access-control-request-headers': accessToken ? 'authorization' : 'accept',
})
if (cors.status < 200 || cors.status >= 300) fail(`CORS preflight ได้ HTTP ${cors.status}`)
const allowOrigin = cors.headers.get('access-control-allow-origin')
if (allowOrigin !== origin) fail(`CORS origin ไม่ตรงกับ frontend origin ที่กำหนด (ได้ ${allowOrigin ?? 'ไม่มี header'})`)
if (cors.headers.get('access-control-allow-credentials') !== 'true') fail('CORS ต้องอนุญาต credentials สำหรับ session cookie/access token flow')
const allowHeaders = (cors.headers.get('access-control-allow-headers') ?? '').toLowerCase()
for (const required of ['authorization', 'content-type']) {
  if (!allowHeaders.includes(required)) fail(`CORS ไม่อนุญาต header ${required}`)
}
console.log(`OPTIONS /v1/knowledge: ${cors.status} (CORS origin/header checks passed)`)

if (!accessToken) {
  console.log('Authenticated endpoint checks skipped: set DMFC_PREFLIGHT_ACCESS_TOKEN to verify session, Knowledge and examinations responses.')
}
console.log('DMFC backend preflight passed')

async function request(path, method, extraHeaders = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const requestHeaders = new Headers({ ...Object.fromEntries(headers), ...extraHeaders })
    if (method === 'OPTIONS') requestHeaders.delete('authorization')
    const response = await fetch(new URL(path.slice(1), normalizedBaseUrl), {
      method,
      headers: requestHeaders,
      credentials: 'include',
      signal: controller.signal,
    })
    const body = await response.text()
    return { path, method, status: response.status, headers: response.headers, body }
  } catch (error) {
    fail(`${method} ${path} เชื่อมต่อไม่ได้: ${error instanceof Error ? error.message : 'unknown error'}`)
  } finally {
    clearTimeout(timer)
  }
}

function fail(message) {
  console.error(`DMFC backend preflight failed: ${message}`)
  process.exitCode = 1
  throw new Error(message)
}

function validateResponseShape(check) {
  const payload = parseJson(check.body)
  if (check.path === '/v1/auth/session') {
    if (!payload || typeof payload !== 'object' || !payload.profile || typeof payload.profile.username !== 'string' || !['patient', 'doctor'].includes(payload.profile.role)) {
      fail('GET /v1/auth/session response ไม่มี Profile ที่ใช้ได้')
    }
    return
  }
  if (check.path === '/v1/knowledge') {
    const articles = Array.isArray(payload) ? payload : payload?.articles
    const diseases = Array.isArray(payload) ? [] : payload?.diseases
    if (!Array.isArray(articles) || !Array.isArray(diseases)) fail('GET /v1/knowledge response ต้องมี articles และ diseases เป็น array')
    return
  }
  if (check.path === '/v1/examinations') {
    const examinations = Array.isArray(payload) ? payload : payload?.examinations
    if (!Array.isArray(examinations)) fail('GET /v1/examinations response ต้องเป็น array หรือมี examinations เป็น array')
  }
}

function parseJson(value) {
  try {
    return JSON.parse(value)
  } catch {
    fail('Backend response ไม่ใช่ JSON ที่ถูกต้อง')
  }
}
