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
    const existing = input.existingImageReferences ?? await repository.getImageReferences(examinationId)
    const driveFolderId = existing.driveFolderId ?? await archive.createPrivateExaminationFolder(username, examinationId, examinedAt)
    const missingPositions = examinationPositions.filter((position) => !existing.driveFileIds[position])
    const uploaded = await Promise.all(missingPositions.map(async (position) => {
      const image = images[position]
      if (!image) throw new Error(`Missing image for ${position}`)
      const driveFileId = await archive.uploadOriginal(driveFolderId, position, image)
      await repository.saveImageReference({
        examinationId,
        position,
        driveFolderId,
        driveFileId,
        metadata: { contentType: image.type, size: image.size },
      })
      await appendAudit(input, 'image_uploaded', 'image', `${examinationId}:${position}`, { position })
      return [position, driveFileId] as const
    }))

    const imageReferences = { ...existing.driveFileIds, ...Object.fromEntries(uploaded) } as Record<FootPosition, string>
    const missingAfterUpload = examinationPositions.filter((position) => !imageReferences[position])
    if (missingAfterUpload.length > 0) throw new Error(`Missing image references: ${missingAfterUpload.join(', ')}`)
    await repository.updateStatus(examinationId, 'analyzing')
    await appendAudit(input, 'ai_analysis_started', 'ai_analysis', examinationId, { idempotencyKey, diseaseMasterVersion })
    const analysis = await provider.analyze({ examinationId, idempotencyKey, imageReferences, diseaseMasterVersion })
    await appendAudit(input, 'ai_analysis_completed', 'ai_analysis', analysis.runId, { findingCount: analysis.findings.length })
    await repository.saveAiAnalysis({
      examinationId,
      idempotencyKey,
      provider: 'provider-adapter',
      model: 'configured-server-model',
      diseaseMasterRevision: Number.parseInt(diseaseMasterVersion, 10) || 1,
      rawResult: analysis.rawResult,
      validation: analysis.validation,
    })
    await appendAudit(input, 'ai_result_recorded', 'ai_analysis', analysis.runId, { validationStatus: analysis.validation.status })
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
