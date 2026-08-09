import type { Disease, DiseaseSeverityLevel, Severity } from '../types.ts'

const severityOrder: readonly Severity[] = ['เล็กน้อย', 'ปานกลาง', 'รุนแรง']

type UnknownRecord = Record<string, unknown>

/**
 * Translate the backend/Supabase representation into the small client-safe
 * Disease model used by the patient and staff screens. The backend may expose
 * either the canonical API names or the underlying snake_case columns.
 */
export function normalizeDisease(value: unknown): Disease | null {
  if (!isRecord(value)) return null
  // Supabase's internal UUID `id` is not the clinical Disease ID shown in the
  // UI; prefer the stable `code` whenever the backend includes both.
  const id = readString(value.code) ?? readString(value.id)
  const name = readString(value.name)
  const category = readString(value.category)
  if (!id || !name || !category) return null

  const severityLevels = normalizeSeverityLevels(value)
  const severity = readSeverity(value.severity) ?? severityLevels.at(-1)?.label ?? 'เล็กน้อย'
  const criteria = readCriteria(value.criteria) ?? readCriteria(value.detectionCriteria) ?? readCriteria(value.detection_criteria) ?? ''
  const severityCriteria = readString(value.severityCriteria) ?? severityLevels.map((level) => `${level.label}: ${level.criteria}`).filter(Boolean).join(' · ')

  return {
    id,
    name,
    category,
    description: readString(value.description) ?? '',
    criteria,
    severityCriteria,
    severity,
    ...(severityLevels.length ? { severityLevels } : {}),
    care: readString(value.care) ?? readString(value.careInstruction) ?? readString(value.care_instruction) ?? '',
    recommendation: readString(value.recommendation) ?? '',
    referenceImage: readString(value.referenceImage) ?? readString(value.referenceImagePath) ?? readString(value.reference_image_path) ?? undefined,
    active: typeof value.active === 'boolean' ? value.active : true,
  }
}

export function normalizeDiseaseList(value: unknown): Disease[] {
  if (!Array.isArray(value)) return []
  return value.map(normalizeDisease).filter((disease): disease is Disease => Boolean(disease))
}

export function requireDisease(value: unknown): Disease {
  const disease = normalizeDisease(value)
  if (!disease) throw new Error('Backend returned an invalid Disease record')
  return disease
}

function normalizeSeverityLevels(value: UnknownRecord): DiseaseSeverityLevel[] {
  const raw = value.severityLevels ?? value.severity_levels ?? value.disease_severity_levels
  if (!Array.isArray(raw)) return []
  return raw.map((item, index) => {
    if (!isRecord(item)) return null
    const label = readSeverity(item.label)
    const criteria = readCriteria(item.criteria) ?? ''
    if (!label || !criteria) return null
    const rank = typeof item.rank === 'number' && Number.isFinite(item.rank) ? item.rank : severityOrder.indexOf(label) + 1 || index + 1
    return { label, rank, criteria }
  }).filter((level): level is DiseaseSeverityLevel => Boolean(level)).sort((left, right) => left.rank - right.rank)
}

function readCriteria(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (Array.isArray(value)) {
    const parts = value.map(readCriteria).filter((part): part is string => Boolean(part))
    return parts.length ? parts.join(' · ') : null
  }
  if (isRecord(value)) {
    const description = readString(value.description)
    if (description) return description
    const signals = value.signals
    if (Array.isArray(signals)) return readCriteria(signals)
  }
  return null
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readSeverity(value: unknown): Severity | null {
  return typeof value === 'string' && (severityOrder as readonly string[]).includes(value) ? value as Severity : null
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
