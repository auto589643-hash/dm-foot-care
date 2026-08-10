import assert from 'node:assert/strict'
import { runAnalysisWorkflow, type AnalysisWorkflowInput } from '../src/services/analysisWorkflow.ts'
import type { ExaminationRepository, FootAssessmentProvider, OriginalImageArchive } from '../src/services/contracts.ts'
import { MockFootAssessmentProvider } from '../src/services/mockAiProvider.ts'
import type { FootPosition } from '../src/types.ts'

const positions: FootPosition[] = ['left-dorsal', 'left-sole', 'right-dorsal', 'right-sole']
const images = Object.fromEntries(positions.map((position) => [position, new Blob([position], { type: 'image/jpeg' })])) as Record<FootPosition, Blob>
const statusEvents: string[] = []
const savedImages: string[] = []

const archive: OriginalImageArchive = {
  async createPrivateExaminationFolder() { return 'drive-folder-1' },
  async uploadOriginal(_folderId, position) { return `drive-${position}` },
}
const repository: ExaminationRepository = {
  async createDraft() { return { id: 'EX1', userId: 'U1', status: 'draft' } },
  async getImageReferences() { return { driveFolderId: null, driveFileIds: {} } },
  async saveImageReference(input) { savedImages.push(input.position) },
  async saveAiAnalysis() {},
  async saveConfirmedFinding() {},
  async saveThumbnailReferences() {},
  async updateStatus(_id, status) { statusEvents.push(status) },
}

const result = await runAnalysisWorkflow({
  examinationId: 'EX1', username: 'DM001', images, diseaseMasterVersion: '1', archive,
  provider: new MockFootAssessmentProvider(), repository,
} satisfies AnalysisWorkflowInput)

assert.equal(result.driveFolderId, 'drive-folder-1')
assert.equal(Object.keys(result.driveFileIds).length, 4)
assert.equal(result.findings.length, 3)
assert.deepEqual(savedImages.sort(), positions.sort())
assert.deepEqual(statusEvents, ['uploading', 'analyzing', 'awaiting_review'])

let createdFolders = 0
const uploadedOnRetry: FootPosition[] = []
const retryArchive: OriginalImageArchive = {
  async createPrivateExaminationFolder() { createdFolders += 1; return 'new-folder' },
  async uploadOriginal(_folderId, position) { uploadedOnRetry.push(position); return `retry-${position}` },
}
let receivedIdempotencyKey = ''
const retryProvider: FootAssessmentProvider = {
  async analyze(input) {
    receivedIdempotencyKey = input.idempotencyKey
    return new MockFootAssessmentProvider().analyze(input)
  },
}
const retryResult = await runAnalysisWorkflow({
  examinationId: 'EX3', username: 'DM001', images, diseaseMasterVersion: '1', archive: retryArchive,
  provider: retryProvider, repository,
  idempotencyKey: 'EX3-retry-2',
  existingImageReferences: { driveFolderId: 'existing-folder', driveFileIds: { 'left-dorsal': 'existing-left-dorsal', 'left-sole': 'existing-left-sole' } },
})
assert.equal(retryResult.driveFolderId, 'existing-folder')
assert.deepEqual(uploadedOnRetry.sort(), ['right-dorsal', 'right-sole'])
assert.equal(createdFolders, 0)
assert.equal(receivedIdempotencyKey, 'EX3-retry-2')

let releaseUpload!: () => void
const uploadGate = new Promise<void>((resolve) => { releaseUpload = resolve })
let providerStartedBeforeUpload = false
let uploadFinished = false
const parallelArchive: OriginalImageArchive = {
  async createPrivateExaminationFolder() { return 'parallel-folder' },
  async uploadOriginal(_folderId, position) {
    await uploadGate
    uploadFinished = true
    return `parallel-${position}`
  },
}
const parallelProvider: FootAssessmentProvider = {
  async analyze(input) {
    providerStartedBeforeUpload = !uploadFinished && Boolean(input.analysisImages)
    return new MockFootAssessmentProvider().analyze(input)
  },
}
const parallelRun = runAnalysisWorkflow({
  examinationId: 'EX-PARALLEL', username: 'DM001', images, diseaseMasterVersion: '1',
  archive: parallelArchive, provider: parallelProvider, repository,
  analysisImages: Object.fromEntries(positions.map((position) => [position, 'data:image/jpeg;base64,YQ=='])),
})
await new Promise((resolve) => setTimeout(resolve, 0))
assert.equal(providerStartedBeforeUpload, true)
releaseUpload()
await parallelRun

const failureStatuses: string[] = []
const failingProvider: FootAssessmentProvider = { async analyze() { throw new Error('provider down') } }
await assert.rejects(() => runAnalysisWorkflow({
  examinationId: 'EX2', username: 'DM001', images, diseaseMasterVersion: '1', archive,
  provider: failingProvider, repository: { ...repository, async updateStatus(_id, status) { failureStatuses.push(status) } },
}), /pipeline failed/)
assert.equal(failureStatuses.at(-1), 'analysis_failed')

console.log('Analysis workflow tests passed')
