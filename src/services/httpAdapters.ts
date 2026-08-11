import type { Examination, Finding, FootPosition, Profile, Severity } from '../types.ts'
import type { AiValidationResult } from './aiValidator.ts'
import { buildOriginalDriveFilename } from './drivePath.ts'
import { createThumbnails } from './thumbnailService.ts'
import { createAuditEvent, type AuditEventInput, type AuditLogger } from './auditLog.ts'
import { normalizeDiseaseList, requireDisease } from './runtimeMappers.ts'
import type {
  AdminService,
  AuthService,
  ExaminationDraft,
  ExaminationRepository,
  FootAssessmentProvider,
  KnowledgeLibraryService,
  OriginalImageArchive,
  ThumbnailService,
} from './contracts.ts'

export interface BackendHttpClientOptions {
  baseUrl: string
  getAccessToken?: () => string | null | Promise<string | null>
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

export interface HttpAuthServiceOptions {
  onAccessToken?: (token: string | null) => void
}

export class HttpIntegrationError extends Error {
  readonly status: number
  readonly details: unknown

  constructor(message: string, status: number, details?: unknown) {
    super(message)
    this.name = 'HttpIntegrationError'
    this.status = status
    this.details = details
  }
}

/** Browser-safe transport. It only sends the user's access token, never service credentials. */
export class BackendHttpClient {
  private readonly baseUrl: string
  private readonly getAccessToken?: BackendHttpClientOptions['getAccessToken']
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number
  private readonly inFlightGets = new Map<string, Promise<unknown>>()

  constructor(options: BackendHttpClientOptions) {
    if (!options.baseUrl.trim()) throw new Error('Backend API base URL is required')
    const parsedBaseUrl = new URL(options.baseUrl)
    if (parsedBaseUrl.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(parsedBaseUrl.hostname)) {
      throw new Error('Backend API must use HTTPS outside local development')
    }
    this.baseUrl = options.baseUrl.endsWith('/') ? options.baseUrl : `${options.baseUrl}/`
    this.getAccessToken = options.getAccessToken
    // Window.fetch requires its global receiver; bind it so the client also
    // works when the transport is stored as a class field and invoked later.
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
    this.timeoutMs = options.timeoutMs ?? 20_000
  }

  async get<T>(path: string): Promise<T> {
    const pending = this.inFlightGets.get(path)
    if (pending) return pending as Promise<T>
    const request = this.request<T>(path, { method: 'GET' })
    this.inFlightGets.set(path, request)
    try {
      return await request
    } finally {
      if (this.inFlightGets.get(path) === request) this.inFlightGets.delete(path)
    }
  }

  async getBlob(path: string, timeoutMs = 90_000): Promise<Blob> {
    const url = new URL(path.replace(/^\//, ''), this.baseUrl)
    const controller = new AbortController()
    const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs)
    const headers = new Headers({ accept: 'image/*' })
    const accessToken = await this.getAccessToken?.()
    if (accessToken) headers.set('authorization', `Bearer ${accessToken}`)
    try {
      const response = await this.fetchImpl(url, { method: 'GET', headers, signal: controller.signal, credentials: 'include' })
      if (!response.ok) {
        const raw = await response.text()
        const payload = parseResponse(raw)
        const message = typeof payload === 'object' && payload !== null && 'message' in payload && typeof payload.message === 'string' ? payload.message : `Backend request failed (${response.status})`
        throw new HttpIntegrationError(message, response.status, payload)
      }
      return response.blob()
    } catch (error) {
      if (error instanceof HttpIntegrationError) throw error
      if (error instanceof DOMException && error.name === 'AbortError') throw new HttpIntegrationError('Backend request timed out', 408)
      throw error
    } finally {
      globalThis.clearTimeout(timeoutId)
    }
  }

  async postJson<T>(path: string, body: unknown, timeoutMs?: number): Promise<T> {
    return this.request<T>(path, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }, timeoutMs)
  }

