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
  /** Thumbnails may already have been generated while Gemini was running. */
  precomputedThumbnails?: Record<FootPosition, string>
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
  const { examinationId, images, thumbnailService, repository, confirmedFindings = [], confirmedBy, auditLogger, actorId, reviewChangedCount = 0, precomputedThumbnails } = input

  const markThumbnailFailed = async () => {
    try {
      await repository.updateStatus(examinationId, 'thumbnail_failed')
    } catch {
      // Preserve the original thumbnail failure if this secondary state write fails.
    }
  }

  if (confirmedBy && repository.finalizeExamination) {
    let thumbnails: Record<FootPosition, string>
    try {
      thumbnails = precomputedThumbnails ?? await thumbnailService.generateAndStore(examinationId, images)
      await repository.saveThumbnailReferences({ examinationId, thumbnails })
    } catch (cause) {
      await markThumbnailFailed()
      throw new FinalizePipelineError('สร้างภาพสรุปไม่สำเร็จ กรุณาลองอีกครั้งโดยไม่ต้องถ่ายภาพใหม่', examinationId, cause)
    }

    try {
      await repository.finalizeExamination({
        examinationId,
        confirmedBy,
        reviewChangedCount,
        findings: confirmedFindings.map((finding) => ({ diseaseId: finding.diseaseId, severity: finding.severity })),
      })
    } catch (cause) {
      throw new FinalizePipelineError('บันทึกผลตรวจไม่สำเร็จ กรุณาลองส่งผลอีกครั้งโดยไม่ต้องถ่ายภาพใหม่', examinationId, cause)
    }
    return thumbnails
  }

  try {
    await repository.updateStatus(examinationId, 'thumbnailing')
    if (confirmedBy && confirmedFindings.length) {
      if (repository.saveConfirmedFindings) {
        await repository.saveConfirmedFindings({
          examinationId,
          confirmedBy,
          findings: confirmedFindings.map((finding) => ({ diseaseId: finding.diseaseId, severity: finding.severity })),
        })
      } else {
        await Promise.all(confirmedFindings.map((finding) => repository.saveConfirmedFinding({
          examinationId,
          diseaseId: finding.diseaseId,
          severity: finding.severity,
          confirmedBy,
        })))
      }
    }
  } catch (cause) {
    throw new FinalizePipelineError('เตรียมการบันทึกผลตรวจไม่สำเร็จ กรุณาลองอีกครั้ง', examinationId, cause)
  }

  let thumbnails: Record<FootPosition, string>
  try {
    thumbnails = precomputedThumbnails ?? await thumbnailService.generateAndStore(examinationId, images)
    await repository.saveThumbnailReferences({ examinationId, thumbnails })
  } catch (cause) {
    await markThumbnailFailed()
    throw new FinalizePipelineError('สร้างภาพสรุปไม่สำเร็จ กรุณาลองอีกครั้งโดยไม่ต้องถ่ายภาพใหม่', examinationId, cause)
  }

  try {
    if (auditLogger && reviewChangedCount > 0) {
      await auditLogger.append({ actorId: actorId ?? null, eventType: 'human_review_edited', entityType: 'finding', entityId: examinationId, payload: { changedCount: reviewChangedCount } })
    }
    await auditLogger?.append({ actorId: actorId ?? null, eventType: 'final_result_submitted', entityType: 'examination', entityId: examinationId, payload: { confirmedFindingCount: confirmedFindings.length } })
    await repository.updateStatus(examinationId, 'confirmed')
  } catch (cause) {
    throw new FinalizePipelineError('บันทึกผลตรวจไม่สำเร็จ กรุณาลองส่งผลอีกครั้งโดยไม่ต้องถ่ายภาพใหม่', examinationId, cause)
  }
  return thumbnails
}
