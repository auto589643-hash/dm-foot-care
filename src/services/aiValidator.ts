import type { FootPosition, Severity } from '../types'

export const validImagePositions: readonly FootPosition[] = ['left-dorsal', 'left-sole', 'right-dorsal', 'right-sole']

export interface ActiveDiseaseCriterion {
  id: string
  code: string
  name: string
  active: boolean
  severityLabels: readonly Severity[]
}

export interface ValidatedAiFinding {
  diseaseId: string
  detected: boolean
  suggestedSeverity: Severity | null
  confidence: number | null
  imagePosition: FootPosition | null
}

export interface RejectedAiItem {
  index: number
  diseaseId: string | null
  reason: string
}

export interface AiValidationResult {
  status: 'accepted' | 'accepted_with_rejections' | 'invalid_payload'
  rawResult: unknown
  findings: ValidatedAiFinding[]
  rejectedItems: RejectedAiItem[]
}

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function isSeverity(value: string): value is Severity {
  return value === 'เล็กน้อย' || value === 'ปานกลาง' || value === 'รุนแรง'
}

function isFootPosition(value: string): value is FootPosition {
  return (validImagePositions as readonly string[]).includes(value)
}

/**
 * Validate an untrusted provider response against the active Disease Master.
 * Unknown/inactive disease IDs are rejected item-by-item; the raw response is always preserved for audit.
 */
export function validateAiResult(payload: unknown, activeDiseases: readonly ActiveDiseaseCriterion[]): AiValidationResult {
  const rejectedItems: RejectedAiItem[] = []
  const findings: ValidatedAiFinding[] = []
  const diseasesById = new Map(activeDiseases.filter((disease) => disease.active).map((disease) => [disease.id, disease]))
  const seenDiseaseIds = new Set<string>()

  if (!isRecord(payload) || !Array.isArray(payload.findings)) {
    return { status: 'invalid_payload', rawResult: payload, findings, rejectedItems: [{ index: -1, diseaseId: null, reason: 'ต้องมี findings เป็น array' }] }
  }

  payload.findings.forEach((unknownItem, index) => {
    if (!isRecord(unknownItem)) {
      rejectedItems.push({ index, diseaseId: null, reason: 'รายการผลตรวจต้องเป็น object' })
      return
    }

    const diseaseId = readString(unknownItem.diseaseId)
    if (!diseaseId || !diseasesById.has(diseaseId)) {
      rejectedItems.push({ index, diseaseId, reason: 'Disease ID ไม่อยู่ในรายการ Active Disease Master' })
      return
    }
    if (seenDiseaseIds.has(diseaseId)) {
      rejectedItems.push({ index, diseaseId, reason: 'พบ Disease ID ซ้ำในผลลัพธ์เดียวกัน' })
      return
    }

    const disease = diseasesById.get(diseaseId)!
    if (typeof unknownItem.detected !== 'boolean') {
      rejectedItems.push({ index, diseaseId, reason: 'detected ต้องเป็น boolean' })
      return
    }

    const suggestedSeverityValue = unknownItem.suggestedSeverity
    const suggestedSeverity = suggestedSeverityValue === null || suggestedSeverityValue === undefined ? null : readString(suggestedSeverityValue)
    if (suggestedSeverity && (!isSeverity(suggestedSeverity) || !disease.severityLabels.includes(suggestedSeverity))) {
      rejectedItems.push({ index, diseaseId, reason: 'ระดับความรุนแรงไม่ตรงกับ schema ของ Disease' })
      return
    }
    if (unknownItem.detected && !suggestedSeverity) {
      rejectedItems.push({ index, diseaseId, reason: 'รายการที่ detected ต้องมี suggestedSeverity' })
      return
    }

    const confidenceValue = unknownItem.confidence
    const confidence = confidenceValue === null || confidenceValue === undefined ? null : confidenceValue
    if (confidence !== null && (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1)) {
      rejectedItems.push({ index, diseaseId, reason: 'confidence ต้องอยู่ระหว่าง 0 ถึง 1' })
      return
    }

    const imagePositionValue = unknownItem.imagePosition
    const imagePosition = imagePositionValue === null || imagePositionValue === undefined ? null : readString(imagePositionValue)
    if (imagePosition && !isFootPosition(imagePosition)) {
      rejectedItems.push({ index, diseaseId, reason: 'imagePosition ไม่อยู่ในรายการ 4 มุมที่ระบบรองรับ' })
      return
    }

    seenDiseaseIds.add(diseaseId)
    findings.push({
      diseaseId,
      detected: unknownItem.detected,
      suggestedSeverity: suggestedSeverity as Severity | null,
      confidence,
      imagePosition: imagePosition as FootPosition | null,
    })
  })

  return {
    status: rejectedItems.length > 0 ? 'accepted_with_rejections' : 'accepted',
    rawResult: payload,
    findings,
    rejectedItems,
  }
}

export function assertSafeAiResult(result: AiValidationResult): asserts result is AiValidationResult & { status: 'accepted' | 'accepted_with_rejections' } {
  if (result.status === 'invalid_payload' || result.findings.length === 0 && result.rejectedItems.length > 0) {
    throw new Error(`AI result rejected: ${result.rejectedItems.map((item) => item.reason).join('; ')}`)
  }
}
