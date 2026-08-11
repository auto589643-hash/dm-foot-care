import assert from 'node:assert/strict'
import { finalizeExamination } from '../src/services/finalizeWorkflow.ts'
import type { ExaminationRepository, ThumbnailService } from '../src/services/contracts.ts'
import type { FootPosition } from '../src/types.ts'

const positions: FootPosition[] = ['left-dorsal', 'left-sole', 'right-dorsal', 'right-sole']
const images = Object.fromEntries(positions.map((position) => [position, new Blob([position], { type: 'image/jpeg' })])) as Record<FootPosition, Blob>
const statuses: string[] = []
const saved: string[] = []
const confirmed: string[] = []

const repository: ExaminationRepository = {
  async createDraft() { return { id: 'EX1', userId: 'U1', status: 'draft' } },
  async getImageReferences() { return { driveFolderId: 'folder', driveFileIds: {} } },
  async saveImageReference() {},
  async saveAiAnalysis() { return { runId: 'run' } },
  async saveConfirmedFinding({ diseaseId, confirmedBy }) { confirmed.push(`${diseaseId}:${confirmedBy}`) },
  async saveThumbnailReferences({ thumbnails }) { saved.push(...Object.keys(thumbnails)) },
  async updateStatus(_id, status) { statuses.push(status) },
}
const thumbnailService: ThumbnailService = {
  async generateAndStore() { return Object.fromEntries(positions.map((position) => [position, `thumb/${position}.webp`])) as Record<FootPosition, string> },
}

const result = await finalizeExamination({
  examinationId: 'EX1',
  images,
  thumbnailService,
  repository,
  confirmedFindings: [{ diseaseId: 'D001', name: 'ผิวแห้ง', detected: true, severity: 'ปานกลาง', confidence: 90, comparison: 'คงที่' }],
  confirmedBy: 'doctor-1',
})
assert.equal(Object.keys(result).length, 4)
assert.deepEqual(statuses, ['thumbnailing', 'confirmed'])
assert.deepEqual(saved.sort(), positions.sort())
assert.deepEqual(confirmed, ['D001:doctor-1'])

let generatedPrecomputedThumbnail = false
const precomputed = Object.fromEntries(positions.map((position) => [position, `ready/${position}.webp`])) as Record<FootPosition, string>
const precomputedResult = await finalizeExamination({
  examinationId: 'EX-PRECOMPUTED', images,
  thumbnailService: { async generateAndStore() { generatedPrecomputedThumbnail = true; return precomputed } },
  repository,
  precomputedThumbnails: precomputed,
})
assert.equal(generatedPrecomputedThumbnail, false)
assert.deepEqual(precomputedResult, precomputed)

const failureStatuses: string[] = []
await assert.rejects(() => finalizeExamination({
  examinationId: 'EX2', images,
  thumbnailService: { async generateAndStore() { throw new Error('storage down') } },
  repository: { ...repository, async updateStatus(_id, status) { failureStatuses.push(status) } },
}), /สร้างภาพสรุปไม่สำเร็จ/)
assert.equal(failureStatuses.at(-1), 'thumbnail_failed')


const persistenceFailureStatuses: string[] = []
await assert.rejects(() => finalizeExamination({
  examinationId: 'EX-PERSISTENCE-FAIL',
  images,
  thumbnailService,
  confirmedBy: 'doctor-1',
  confirmedFindings: [{ diseaseId: 'D001', name: 'ผิวแห้ง', detected: true, severity: 'ปานกลาง', confidence: 90, comparison: 'คงที่' }],
  precomputedThumbnails: precomputed,
  repository: {
    ...repository,
    async updateStatus(_id, status) { persistenceFailureStatuses.push(status) },
    async finalizeExamination() { throw new Error('database unavailable') },
  },
}), /บันทึกผลตรวจไม่สำเร็จ/)
assert.deepEqual(persistenceFailureStatuses, [], 'persistence failure must not be mislabeled as thumbnail_failed')

console.log('Finalize workflow tests passed')
