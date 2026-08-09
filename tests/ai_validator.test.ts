import assert from 'node:assert/strict'
import { assertSafeAiResult, validateAiResult, type ActiveDiseaseCriterion } from '../src/services/aiValidator.ts'

const activeDiseases: ActiveDiseaseCriterion[] = [
  { id: 'D001', code: 'D001', name: 'ผิวแห้ง', active: true, severityLabels: ['เล็กน้อย', 'ปานกลาง', 'รุนแรง'] },
  { id: 'D002', code: 'D002', name: 'หนังด้าน', active: true, severityLabels: ['เล็กน้อย', 'ปานกลาง'] },
  { id: 'D005', code: 'D005', name: 'เชื้อราที่เล็บ', active: false, severityLabels: ['เล็กน้อย', 'ปานกลาง', 'รุนแรง'] },
]

const safe = validateAiResult({ findings: [
  { diseaseId: 'D001', detected: true, suggestedSeverity: 'ปานกลาง', confidence: 0.91, imagePosition: 'left-sole' },
  { diseaseId: 'D002', detected: false, suggestedSeverity: null, confidence: 0.86, imagePosition: 'right-dorsal' },
] }, activeDiseases)

assert.equal(safe.status, 'accepted')
assert.equal(safe.findings.length, 2)
assertSafeAiResult(safe)

const unsafe = validateAiResult({ findings: [
  { diseaseId: 'D999', detected: true, suggestedSeverity: 'รุนแรง', confidence: 0.8, imagePosition: 'left-dorsal' },
  { diseaseId: 'D005', detected: true, suggestedSeverity: 'เล็กน้อย', confidence: 0.8, imagePosition: 'left-dorsal' },
  { diseaseId: 'D001', detected: true, suggestedSeverity: 'รุนแรง', confidence: 1.4, imagePosition: 'left-dorsal' },
  { diseaseId: 'D001', detected: true, suggestedSeverity: 'ปานกลาง', confidence: 0.8, imagePosition: 'not-a-foot-position' },
] }, activeDiseases)

assert.equal(unsafe.status, 'accepted_with_rejections')
assert.equal(unsafe.findings.length, 0)
assert.equal(unsafe.rejectedItems.length, 4)
assert.throws(() => assertSafeAiResult(unsafe), /AI result rejected/)

const malformed = validateAiResult({ findings: 'not-an-array' }, activeDiseases)
assert.equal(malformed.status, 'invalid_payload')

console.log('AI validator tests passed')
