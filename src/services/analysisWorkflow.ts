import type { AuditLogger } from './auditLog.ts'
import type { ExaminationRepository, FootAssessmentProvider, OriginalImageArchive } from './contracts.ts'
import type { FootPosition } from '../types'

export const examinationPositions: readonly FootPosition[] = ['left-dorsal', 'left-sole', 'right-dorsal', 'right-sole']

export interface AnalysisWorkflowInput {
  examinationId: string
  username: string
  images: Record<FootPosition, Blob>
  diseaseMasterVersion: string
  examinedAt?: string
  archive: OriginalImageArchive
  provider: FootAssessmentProvider
  repository: ExaminationRepository
  idempotencyKey?: string
  auditLogger?: AuditLogger
  actorId?: string | null
  /** Browser-compressed images let Gemini run in parallel with Drive uploads. */
  analysisImages?: Partial<Record<FootPosition, string>> | Promise<Partial<Record<FootPosition, string>>>
  existingImageReferences?: {
    driveFolderId: string | null
    driveFileIds: Partial<Record<FootPosition, string>>
  }
}

export interface AnalysisWorkflowResult {
  examinationId: string
  driveFolderId: string
  driveFileIds: Record<FootPosition, string>
  runId: string
  findings: Awaited<ReturnType<FootAssessmentProvider['analyze']>>['findings']
}

export class AnalysisPipelineError extends Error {
  readonly examinationId: string
  readonly cause?: unknown

  constructor(message: string, examinationId: string, cause?: unknown) {
    super(message)
    this.examinationId = examinationId
    this.cause = cause
    this.name = 'AnalysisPipelineError'
  }
}

/**
 * Provider-neutral orchestration for the backend/Edge Function.
 * Original uploads are parallelized, while AI analysis only starts after all four references are persisted.
 */
export async function runAnalysisWorkflow(input: AnalysisWorkflowInput): Promise<AnalysisWorkflowResult> {
  const { examinationId, username, images, archive, provider, repository, diseaseMasterVersion, examinedAt } = input
  const idempotencyKey = input.idempotencyKey ?? `${examinationId}:${diseaseMasterVersion}`
  try {
    await repository.updateStatus(examinationId, 'uploading')
    await repository.updateStatus(examinationId, 'analyzing')

    const uploadTask = (async () => {
      const existing = input.existingImageReferences ?? await repository.getImageReferences(examinationId)
      const driveFolderId = existing.driveFolderId ?? await archive.createPrivateExaminationFolder(username, examinationId, examinedAt)
      const missingPositions = examinationPositions.filter((position) => !existing.driveFileIds[position])
      const uploaded = await Promise.all(missingPositions.map(async (position) => {
        const image = images[position]
        if (!image) throw new Error(`Missing image for ${position}`)
        const driveFileId = await archive.uploadOriginal(driveFolderId, position, image)
        await Promise.all([
          repository.saveImageReference({
            examinationId,
            position,
            driveFolderId,
            driveFileId,
            metadata: { contentType: image.type, size: image.size },
          }),
          appendAuditSafely(input, 'image_uploaded', 'image', `${examinationId}:${position}`, { position }),
        ])
        return [position, driveFileId] as const
      }))
      const imageReferences = { ...existing.driveFileIds, ...Object.fromEntries(uploaded) } as Record<FootPosition, string>
      const missingAfterUpload = examinationPositions.filter((position) => !imageReferences[position])
      if (missingAfterUpload.length > 0) throw new Error(`Missing image references: ${missingAfterUpload.join(', ')}`)
      return { driveFolderId, imageReferences }
    })()

    const analysisTask = (async () => {
      const analysisImages = await input.analysisImages
      const fallbackReferences = analysisImages ? {} : (await uploadTask).imageReferences
      await appendAuditSafely(input, 'ai_analysis_started', 'ai_analysis', examinationId, { idempotencyKey, diseaseMasterVersion })
      return provider.analyze({ examinationId, idempotencyKey, imageReferences: fallbackReferences, analysisImages, diseaseMasterVersion })
    })()

    const [{ driveFolderId, imageReferences }, analysis] = await Promise.all([uploadTask, analysisTask])
    await Promise.all([
      appendAuditSafely(input, 'ai_analysis_completed', 'ai_analysis', analysis.runId, { findingCount: analysis.findings.length }),
      repository.saveAiAnalysis({
      examinationId,
      idempotencyKey,
      provider: 'provider-adapter',
      model: 'configured-server-model',
      diseaseMasterRevision: Number.parseInt(diseaseMasterVersion, 10) || 1,
      rawResult: analysis.rawResult,
      validation: analysis.validation,
      }),
    ])
    await appendAuditSafely(input, 'ai_result_recorded', 'ai_analysis', analysis.runId, { validationStatus: analysis.validation.status })
    await repository.updateStatus(examinationId, 'awaiting_review')

    return { examinationId, driveFolderId, driveFileIds: imageReferences, runId: analysis.runId, findings: analysis.findings }
  } catch (cause) {
    try {
      await repository.updateStatus(examinationId, 'analysis_failed')
    } catch {
      // Keep the original failure as the actionable error; the backend should log this secondary failure.
    }
    if (cause instanceof AnalysisPipelineError) throw cause
    throw new AnalysisPipelineError('Examination analysis pipeline failed', examinationId, cause)
  }
}

async function appendAudit(input: AnalysisWorkflowInput, eventType: 'image_uploaded' | 'ai_analysis_started' | 'ai_analysis_completed' | 'ai_result_recorded', entityType: 'image' | 'ai_analysis', entityId: string, payload: Record<string, unknown>): Promise<void> {
  await input.auditLogger?.append({ actorId: input.actorId ?? null, eventType, entityType, entityId, payload })
}

async function appendAuditSafely(input: AnalysisWorkflowInput, eventType: 'image_uploaded' | 'ai_analysis_started' | 'ai_analysis_completed' | 'ai_result_recorded', entityType: 'image' | 'ai_analysis', entityId: string, payload: Record<string, unknown>): Promise<void> {
  try {
    await appendAudit(input, eventType, entityType, entityId, payload)
  } catch (error) {
    console.warn('Audit event could not be recorded', eventType, error)
  }
}
