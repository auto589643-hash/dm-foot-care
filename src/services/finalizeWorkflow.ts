import type { AuditLogger } from './auditLog.ts'
import type { ExaminationRepository, ThumbnailService } from './contracts.ts'
import type { Finding, FootPosition } from '../types.ts'

export interface FinalizeExaminationInput {
  examinationId: string
  images: Record<FootPosition, Blob>
  thumbnailService: ThumbnailService
  repository: ExaminationRepository
  /** Optional in the demo adapter; required by the backend path to persist human confirmation. */
  confirmedFindings?: Finding[]
  confirmedBy?: string
  auditLogger?: AuditLogger
  actorId?: string | null
  reviewChangedCount?: number
}

export class FinalizePipelineError extends Error {
  readonly examinationId: string
  readonly cause?: unknown

  constructor(message: string, examinationId: string, cause?: unknown) {
    super(message)
    this.name = 'FinalizePipelineError'
    this.examinationId = examinationId
    this.cause = cause
  }
}

/** Generate web-only thumbnails after the final clinical result is confirmed. */
export async function finalizeExamination(input: FinalizeExaminationInput): Promise<Record<FootPosition, string>> {
  const { examinationId, images, thumbnailService, repository, confirmedFindings = [], confirmedBy, auditLogger, actorId, reviewChangedCount = 0 } = input
  try {
    await repository.updateStatus(examinationId, 'thumbnailing')
    if (confirmedBy) {
      await Promise.all(confirmedFindings.map((finding) => repository.saveConfirmedFinding({
        examinationId,
        diseaseId: finding.diseaseId,
        severity: finding.severity,
        confirmedBy,
      })))
    }
    const thumbnails = await thumbnailService.generateAndStore(examinationId, images)
    await repository.saveThumbnailReferences({ examinationId, thumbnails })
    if (auditLogger && reviewChangedCount > 0) {
      await auditLogger.append({ actorId: actorId ?? null, eventType: 'human_review_edited', entityType: 'finding', entityId: examinationId, payload: { changedCount: reviewChangedCount } })
    }
    await auditLogger?.append({ actorId: actorId ?? null, eventType: 'final_result_submitted', entityType: 'examination', entityId: examinationId, payload: { confirmedFindingCount: confirmedFindings.length } })
    await repository.updateStatus(examinationId, 'confirmed')
    return thumbnails
  } catch (cause) {
    try {
      await repository.updateStatus(examinationId, 'thumbnail_failed')
    } catch {
      // Preserve the original failure while the backend logs this secondary state-write failure.
    }
    throw new FinalizePipelineError('Thumbnail generation failed after confirmation', examinationId, cause)
  }
}
