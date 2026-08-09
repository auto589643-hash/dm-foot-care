import type { ExaminationRepository, OriginalImageArchive, ThumbnailService } from './contracts.ts'
import type { FootPosition } from '../types.ts'
import { createThumbnail } from './thumbnailService.ts'

/** Development-only private archive substitute. It preserves the same reference shape as Drive. */
export class InMemoryOriginalImageArchive implements OriginalImageArchive {
  private readonly folders = new Map<string, Set<FootPosition>>()

  async createPrivateExaminationFolder(username: string, examinationId: string, _examinedAt?: string): Promise<string> {
    void _examinedAt
    const folderId = `mock-drive/${username}_${examinationId}`
    this.folders.set(folderId, new Set())
    return folderId
  }

  async uploadOriginal(folderId: string, position: FootPosition, image: Blob): Promise<string> {
    void image
    const folder = this.folders.get(folderId)
    if (!folder) throw new Error('Mock archive folder does not exist')
    folder.add(position)
    return `${folderId}/${position}.original`
  }
}

/** Development-only repository substitute for status and image-reference transitions. */
export class InMemoryExaminationRepository implements ExaminationRepository {
  readonly statuses: string[] = []
  readonly imageReferences: Partial<Record<FootPosition, string>> = {}
  readonly aiRuns: unknown[] = []
  readonly thumbnailReferences: Record<string, string> = {}
  driveFolderId: string | null = null

  async createDraft(userId: string) { return { id: `mock-${userId}`, userId, status: 'draft' as const } }
  async getImageReferences() { return { driveFolderId: this.driveFolderId, driveFileIds: { ...this.imageReferences } } }
  async saveImageReference(input: { position: FootPosition; driveFolderId: string; driveFileId: string }) { this.driveFolderId = input.driveFolderId; this.imageReferences[input.position] = input.driveFileId }
  async saveAiAnalysis(input: { rawResult: unknown }) { this.aiRuns.push(input.rawResult); return { runId: `mock-run-${this.aiRuns.length}` } }
  async saveConfirmedFinding() {}
  async saveThumbnailReferences(input: { thumbnails: Record<FootPosition, string> }) { Object.assign(this.thumbnailReferences, input.thumbnails) }
  async updateStatus(_examinationId: string, status: Parameters<ExaminationRepository['updateStatus']>[1]) { this.statuses.push(status) }
}

/** Convert captured data URLs into the Blob boundary expected by archive adapters. */
export async function photosToBlobs(photos: Record<FootPosition, string>): Promise<Record<FootPosition, Blob>> {
  const entries = await Promise.all(Object.entries(photos).map(async ([position, dataUrl]) => {
    if (dataUrl === 'demo') {
      const demoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640"><rect width="640" height="640" fill="#e9f1f7"/><ellipse cx="320" cy="335" rx="116" ry="235" fill="#d39a7a"/><circle cx="282" cy="108" r="26" fill="#d39a7a"/><circle cx="329" cy="85" r="24" fill="#d39a7a"/><circle cx="373" cy="91" r="22" fill="#d39a7a"/><circle cx="412" cy="116" r="19" fill="#d39a7a"/></svg>`
      return [position, new Blob([demoSvg], { type: 'image/svg+xml' })] as const
    }
    const response = await fetch(dataUrl)
    return [position, await response.blob()] as const
  }))
  return Object.fromEntries(entries) as Record<FootPosition, Blob>
}

/** Browser adapter for the post-confirmation worker boundary. */
export class BrowserThumbnailService implements ThumbnailService {
  async generateAndStore(examinationId: string, images: Record<FootPosition, Blob>): Promise<Record<FootPosition, string>> {
    const entries = await Promise.all(Object.entries(images).map(async ([position, image]) => {
      const dataUrl = await blobToDataUrl(image)
      const thumbnail = await createThumbnail(dataUrl)
      return [position, thumbnail || `mock-thumbnail/${examinationId}/${position}.webp`] as const
    }))
    return Object.fromEntries(entries) as Record<FootPosition, string>
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    if (typeof FileReader === 'undefined') {
      resolve('')
      return
    }
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => resolve('')
    reader.readAsDataURL(blob)
  })
}
