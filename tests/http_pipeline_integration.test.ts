import assert from 'node:assert/strict'
import { runAnalysisWorkflow } from '../src/services/analysisWorkflow.ts'
import { finalizeExamination } from '../src/services/finalizeWorkflow.ts'
import type { FootPosition } from '../src/types.ts'
import { createRuntimeIntegrationState } from '../src/services/runtimeIntegrations.ts'

const positions: FootPosition[] = ['left-dorsal', 'left-sole', 'right-dorsal', 'right-sole']
const calls: { method: string; path: string; body: unknown; headers: Headers }[] = []
const statuses: string[] = []
const imageReferences: Partial<Record<FootPosition, string>> = {}
const confirmed: string[] = []
const auditEvents: Record<string, unknown>[] = []
let folderId: string | null = null

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } })
}

const fetchImpl: typeof fetch = async (input, init = {}) => {
  const url = new URL(String(input))
  const method = init.method ?? 'GET'
  const headers = new Headers(init.headers)
  let body: unknown = undefined
  if (typeof init.body === 'string') body = JSON.parse(init.body)
  calls.push({ method, path: url.pathname, body, headers })

  if (url.pathname === '/v1/auth/username/sign-in') {
    return json({ accessToken: 'pipeline-token', profile: { id: 'user-1', username: 'DM001', displayName: 'สมใจ ใจดี', dateOfBirth: '1964-04-12', age: 62, generation: 'Baby Boomer', occupation: 'เกษตรกร', role: 'patient' } })
  }
  if (url.pathname === '/v1/examinations/drafts' && method === 'POST') return json({ id: 'ex-42', userId: 'user-1', status: 'draft' })
  if (url.pathname === '/v1/examinations/ex-42/images' && method === 'GET') return json({ driveFolderId: folderId, driveFileIds: imageReferences })
  if (url.pathname === '/v1/original-images/folders' && method === 'POST') {
    folderId = 'drive-folder-42'
    return json({ folderId })
  }
  if (url.pathname === '/v1/original-images' && method === 'POST') {
    const position = headers.get('x-dmfc-image-position') as FootPosition
    const fileId = `drive-file-${position}`
    imageReferences[position] = fileId
    return json({ fileId })
  }
  if (/^\/v1\/examinations\/ex-42\/images\/(left-dorsal|left-sole|right-dorsal|right-sole)$/.test(url.pathname) && method === 'POST') return json({ ok: true })
  if (url.pathname === '/v1/analysis' && method === 'POST') return json({ runId: 'run-42', rawResult: { source: 'fake-ai' }, validation: { ok: true, errors: [] }, findings: [{ diseaseId: 'D001', name: 'ผิวแห้ง', detected: true, severity: 'ปานกลาง', confidence: 0.9, comparison: 'คงที่' }] })
  if (url.pathname === '/v1/examinations/ex-42/analysis-runs' && method === 'POST') return json({ runId: 'run-42' })
  if (url.pathname === '/v1/examinations/ex-42/status' && method === 'PATCH') {
    statuses.push((body as { status: string }).status)
    return json({ ok: true })
  }
  if (url.pathname === '/v1/examinations/ex-42/confirmed-findings' && method === 'POST') {
    const payload = body as { diseaseId?: string; findings?: Array<{ diseaseId: string }> }
    if (payload.diseaseId) confirmed.push(payload.diseaseId)
    if (payload.findings) confirmed.push(...payload.findings.map((finding) => finding.diseaseId))
    return json({ ok: true })
  }
  if (url.pathname === '/v1/examinations/ex-42/finalize' && method === 'POST') {
    const payload = body as { findings?: Array<{ diseaseId: string }> }
    confirmed.push(...(payload.findings ?? []).map((finding) => finding.diseaseId))
    return json({ id: 'ex-42', status: 'confirmed' })
  }
  if (url.pathname === '/v1/examinations/ex-42/thumbnails' && method === 'POST') return json({ thumbnails: { 'left-dorsal': 'thumb-left', 'left-sole': 'thumb-left-sole', 'right-dorsal': 'thumb-right', 'right-sole': 'thumb-right-sole' } })
  if (url.pathname === '/v1/examinations/ex-42/thumbnail-references' && method === 'POST') return json({ ok: true })
  if (url.pathname === '/v1/audit-events' && method === 'POST') {
    auditEvents.push(body as Record<string, unknown>)
    return json({ ok: true })
  }
  return json({ message: `Unhandled fake backend route: ${method} ${url.pathname}` }, 404)
}

