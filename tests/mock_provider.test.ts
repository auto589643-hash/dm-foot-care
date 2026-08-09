import assert from 'node:assert/strict'
import { MockFootAssessmentProvider, toMockDiseaseMaster } from '../src/services/mockAiProvider.ts'

const result = await new MockFootAssessmentProvider().analyze({
  examinationId: 'EX-MOCK',
  idempotencyKey: 'EX-MOCK-1',
  imageReferences: {
    'left-dorsal': 'file-1',
    'left-sole': 'file-2',
    'right-dorsal': 'file-3',
    'right-sole': 'file-4',
  },
  diseaseMasterVersion: '1',
})

assert.equal(result.validation.status, 'accepted')
assert.equal(result.findings.filter((finding) => finding.detected).length, 2)
assert.equal(result.runId, 'mock-run-EX-MOCK-EX-MOCK-1')

const inactiveResult = await new MockFootAssessmentProvider([
  { id: 'D001', code: 'D001', name: 'ผิวแห้ง', active: false, severityLabels: ['เล็กน้อย', 'ปานกลาง', 'รุนแรง'] },
  { id: 'D002', code: 'D002', name: 'หนังด้าน', active: true, severityLabels: ['เล็กน้อย', 'ปานกลาง', 'รุนแรง'] },
  { id: 'D003', code: 'D003', name: 'แผลที่เท้า', active: true, severityLabels: ['เล็กน้อย', 'ปานกลาง', 'รุนแรง'] },
]).analyze({
  examinationId: 'EX-INACTIVE',
  idempotencyKey: 'EX-INACTIVE-1',
  imageReferences: {
    'left-dorsal': 'file-1',
    'left-sole': 'file-2',
    'right-dorsal': 'file-3',
    'right-sole': 'file-4',
  },
  diseaseMasterVersion: '1',
})

assert.equal(inactiveResult.validation.status, 'accepted')
assert.equal(inactiveResult.findings.some((finding) => finding.diseaseId === 'D001'), false)
assert.equal(inactiveResult.findings.filter((finding) => finding.detected).length, 1)

const limitedSchema = toMockDiseaseMaster([{
  id: 'D001', name: 'ผิวแห้ง', category: 'ผิวหนัง', description: 'desc', criteria: 'criteria',
  severityCriteria: 'เล็กน้อย: mild · ปานกลาง: moderate', severity: 'ปานกลาง', care: 'care', recommendation: 'recommendation', active: true,
  severityLevels: [{ label: 'เล็กน้อย', rank: 1, criteria: 'mild' }, { label: 'ปานกลาง', rank: 2, criteria: 'moderate' }],
}])
assert.deepEqual(limitedSchema[0].severityLabels, ['เล็กน้อย', 'ปานกลาง'])

console.log('Mock provider tests passed')
