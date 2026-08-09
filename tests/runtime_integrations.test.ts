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
console.log('Runtime integration tests passed')