const runtime = createRuntimeIntegrationState({ VITE_DMFC_API_BASE_URL: 'https://api.example.test' }, { fetchImpl })
assert.ok(runtime.integrations)
const integrations = runtime.integrations
const profile = await integrations.auth.signInWithUsername('DM001', '1234')
assert.equal(profile.id, 'user-1')
assert.equal(runtime.getAccessToken(), 'pipeline-token')

const draft = await integrations.repository.createDraft(profile.id)
const draftCall = calls.find((call) => call.path === '/v1/examinations/drafts')
assert.deepEqual(draftCall?.body, {})
const images = Object.fromEntries(positions.map((position) => [position, new Blob([position], { type: 'image/jpeg' })])) as Record<FootPosition, Blob>
const analysis = await runAnalysisWorkflow({
  examinationId: draft.id,
  username: profile.username,
  images,
  diseaseMasterVersion: '7',
  examinedAt: '2026-08-08T02:00:00.000Z',
  archive: integrations.archive,
  provider: integrations.provider,
  repository: integrations.repository,
  idempotencyKey: 'ex-42:attempt-0',
  auditLogger: integrations.audit,
  actorId: profile.id,
})
assert.equal(analysis.runId, 'run-42')
assert.deepEqual(Object.keys(analysis.driveFileIds).sort(), positions.slice().sort())

const thumbnails = await finalizeExamination({
  examinationId: draft.id,
  images,
  thumbnailService: integrations.thumbnails,
  repository: integrations.repository,
  confirmedFindings: [{ diseaseId: 'D001', name: 'ผิวแห้ง', detected: true, severity: 'ปานกลาง', confidence: 0.9, comparison: 'คงที่' }],
  confirmedBy: profile.id,
  auditLogger: integrations.audit,
  actorId: profile.id,
  reviewChangedCount: 1,
})
assert.equal(thumbnails['left-dorsal'], 'thumb-left')
assert.deepEqual(statuses, ['uploading', 'analyzing', 'awaiting_review'])
assert.deepEqual(confirmed, ['D001'])
const finalizeCall = calls.find((call) => call.path === '/v1/examinations/ex-42/finalize')
assert.deepEqual(finalizeCall?.body, { findings: [{ diseaseId: 'D001', severity: 'ปานกลาง' }], reviewChangedCount: 1 })
assert.equal(calls.filter((call) => /^\/v1\/examinations\/ex-42\/images\//.test(call.path) && call.method === 'POST').length, 0)
assert.equal(calls.filter((call) => call.path === '/v1/original-images').length, 4)
assert.ok(calls.filter((call) => call.path === '/v1/original-images').every((call) => call.headers.get('x-dmfc-examination-id') === 'ex-42'))
const folderCall = calls.find((call) => call.path === '/v1/original-images/folders')
assert.deepEqual(folderCall?.body, { examinationId: 'ex-42', examinedAt: '2026-08-08T02:00:00.000Z' })
assert.deepEqual(auditEvents.map((event) => event.eventType), ['image_uploaded', 'image_uploaded', 'image_uploaded', 'image_uploaded', 'ai_analysis_started', 'ai_analysis_completed', 'ai_result_recorded'])
assert.ok(auditEvents.every((event) => !('actorId' in event)))
assert.ok(calls.slice(1).every((call) => call.headers.get('authorization') === 'Bearer pipeline-token'))

console.log('HTTP pipeline integration tests passed')