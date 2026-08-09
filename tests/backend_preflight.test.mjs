import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const preflightPath = fileURLToPath(new URL('../scripts/backend_preflight.mjs', import.meta.url))
const expectedOrigin = 'http://localhost:5173'

const server = createServer((request, response) => {
  if (request.method === 'OPTIONS' && request.url === '/v1/knowledge') {
    response.writeHead(204, {
      'access-control-allow-origin': expectedOrigin,
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'authorization, content-type',
    })
    response.end()
    return
  }
  if (request.method === 'GET' && request.url === '/v1/auth/session') {
    respondJson(response, 200, { profile: { username: 'DM001', role: 'patient' } })
    return
  }
  if (request.method === 'GET' && request.url === '/v1/knowledge') {
    respondJson(response, 200, { articles: [], diseases: [] })
    return
  }
  if (request.method === 'GET' && request.url === '/v1/examinations') {
    respondJson(response, 200, { examinations: [] })
    return
  }
  respondJson(response, 404, { message: 'not found' })
})

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const address = server.address()
assert.equal(typeof address, 'object')
const baseUrl = `http://127.0.0.1:${address.port}`

try {
  const result = await runPreflight({
    DMFC_API_BASE_URL: baseUrl,
    DMFC_PREFLIGHT_ORIGIN: expectedOrigin,
  })
  assert.equal(result.code, 0, result.output)
  assert.match(result.output, /DMFC backend preflight passed/)
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
}

const insecure = await runPreflight({
  DMFC_API_BASE_URL: 'http://api.example.test',
  DMFC_PREFLIGHT_ORIGIN: expectedOrigin,
})
assert.notEqual(insecure.code, 0)
assert.match(insecure.output, /ต้องใช้ HTTPS/)

console.log('Backend preflight contract test passed')

function respondJson(response, status, payload) {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(payload))
}

function runPreflight(environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [preflightPath], {
      env: { ...process.env, ...environment },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.on('data', (chunk) => { output += chunk })
    child.stderr.on('data', (chunk) => { output += chunk })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, output }))
  })
}