  async postBinary<T>(path: string, body: Blob, headers: Record<string, string> = {}, timeoutMs = 90_000): Promise<T> {
    return this.request<T>(path, { method: 'POST', body, headers: { 'content-type': body.type || 'application/octet-stream', ...headers } }, timeoutMs)
  }

  async patchJson<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PATCH', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' })
  }

  private async request<T>(path: string, init: RequestInit, timeoutOverrideMs?: number): Promise<T> {
    const url = new URL(path.replace(/^\//, ''), this.baseUrl)
    const controller = new AbortController()
    const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutOverrideMs ?? this.timeoutMs)
    const headers = new Headers(init.headers)
    headers.set('accept', 'application/json')
    const accessToken = await this.getAccessToken?.()
    if (accessToken) headers.set('authorization', `Bearer ${accessToken}`)

    try {
      const response = await this.fetchImpl(url, { ...init, headers, signal: controller.signal, credentials: 'include' })
      const raw = await response.text()
      const payload = parseResponse(raw)
      if (!response.ok) {
        const message = typeof payload === 'object' && payload !== null && 'message' in payload && typeof payload.message === 'string'
          ? payload.message
          : `Backend request failed (${response.status})`
        throw new HttpIntegrationError(message, response.status, payload)
      }
      return payload as T
    } catch (error) {
      if (error instanceof HttpIntegrationError) throw error
      if (error instanceof DOMException && error.name === 'AbortError') throw new HttpIntegrationError('Backend request timed out', 408)
      throw error
    } finally {
      globalThis.clearTimeout(timeoutId)
    }
  }
}

