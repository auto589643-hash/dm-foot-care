import type { FootPosition } from '../types'

const LEGACY_DRAFT_KEY = 'dmfc-examination-draft-v1'
const DATABASE_NAME = 'dmfc-local'
const DATABASE_VERSION = 1
const STORE_NAME = 'examination-drafts'
const ACTIVE_KEY = 'active'

export interface ExaminationDraftSnapshot {
  stage: 'capture' | 'review'
  step: number
  photos: Partial<Record<FootPosition, string>>
  updatedAt: number
}

type StoredDraft = Omit<ExaminationDraftSnapshot, 'photos'> & {
  key: typeof ACTIVE_KEY
  photos: Partial<Record<FootPosition, Blob>>
}

let writeQueue: Promise<void> = Promise.resolve()
let databasePromise: Promise<IDBDatabase> | null = null

function isPosition(value: string): value is FootPosition {
  return value === 'left-dorsal' || value === 'left-sole' || value === 'right-dorsal' || value === 'right-sole'
}

function indexedDbAvailable(): boolean {
  return typeof window !== 'undefined' && 'indexedDB' in window
}

function openDatabase(): Promise<IDBDatabase> {
  if (!indexedDbAvailable()) return Promise.reject(new Error('IndexedDB is unavailable'))
  if (databasePromise) return databasePromise
  const pending = new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: 'key' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open IndexedDB'))
    request.onblocked = () => reject(new Error('IndexedDB upgrade is blocked'))
  })
  databasePromise = pending.catch((error) => {
    databasePromise = null
    throw error
  })
  return databasePromise
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

async function getStoredDraft(): Promise<StoredDraft | null> {
  const database = await openDatabase()
  const transaction = database.transaction(STORE_NAME, 'readonly')
  const value = await requestResult(transaction.objectStore(STORE_NAME).get(ACTIVE_KEY) as IDBRequest<StoredDraft | undefined>)
  return value ?? null
}

async function putStoredDraft(value: StoredDraft): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction(STORE_NAME, 'readwrite')
  await requestResult(transaction.objectStore(STORE_NAME).put(value))
}

async function deleteStoredDraft(): Promise<void> {
  if (!indexedDbAvailable()) return
  const database = await openDatabase()
  const transaction = database.transaction(STORE_NAME, 'readwrite')
  await requestResult(transaction.objectStore(STORE_NAME).delete(ACTIVE_KEY))
}

function validateSnapshot(value: unknown): ExaminationDraftSnapshot | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  if ((record.stage !== 'capture' && record.stage !== 'review') || typeof record.step !== 'number' || !Number.isInteger(record.step) || record.step < 0 || record.step > 3) return null
  if (typeof record.photos !== 'object' || record.photos === null) return null
  const photos: Partial<Record<FootPosition, string>> = {}
  for (const [key, photo] of Object.entries(record.photos as Record<string, unknown>)) {
    if (isPosition(key) && typeof photo === 'string' && photo.startsWith('data:image/')) photos[key] = photo
  }
  return { stage: record.stage, step: record.step, photos, updatedAt: typeof record.updatedAt === 'number' ? record.updatedAt : Date.now() }
}

function readLegacyDraft(): ExaminationDraftSnapshot | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(LEGACY_DRAFT_KEY)
    return raw ? validateSnapshot(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

function removeLegacyDraft(): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.removeItem(LEGACY_DRAFT_KEY) } catch { /* best-effort migration cleanup */ }
}

function dataUrlToBlob(dataUrl: string): Blob {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/)
  if (!match) throw new Error('Unsupported draft image encoding')
  const binary = atob(match[2])
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new Blob([bytes], { type: match[1] || 'image/jpeg' })
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Could not restore draft image'))
    reader.readAsDataURL(blob)
  })
}

async function snapshotToStored(draft: Omit<ExaminationDraftSnapshot, 'updatedAt'>): Promise<StoredDraft> {
  const photos: Partial<Record<FootPosition, Blob>> = {}
  await Promise.all(Object.entries(draft.photos).map(async ([position, photo]) => {
    if (isPosition(position) && typeof photo === 'string' && photo.startsWith('data:image/')) photos[position] = dataUrlToBlob(photo)
  }))
  return { key: ACTIVE_KEY, stage: draft.stage, step: draft.step, photos, updatedAt: Date.now() }
}

async function storedToSnapshot(stored: StoredDraft): Promise<ExaminationDraftSnapshot | null> {
  if ((stored.stage !== 'capture' && stored.stage !== 'review') || !Number.isInteger(stored.step) || stored.step < 0 || stored.step > 3) return null
  const photos: Partial<Record<FootPosition, string>> = {}
  await Promise.all(Object.entries(stored.photos || {}).map(async ([position, blob]) => {
    if (isPosition(position) && blob instanceof Blob) photos[position] = await blobToDataUrl(blob)
  }))
  return { stage: stored.stage, step: stored.step, photos, updatedAt: stored.updatedAt || Date.now() }
}

export async function readExaminationDraft(): Promise<ExaminationDraftSnapshot | null> {
  await writeQueue
  if (indexedDbAvailable()) {
    try {
      const stored = await getStoredDraft()
      if (stored) return storedToSnapshot(stored)
      const legacy = readLegacyDraft()
      if (legacy) {
        await putStoredDraft(await snapshotToStored(legacy))
        removeLegacyDraft()
        return legacy
      }
      return null
    } catch {
      return readLegacyDraft()
    }
  }
  return readLegacyDraft()
}

export function saveExaminationDraft(draft: Omit<ExaminationDraftSnapshot, 'updatedAt'>): Promise<void> {
  const job = writeQueue.then(async () => {
    if (!indexedDbAvailable()) return
    try {
      await putStoredDraft(await snapshotToStored(draft))
      removeLegacyDraft()
    } catch {
      // Storage failure must never block an examination. Do not fall back to
      // localStorage for large photos because that recreates the main-thread
      // blocking/quota problem this store is designed to avoid.
    }
  })
  writeQueue = job.catch(() => {})
  return job
}

export function clearExaminationDraft(): Promise<void> {
  const job = writeQueue.then(async () => {
    removeLegacyDraft()
    try { await deleteStoredDraft() } catch { /* best-effort cleanup only */ }
  })
  writeQueue = job.catch(() => {})
  return job
}
