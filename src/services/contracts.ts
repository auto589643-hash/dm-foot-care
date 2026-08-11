import type { AdminDashboard, Disease, Examination, Finding, FootPosition, KnowledgeArticle, Profile, RegistrationInput, Severity, UserRecord } from '../types'
import type { AiValidationResult } from './aiValidator.ts'

export interface AuthService {
  signInWithUsername(username: string, pin: string): Promise<Profile>
  register(input: RegistrationInput): Promise<void>
  signOut(): Promise<void>
  restoreSession(): Promise<Profile | null>
}

export interface OriginalImageArchive {
  createPrivateExaminationFolder(username: string, examinationId: string, examinedAt?: string): Promise<string>
  uploadOriginal(folderId: string, position: FootPosition, image: Blob): Promise<string>
  uploadOriginalWithReference?(input: {
    folderId: string
    examinationId: string
    position: FootPosition
    image: Blob
    metadata: Record<string, unknown>
  }): Promise<string>
}

export interface FootAssessmentProvider {
  analyze(input: {
    examinationId: string
    idempotencyKey: string
    imageReferences: Partial<Record<FootPosition, string>>
    analysisImages?: Partial<Record<FootPosition, string>>
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

export interface ExaminationRepository {
  createDraft(userId: string): Promise<ExaminationDraft>
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
  saveConfirmedFindings?(input: {
    examinationId: string
    findings: Array<{
      diseaseId: string
      severity: Severity | null
      aiFindingId?: string
    }>
    confirmedBy: string
  }): Promise<void>
  saveThumbnailReferences(input: {
    examinationId: string
    thumbnails: Record<FootPosition, string>
  }): Promise<void>
  updateStatus(examinationId: string, status: ExaminationDraft['status']): Promise<void>
}

export interface KnowledgeLibraryService {
  listPublished(): Promise<{ articles: KnowledgeArticle[]; diseases: Disease[] }>
  listSavedArticleIds(): Promise<string[]>
  setSaved(articleId: string, saved: boolean): Promise<void>
}

export interface AdminReadService {
  getBootstrap(): Promise<{ users: UserRecord[]; diseases: Disease[]; articles: KnowledgeArticle[]; dashboard: AdminDashboard | null; partial: boolean }>
  listUsers(): Promise<UserRecord[]>
  listUserExaminations(userId: string): Promise<Examination[]>
  getExaminationThumbnails(examinationId: string): Promise<Partial<Record<FootPosition, string>>>
  getExaminationOriginalImage(examinationId: string, position: FootPosition): Promise<Blob>
  getExaminationImage(examinationId: string, position: FootPosition): Promise<string>
  listDiseases(): Promise<Disease[]>
  listKnowledge(): Promise<KnowledgeArticle[]>
  getDashboard(): Promise<AdminDashboard>
}

export type AdminUserWriteInput = Omit<UserRecord, 'id' | 'age' | 'lastExam' | 'pinConfigured'> & { id?: string; pin?: string }
export type AdminDiseaseWriteInput = Omit<Disease, 'id'> & { id?: string }
export type AdminKnowledgeWriteInput = Omit<KnowledgeArticle, 'id'> & { id?: string }

export interface AdminService extends AdminReadService {
  saveUser(input: AdminUserWriteInput): Promise<UserRecord>
  setUserStatus(userId: string, status: UserRecord['status']): Promise<void>
  deletePendingUser(userId: string): Promise<void>
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