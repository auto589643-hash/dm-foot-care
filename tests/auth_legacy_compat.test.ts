import assert from 'node:assert/strict'
import { signInWithUsername } from '../backend/api/_lib/supabase.mjs'

process.env.SUPABASE_URL = 'https://supabase.test'
process.env.SUPABASE_SECRET_KEY = 'service-secret'
process.env.SUPABASE_PUBLISHABLE_KEY = 'publishable-key'

const userId = '00000000-0000-4000-8000-000000000001'
const calls: Array<{ url: string; method: string; body?: unknown }> = []
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
const originalFetch = globalThis.fetch

globalThis.fetch = async (input, init = {}) => {
  const url = String(input)
  const method = String(init.method || 'GET').toUpperCase()
  let body: unknown
  if (typeof init.body === 'string') {
    try { body = JSON.parse(init.body) } catch { body = init.body }
  }
  calls.push({ url, method, body })

  if (url.includes('/rest/v1/profiles?')) return json([{ user_id: userId, username: 'ADMIN_DMFC', display_name: 'ADMIN', date_of_birth: '1990-01-01', occupation: 'Admin', account_status: 'active' }])
  if (url.endsWith('/rest/v1/rpc/verify_dmfc_pin')) return json(true)
  if (url.includes('/auth/v1/token?grant_type=password')) {
    const email = (body as { email?: string })?.email
    if (email === 'admin_dmfc@dmfc.local') return json({ error: 'invalid credentials' }, 400)
    if (email === 'admin@dmfc.local') return json({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600, user: { id: userId, email } })
  }
  if (url.endsWith(`/auth/v1/admin/users/${userId}`) && method === 'GET') return json({ id: userId, email: 'admin@dmfc.local' })
  if (url.endsWith(`/auth/v1/admin/users/${userId}`) && method === 'PUT') return json({ id: userId, email: 'admin@dmfc.local' })
  if (url.includes('/rest/v1/user_roles?')) return json([{ role: 'admin' }])
  throw new Error(`Unexpected request: ${method} ${url}`)
}

try {
  const session = await signInWithUsername('ADMIN_DMFC', '1234')
  assert.ok(session)
  assert.equal(session.profile.username, 'ADMIN_DMFC')
  assert.equal(session.profile.role, 'admin')
  assert.ok(calls.some((call) => call.method === 'GET' && call.url.endsWith(`/auth/v1/admin/users/${userId}`)))
  assert.ok(calls.some((call) => call.url.includes('/auth/v1/token') && (call.body as { email?: string })?.email === 'admin@dmfc.local'))
} finally {
  globalThis.fetch = originalFetch
}

console.log('Legacy auth compatibility tests passed')
