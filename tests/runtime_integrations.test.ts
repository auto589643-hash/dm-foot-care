import assert from 'node:assert/strict'
import { createRuntimeIntegrationState } from '../src/services/runtimeIntegrations.ts'

const demo = createRuntimeIntegrationState({})
assert.equal(demo.integrations, null)
demo.setAccessToken('demo-token')
assert.equal(demo.getAccessToken(), 'demo-token')

const backend = createRuntimeIntegrationState({ VITE_DMFC_API_BASE_URL: 'https://api.example.test/' })
assert.ok(backend.integrations)
assert.equal(backend.integrations?.client instanceof Object, true)
assert.equal(backend.integrations?.knowledge instanceof Object, true)
backend.setAccessToken('short-lived-token')
assert.equal(backend.getAccessToken(), 'short-lived-token')

assert.throws(() => createRuntimeIntegrationState({ VITE_DMFC_API_BASE_URL: 'http://api.example.test' }), /must use HTTPS/)

const originalWindow = globalThis.window
Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { origin: 'https://dm-foot-care-alias.example.test' } } })

let requestedUrl = ''
const sameOrigin = createRuntimeIntegrationState({ VITE_DMFC_API_BASE_URL: 'https://old-deployment.example.test/api' }, {
  fetchImpl: async (input) => {
    requestedUrl = String(input)
    return new Response(JSON.stringify({ accessToken: 'token', profile: { id: 'u1' } }), { status: 200, headers: { 'content-type': 'application/json' } })
  },
})
await sameOrigin.integrations?.auth.signInWithUsername('DM001', '1234')
assert.equal(requestedUrl, 'https://dm-foot-care-alias.example.test/api/v1/auth/username/sign-in')

const externalApi = createRuntimeIntegrationState({
  VITE_DMFC_API_BASE_URL: 'https://api.example.test/',
  VITE_DMFC_ALLOW_CROSS_ORIGIN_API: 'true',
}, {
  fetchImpl: async (input) => {
    requestedUrl = String(input)
    return new Response(JSON.stringify({ accessToken: 'token', profile: { id: 'u1' } }), { status: 200, headers: { 'content-type': 'application/json' } })
  },
})
await externalApi.integrations?.auth.signInWithUsername('DM001', '1234')
assert.equal(requestedUrl, 'https://api.example.test/v1/auth/username/sign-in')

Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow })
console.log('Runtime integration tests passed')
