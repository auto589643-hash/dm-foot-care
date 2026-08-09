import assert from 'node:assert/strict'
import { MemoryAuditLogger, createAuditEvent, sanitizeAuditPayload } from '../src/services/auditLog.ts'

const event = createAuditEvent({
  actorId: 'user-1',
  eventType: 'ai_result_recorded',
  entityType: 'ai_analysis',
  entityId: 'run-1',
  occurredAt: '2026-08-08T09:42:00.000Z',
  payload: {
    provider: 'mock',
    confidence: 0.91,
    pin: '1234',
    apiKey: 'secret',
    originalImage: 'data:image/png;base64,very-large',
    nested: { token: 'jwt', safe: 'kept' },
  },
})

assert.deepEqual(event.payload, {
  provider: 'mock',
  confidence: 0.91,
  nested: { safe: 'kept' },
})
assert.equal(event.occurredAt, '2026-08-08T09:42:00.000Z')

const longPayload = sanitizeAuditPayload({ note: 'a'.repeat(600), values: Array.from({ length: 80 }, (_, index) => index) })
assert.equal(String(longPayload.note).length, 501)
assert.equal((longPayload.values as unknown[]).length, 50)

const logger = new MemoryAuditLogger()
await logger.append({ actorId: null, eventType: 'login', entityType: 'session', payload: { password: 'never-store' } })
assert.equal(logger.events.length, 1)
assert.deepEqual(logger.events[0].payload, {})

console.log('Audit log tests passed')