function parseResponse(raw: string): unknown {
  if (!raw) return undefined
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

export class HttpAuthService implements AuthService {
  private readonly client: BackendHttpClient
  private readonly onAccessToken?: HttpAuthServiceOptions['onAccessToken']

  constructor(client: BackendHttpClient, options: HttpAuthServiceOptions = {}) {
    this.client = client
    this.onAccessToken = options.onAccessToken
  }

  async signInWithUsername(username: string, pin: string): Promise<Profile> {
    const response = await this.client.postJson<SessionResponse>('/v1/auth/username/sign-in', { username, pin })
    this.onAccessToken?.(readAccessToken(response))
    return unwrapProfile(response)
  }

  async register(input: import('../types.ts').RegistrationInput): Promise<void> {
    await this.client.postJson('/v1/auth/register', input)
  }

  async signOut(): Promise<void> {
    await this.client.postJson('/v1/auth/sign-out', {})
    this.onAccessToken?.(null)
  }

  async restoreSession(): Promise<Profile | null> {
    try {
      const response = await this.client.get<SessionResponse>('/v1/auth/session')
      this.onAccessToken?.(readAccessToken(response))
      return unwrapProfile(response)
    } catch (error) {
      if (error instanceof HttpIntegrationError && error.status === 401) {
        this.onAccessToken?.(null)
        return null
      }
      throw error
    }
  }
}

/**
 * Sends sanitized event envelopes to the backend. The backend derives actor_id
 * from the access token; the browser never chooses the database actor.
 */
export class HttpAuditLogger implements AuditLogger {
  private readonly client: BackendHttpClient

  constructor(client: BackendHttpClient) {
    this.client = client
  }

  async append(input: AuditEventInput): Promise<void> {
    const event = createAuditEvent(input)
    await this.client.postJson('/v1/audit-events', {
      eventType: event.eventType,
      entityType: event.entityType,
      ...(event.entityId ? { entityId: event.entityId } : {}),
      payload: event.payload,
      occurredAt: event.occurredAt,
    })
  }
}

type SessionResponse = ({ profile?: Profile; accessToken?: string } | Profile)

function readAccessToken(response: SessionResponse): string | null {
  return typeof response === 'object' && response !== null && 'accessToken' in response && typeof response.accessToken === 'string'
    ? response.accessToken
    : null
}

function unwrapProfile(response: SessionResponse): Profile {
  return typeof response === 'object' && response !== null && 'profile' in response && response.profile ? response.profile : response as Profile
}

export class HttpOriginalImageArchive implements OriginalImageArchive {
  private readonly client: BackendHttpClient

  constructor(client: BackendHttpClient) {
    this.client = client
  }

  async createPrivateExaminationFolder(username: string, examinationId: string, examinedAt?: string): Promise<string> {
    // The backend derives username and the deterministic Drive path from the
    // bearer-token session. Keep username in the domain interface for the
    // in-memory adapter, but never send it as an authorization/path claim.
    void username
    const body = { examinationId, ...(examinedAt ? { examinedAt } : {}) }
    const response = await this.client.postJson<{ folderId: string }>('/v1/original-images/folders', body)
    return response.folderId
  }

  private async upload(folderId: string, position: FootPosition, image: Blob, examinationId?: string): Promise<string> {
    const response = await this.client.postBinary<{ fileId: string }>('/v1/original-images', image, {
      'x-dmfc-drive-folder': folderId,
      'x-dmfc-image-position': position,
      ...(examinationId ? { 'x-dmfc-examination-id': examinationId } : {}),
      // HTTP header values are ByteStrings. Percent-encode Thai file names in
      // transit, then the server decodes them before calling Google Drive.
      'x-dmfc-drive-filename': encodeURIComponent(buildOriginalDriveFilename(position, image.type)),
    })
    return response.fileId
  }

  async uploadOriginal(folderId: string, position: FootPosition, image: Blob): Promise<string> {
    return this.upload(folderId, position, image)
  }

  async uploadOriginalWithReference(input: { folderId: string; examinationId: string; position: FootPosition; image: Blob; metadata: Record<string, unknown> }): Promise<string> {
    void input.metadata
    return this.upload(input.folderId, input.position, input.image, input.examinationId)
  }
}

export class HttpFootAssessmentProvider implements FootAssessmentProvider {
  private readonly client: BackendHttpClient

  constructor(client: BackendHttpClient) {
    this.client = client
  }

  async analyze(input: { examinationId: string; idempotencyKey: string; imageReferences: Partial<Record<FootPosition, string>>; analysisImages?: Partial<Record<FootPosition, string>>; diseaseMasterVersion: string }): Promise<{ runId: string; rawResult: unknown; validation: AiValidationResult; findings: Finding[] }> {
    return this.client.postJson('/v1/analysis', input, 120_000)
  }
}

export class HttpThumbnailService implements ThumbnailService {
  private readonly client: BackendHttpClient

  constructor(client: BackendHttpClient) {
    this.client = client
  }

  async generateAndStore(examinationId: string, images: Record<FootPosition, Blob>): Promise<Record<FootPosition, string>> {
    const originals = Object.fromEntries(await Promise.all(Object.entries(images).map(async ([position, image]) => [position, await blobToDataUrl(image)]))) as Partial<Record<FootPosition, string>>
    const thumbnails = await createThumbnails(originals)
    const response = await this.client.postJson<{ thumbnails: Record<FootPosition, string> }>(`/v1/examinations/${encodeURIComponent(examinationId)}/thumbnails`, { thumbnails }, 90_000)
    return response.thumbnails
  }
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  return `data:${blob.type || 'image/jpeg'};base64,${btoa(binary)}`
}

export class HttpExaminationRepository implements ExaminationRepository {
  private readonly client: BackendHttpClient

  constructor(client: BackendHttpClient) {
    this.client = client
  }

  async createDraft(userId: string): Promise<ExaminationDraft> {
    // The backend derives ownership from the bearer token. Keep the interface
    // compatible with the in-memory adapter, but never let a browser-supplied
    // user ID become an authorization input.
    void userId
    return this.client.postJson('/v1/examinations/drafts', {})
  }

  async listForCurrentUser(includeThumbnails = false): Promise<Examination[]> {
    const path = includeThumbnails ? '/v1/examinations?includeThumbnails=true' : '/v1/examinations'
    const response = await this.client.get<Examination[] | { examinations?: Examination[] }>(path)
    return Array.isArray(response) ? response : response.examinations ?? []
  }

  async getImageReferences(examinationId: string): Promise<{ driveFolderId: string | null; driveFileIds: Partial<Record<FootPosition, string>> }> {
    return this.client.get(`/v1/examinations/${encodeURIComponent(examinationId)}/images`)
  }

  async saveImageReference(input: { examinationId: string; position: FootPosition; driveFolderId: string; driveFileId: string; metadata: Record<string, unknown> }): Promise<void> {
    await this.client.postJson(`/v1/examinations/${encodeURIComponent(input.examinationId)}/images/${input.position}`, input)
  }

  async saveAiAnalysis(input: { examinationId: string; idempotencyKey: string; provider: string; model: string; diseaseMasterRevision: number; rawResult: unknown; validation: AiValidationResult }): Promise<{ runId: string }> {
    return this.client.postJson(`/v1/examinations/${encodeURIComponent(input.examinationId)}/analysis-runs`, input)
  }

  async saveConfirmedFinding(input: { examinationId: string; diseaseId: string; severity: Severity | null; aiFindingId?: string; confirmedBy: string }): Promise<void> {
    // The server derives confirmed_by from the bearer token. The field remains
    // in the domain interface for the in-memory adapter, but never crosses the
    // browser/backend boundary as an authorization claim.
    const { confirmedBy: _confirmedBy, ...serverInput } = input
    void _confirmedBy
    await this.client.postJson(`/v1/examinations/${encodeURIComponent(input.examinationId)}/confirmed-findings`, serverInput)
  }

  async saveConfirmedFindings(input: { examinationId: string; findings: Array<{ diseaseId: string; severity: Severity | null; aiFindingId?: string }>; confirmedBy: string }): Promise<void> {
    void input.confirmedBy
    await this.client.postJson(`/v1/examinations/${encodeURIComponent(input.examinationId)}/confirmed-findings`, { findings: input.findings })
  }

  async finalizeExamination(input: { examinationId: string; findings: Array<{ diseaseId: string; severity: Severity | null; aiFindingId?: string }>; confirmedBy: string; reviewChangedCount: number }): Promise<void> {
    void input.confirmedBy
    await this.client.postJson(`/v1/examinations/${encodeURIComponent(input.examinationId)}/finalize`, {
      findings: input.findings,
      reviewChangedCount: input.reviewChangedCount,
    })
  }

  async saveThumbnailReferences(input: { examinationId: string; thumbnails: Record<FootPosition, string> }): Promise<void> {
    // The thumbnail endpoint atomically stores each object and its private
    // storage path. Its response contains short-lived display URLs, which must
    // never be written back into thumbnail_path.
    void input
  }

  async updateStatus(examinationId: string, status: ExaminationDraft['status']): Promise<void> {
    await this.client.patchJson(`/v1/examinations/${encodeURIComponent(examinationId)}/status`, { status })
  }
}

export class HttpKnowledgeLibraryService implements KnowledgeLibraryService {
  private readonly client: BackendHttpClient
  constructor(client: BackendHttpClient) { this.client = client }
  async listPublished(options?: { limit?: number; includeDiseaseImages?: boolean }): Promise<{ articles: import('../types.ts').KnowledgeArticle[]; diseases: import('../types.ts').Disease[] }> {
    const query = new URLSearchParams()
    if (options?.limit) query.set('limit', String(options.limit))
    if (options?.includeDiseaseImages === false) query.set('includeDiseaseImages', 'false')
    const path = query.size ? `/v1/knowledge?${query}` : '/v1/knowledge'
    const response = await this.client.get<{ articles?: import('../types.ts').KnowledgeArticle[]; diseases?: import('../types.ts').Disease[] } | import('../types.ts').KnowledgeArticle[]>(path)
    if (Array.isArray(response)) return { articles: response, diseases: [] }
    return { articles: response.articles ?? [], diseases: normalizeDiseaseList(response.diseases) }
  }
  async listSavedArticleIds(): Promise<string[]> {
    const response = await this.client.get<{ articleIds?: string[] }>('/v1/knowledge/saved')
    return Array.isArray(response.articleIds) ? response.articleIds : []
  }
  async setSaved(articleId: string, saved: boolean): Promise<void> {
    await this.client.postJson('/v1/knowledge/saved', { articleId, saved })
  }
}

export class HttpAdminService implements AdminService {
  private readonly client: BackendHttpClient

  constructor(client: BackendHttpClient) {
    this.client = client
  }

  async getBootstrap(): Promise<{ users: import('../types.ts').UserRecord[]; diseases: import('../types.ts').Disease[]; articles: import('../types.ts').KnowledgeArticle[]; dashboard: import('../types.ts').AdminDashboard | null; partial: boolean }> {
    const response = await this.client.get<{ users?: import('../types.ts').UserRecord[]; diseases?: unknown; articles?: import('../types.ts').KnowledgeArticle[]; dashboard?: import('../types.ts').AdminDashboard | null; partial?: boolean }>('/v1/admin/bootstrap')
    return { users: response.users ?? [], diseases: normalizeDiseaseList(response.diseases), articles: response.articles ?? [], dashboard: response.dashboard ?? null, partial: Boolean(response.partial) }
  }

  async getDashboard(): Promise<import('../types.ts').AdminDashboard> {
    return this.client.get('/v1/admin/dashboard')
  }

  async listUsers(): Promise<import('../types.ts').UserRecord[]> {
    return readArrayResponse(await this.client.get<import('../types.ts').UserRecord[] | { users?: import('../types.ts').UserRecord[] }>('/v1/admin/users'), 'users')
  }

  async listUserExaminations(userId: string): Promise<import('../types.ts').Examination[]> {
    return readArrayResponse(await this.client.get<import('../types.ts').Examination[] | { examinations?: import('../types.ts').Examination[] }>(`/v1/admin/users/${encodeURIComponent(userId)}/examinations`), 'examinations')
  }

  async getExaminationThumbnails(examinationId: string): Promise<Partial<Record<FootPosition, string>>> {
    const response = await this.client.get<{ thumbnails?: Partial<Record<FootPosition, string>> }>(`/v1/admin/examinations/${encodeURIComponent(examinationId)}/thumbnails`)
    return response.thumbnails ?? {}
  }

  async getExaminationOriginalImage(examinationId: string, position: FootPosition): Promise<Blob> {
    return this.client.getBlob(`/v1/admin/examinations/${encodeURIComponent(examinationId)}/images/${encodeURIComponent(position)}?variant=original`)
  }

  async getExaminationImage(examinationId: string, position: FootPosition): Promise<string> {
    const response = await this.client.get<{ url: string }>(`/v1/admin/examinations/${encodeURIComponent(examinationId)}/images/${encodeURIComponent(position)}`)
    if (!response.url) throw new Error('ไม่พบ URL รูปจากการตรวจ')
    return response.url
  }

  async listDiseases(): Promise<import('../types.ts').Disease[]> {
    const response = await this.client.get<import('../types.ts').Disease[] | { diseases?: unknown }>('/v1/admin/diseases')
    return normalizeDiseaseList(Array.isArray(response) ? response : response.diseases)
  }

  async listKnowledge(): Promise<import('../types.ts').KnowledgeArticle[]> {
    return readArrayResponse(await this.client.get<import('../types.ts').KnowledgeArticle[] | { articles?: import('../types.ts').KnowledgeArticle[] }>('/v1/admin/knowledge'), 'articles')
  }

  async saveUser(input: import('./contracts.ts').AdminUserWriteInput): Promise<import('../types.ts').UserRecord> {
    const path = input.id ? `/v1/admin/users/${encodeURIComponent(input.id)}` : '/v1/admin/users'
    if (input.id) {
      await this.client.patchJson(path, input)
      const saved = (await this.listUsers()).find((user) => user.id === input.id)
      if (!saved) throw new Error('ไม่พบข้อมูลผู้ใช้หลังบันทึก')
      return saved
    }
    const response = await this.client.postJson<import('../types.ts').UserRecord | { user?: import('../types.ts').UserRecord }>(path, input)
    return readObjectResponse(response, 'user')
  }

  async setUserStatus(userId: string, status: import('../types.ts').UserRecord['status']): Promise<void> {
    await this.client.patchJson(`/v1/admin/users/${encodeURIComponent(userId)}/status`, { status })
  }

  async deletePendingUser(userId: string): Promise<void> {
    await this.client.delete(`/v1/admin/users/${encodeURIComponent(userId)}`)
  }

  async resetUserPin(userId: string): Promise<void> {
    await this.client.postJson(`/v1/admin/users/${encodeURIComponent(userId)}/reset-pin`, {})
  }

  async saveDisease(input: import('./contracts.ts').AdminDiseaseWriteInput): Promise<import('../types.ts').Disease> {
    const path = input.id ? `/v1/admin/diseases/${encodeURIComponent(input.id)}` : '/v1/admin/diseases'
    const response = input.id
      ? await this.client.patchJson<import('../types.ts').Disease | { disease?: import('../types.ts').Disease }>(path, input)
      : await this.client.postJson<import('../types.ts').Disease | { disease?: import('../types.ts').Disease }>(path, input)
    return requireDisease(readObjectResponse(response, 'disease'))
  }

  async setDiseaseActive(diseaseId: string, active: boolean): Promise<void> {
    await this.client.patchJson(`/v1/admin/diseases/${encodeURIComponent(diseaseId)}/status`, { active })
  }

  async saveKnowledge(input: import('./contracts.ts').AdminKnowledgeWriteInput): Promise<import('../types.ts').KnowledgeArticle> {
    const path = input.id ? `/v1/admin/knowledge/${encodeURIComponent(input.id)}` : '/v1/admin/knowledge'
    const response = input.id
      ? await this.client.patchJson<import('../types.ts').KnowledgeArticle | { article?: import('../types.ts').KnowledgeArticle }>(path, input)
      : await this.client.postJson<import('../types.ts').KnowledgeArticle | { article?: import('../types.ts').KnowledgeArticle }>(path, input)
    return readObjectResponse(response, 'article')
  }
}

function readArrayResponse<T>(response: T[] | Record<string, T[] | undefined>, key: string): T[] {
  return Array.isArray(response) ? response : response[key] ?? []
}

function readObjectResponse<T>(response: T | Record<string, T | undefined>, key: string): T {
  if (typeof response === 'object' && response !== null && !Array.isArray(response) && key in response) {
    return (response as Record<string, T | undefined>)[key] as T
  }
  return response as T
}

export { HttpAdminService as HttpAdminReadService }

export function createHttpIntegrations(options: BackendHttpClientOptions & HttpAuthServiceOptions) {
  const client = new BackendHttpClient(options)
  return {
    client,
    auth: new HttpAuthService(client, options),
    audit: new HttpAuditLogger(client),
    admin: new HttpAdminService(client),
    archive: new HttpOriginalImageArchive(client),
    provider: new HttpFootAssessmentProvider(client),
    thumbnails: new HttpThumbnailService(client),
    repository: new HttpExaminationRepository(client),
    knowledge: new HttpKnowledgeLibraryService(client),
  }
}
