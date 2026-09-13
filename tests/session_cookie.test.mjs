import assert from 'node:assert/strict'
import { setRefreshCookie } from '../backend/api/_lib/supabase.mjs'

function responseRecorder() {
  const headers = new Map()
  return {
    setHeader(name, value) { headers.set(String(name).toLowerCase(), value) },
    getHeader(name) { return headers.get(String(name).toLowerCase()) },
  }
}

const originalFrontendOrigin = process.env.FRONTEND_ORIGIN
const originalNodeEnv = process.env.NODE_ENV

try {
  process.env.NODE_ENV = 'production'
  process.env.FRONTEND_ORIGIN = 'https://app.example.test'
  const crossOriginResponse = responseRecorder()
  setRefreshCookie(crossOriginResponse, 'refresh-token', { headers: { host: 'api.example.test', 'x-forwarded-proto': 'https' } })
  assert.match(String(crossOriginResponse.getHeader('set-cookie')), /SameSite=None/)
  assert.match(String(crossOriginResponse.getHeader('set-cookie')), /Secure/)

  const sameOriginResponse = responseRecorder()
  setRefreshCookie(sameOriginResponse, 'refresh-token', { headers: { host: 'app.example.test', 'x-forwarded-proto': 'https' } })
  assert.match(String(sameOriginResponse.getHeader('set-cookie')), /SameSite=Lax/)
} finally {
  if (originalFrontendOrigin === undefined) delete process.env.FRONTEND_ORIGIN
  else process.env.FRONTEND_ORIGIN = originalFrontendOrigin
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = originalNodeEnv
}

console.log('Session cookie tests passed')
