import type { Disease, Finding } from '../types'
import type { ActiveDiseaseCriterion } from './aiValidator.ts'
import { assertSafeAiResult, validateAiResult } from './aiValidator.ts'
import type { FootAssessmentProvider } from './contracts.ts'

export const defaultMockDiseaseMaster: ActiveDiseaseCriterion[] = [
  { id: 'D001', code: 'D001', name: 'ผิวแห้ง', active: true, severityLabels: ['เล็กน้อย', 'ปานกลาง', 'รุนแรง'] },
  { id: 'D002', code: 'D002', name: 'หนังด้าน', active: true, severityLabels: ['เล็กน้อย', 'ปานกลาง', 'รุนแรง'] },
  { id: 'D003', code: 'D003', name: 'แผลที่เท้า', active: true, severityLabels: ['เล็กน้อย', 'ปานกลาง', 'รุนแรง'] },
]

/** Adapt the prototype Disease records to the same allow-list shape used by the validator. */
export function toMockDiseaseMaster(diseases: readonly Disease[]): ActiveDiseaseCriterion[] {
  return diseases.map((disease) => ({
    id: disease.id,
    code: disease.id,
    name: disease.name,
    active: disease.active,
    severityLabels: disease.severityLevels?.length
      ? disease.severityLevels.map((level) => level.label)
      : ['เล็กน้อย', 'ปานกลาง', 'รุนแรง'],
  }))
}

/** Development adapter used by the prototype; production swaps this class without changing the workflow. */
export class MockFootAssessmentProvider implements FootAssessmentProvider {
  private readonly diseaseMaster: readonly ActiveDiseaseCriterion[]

  constructor(diseaseMaster: readonly ActiveDiseaseCriterion[] = defaultMockDiseaseMaster) {
    this.diseaseMaster = diseaseMaster
  }

  async analyze(input: Parameters<FootAssessmentProvider['analyze']>[0]) {
    const candidateFindings = [
        { diseaseId: 'D001', detected: true, suggestedSeverity: 'ปานกลาง', confidence: 0.91, imagePosition: 'left-sole' },
        { diseaseId: 'D002', detected: true, suggestedSeverity: 'เล็กน้อย', confidence: 0.86, imagePosition: 'right-sole' },
        { diseaseId: 'D003', detected: false, suggestedSeverity: null, confidence: 0.94, imagePosition: 'left-dorsal' },
      ]
    const activeIds = new Set(this.diseaseMaster.filter((disease) => disease.active).map((disease) => disease.id))
    const rawResult = { findings: candidateFindings.filter((finding) => activeIds.has(finding.diseaseId)) }
    const validation = validateAiResult(rawResult, this.diseaseMaster)
    assertSafeAiResult(validation)
    const findings: Finding[] = validation.findings.map((finding) => {
      const disease = this.diseaseMaster.find((item) => item.id === finding.diseaseId)!
      return {
        diseaseId: finding.diseaseId,
        name: disease.name,
        detected: finding.detected,
        severity: finding.suggestedSeverity ?? 'เล็กน้อย',
        confidence: Math.round((finding.confidence ?? 0) * 100),
        comparison: 'คงที่',
      }
    })
    return { runId: `mock-run-${input.examinationId}-${input.idempotencyKey}`, rawResult, validation, findings }
  }
}
