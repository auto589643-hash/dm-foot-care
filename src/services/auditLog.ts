export type AuditEventType =
  | 'login'
  | 'logout'
  | 'examination_created'
  | 'image_uploaded'
  | 'ai_analysis_started'
  | 'ai_analysis_completed'
  | 'ai_result_recorded'
  | 'human_review_edited'
  | 'final_result_submitted'
  | 'disease_master_created'
  | 'disease_master_updated'
  | 'user_created'
  | 'user_updated'

export type AuditEntityType = 'session' | 'examination' | 'image' | 'ai_analysis' | 'finding' | 'disease' | 'user'

export interface AuditEventInput {
  actorId: string | null
  eventType: AuditEventType
  entityType: AuditEntityType
  entityId?: string
  payload?: Record<string, unknown>
  occurredAt?: string
}

export interface AuditEvent extends Omit<AuditEventInput, 'payload' | 'occurredAt'> {
  payload: Record<string, unknown>
  occurredAt: string
}

export interface AuditLogger {
  append(event: AuditEventInput): Promise<void>
}

const sensitiveKey = /(pin|password|token|secret|credential|api[_-]?key|private[_-]?key|image|photo|blob|base64)/i
const maxStringLength = 500
const maxDepth = 5

function sanitizeValue(value: unknown, depth: number): unknown {
  if (depth > maxDepth) return '[TRUNCATED]'
  if (typeof value === 'string') return value.length > maxStringLength ? `${value.slice(0, maxStringLength)}…` : value
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeValue(item, depth + 1))
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, nested] of Object.entries(value)) {
      if (sensitiveKey.test(key)) continue
      result[key] = sanitizeValue(nested, depth + 1)
    }
    return result
  }
  return undefined
}

/** Remove credentials, raw image data and unbounded values before an event reaches persistence. */
export function sanitizeAuditPayload(payload: Record<string, unknown> = {}): Record<string, unknown> {
  return sanitizeValue(payload, 0) as Record<string, unknown>
}

export function createAuditEvent(input: AuditEventInput, now = new Date()): AuditEvent {
  return {
    actorId: input.actorId,
    eventType: input.eventType,
    entityType: input.entityType,
    ...(input.entityId ? { entityId: input.entityId } : {}),
    payload: sanitizeAuditPayload(input.payload),
    occurredAt: input.occurredAt ?? now.toISOString(),
  }
}

/** Test/development adapter; production should implement AuditLogger with a backend-only writer. */
export class MemoryAuditLogger implements AuditLogger {
  readonly events: AuditEvent[] = []

  async append(event: AuditEventInput): Promise<void> {
    this.events.push(createAuditEvent(event))
  }
}

