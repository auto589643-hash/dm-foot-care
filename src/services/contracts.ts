import type { Disease, Examination, Finding, FootPosition, KnowledgeArticle, Profile, Severity, UserRecord } from '../types'
import type { AiValidationResult } from './aiValidator.ts'

/** Client-safe boundary. Production implementation calls a backend username mapping endpoint. */
export interface AuthService {
  signInWithUsername(username: string, pin: string): Promise<Profile>
  signOut(): Promise<void>
  restoreSession(): Promise<Profile | null>
}

/** Original image uploads must be implemented server-side; never send Drive credentials to this client. */
export interface OriginalImageArchive {
  createPrivateExaminationFolder(username: string, examinationId: string, examinedAt?: string): Promise<string>
  uploadOriginal(folderId: string, position: FootPosition, image: Blob): Promise<string>
}

/** Provider-neutral AI adapter. Backend must validate disease IDs and structured output. */
export interface FootAssessmentProvider {
  analyze(input: {
    examinationId: string
    idempotencyKey: string
    imageReferences: Record<FootPosition, string>
    diseaseMasterVersion: string
  }): Promise<{
    runId: string
    rawResult: unknown
    validation: AiValidationResult
    findings: Finding[]
  }>
}

export interface ThumbnailService {
  generateAndStore(examinationId: string, images: Record<FootPosition, Blob>): Promise<Record<FootPosition, string>>
}

export interface ExaminationDraft {
  id: string
  userId: string
  status: 'draft' | 'uploading' | 'analyzing' | 'awaiting_review' | 'thumbnailing' | 'confirmed' | 'analysis_failed' | 'thumbnail_failed'
}

/** Persistence boundary for the resumable examination pipeline. */
export interface ExaminationRepository {
  createDraft(userId: string): Promise<ExaminationDraft>
  /** Optional read boundary used by the production patient Home/History screens. */
  listForCurrentUser?(): Promise<Examination[]>
  getImageReferences(examinationId: string): Promise<{
    driveFolderId: string | null
    driveFileIds: Partial<Record<FootPosition, string>>
  }>
  saveImageReference(input: {
    examinationId: string
    position: FootPosition
    driveFolderId: string
    driveFileId: string
    metadata: Record<string, unknown>
  }): Promise<void>
  saveAiAnalysis(input: {
    examinationId: string
    idempotencyKey: string
    provider: string
    model: string
    diseaseMasterRevision: number
    rawResult: unknown
    validation: AiValidationResult
  }): Promise<{ runId: string }>
  saveConfirmedFinding(input: {
    examinationId: string
    diseaseId: string
    severity: Severity | null
    aiFindingId?: string
    confirmedBy: string
  }): Promise<void>
  saveThumbnailReferences(input: {
    examinationId: string
    thumbnails: Record<FootPosition, string>
  }): Promise<void>
  updateStatus(examinationId: string, status: ExaminationDraft['status']): Promise<void>
}

/** Published patient-facing content plus the disease labels used by filters. */
export interface KnowledgeLibraryService {
  listPublished(): Promise<{ articles: KnowledgeArticle[]; diseases: Disease[] }>
}

/** Read-only staff boundary. Mutations stay behind privileged backend endpoints. */
export interface AdminReadService {
  listUsers(): Promise<UserRecord[]>
  listUserExaminations(userId: string): Promise<Examination[]>
  listDiseases(): Promise<Disease[]>
  listKnowledge(): Promise<KnowledgeArticle[]>
}

export type AdminUserWriteInput = Omit<UserRecord, 'id' | 'age' | 'lastExam' | 'pinConfigured'> & { id?: string; pin?: string }
export type AdminDiseaseWriteInput = Omit<Disease, 'id'> & { id?: string }
export type AdminKnowledgeWriteInput = Omit<KnowledgeArticle, 'id'> & { id?: string }

export interface AdminService extends AdminReadService {
  saveUser(input: AdminUserWriteInput): Promise<UserRecord>
  setUserStatus(userId: string, status: UserRecord['status']): Promise<void>
  resetUserPin(userId: string): Promise<void>
  saveDisease(input: AdminDiseaseWriteInput): Promise<Disease>
  setDiseaseActive(diseaseId: string, active: boolean): Promise<void>
  saveKnowledge(input: AdminKnowledgeWriteInput): Promise<KnowledgeArticle>
}

export const integrationGuardrails = {
  clientSafeEnvironmentVariables: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'],
  serverOnlyEnvironmentVariables: ['SUPABASE_SECRET_KEY', 'GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON', 'CLOUD_AI_API_KEY'],
  rejectUnknownDiseaseIds: true,
  preserveRawAiResult: true,
} as const
