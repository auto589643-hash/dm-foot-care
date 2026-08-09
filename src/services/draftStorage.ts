import type { FootPosition } from '../types'

const DRAFT_KEY = 'dmfc-examination-draft-v1'

export interface ExaminationDraftSnapshot {
  stage: 'capture' | 'review'
  step: number
  photos: Partial<Record<FootPosition, string>>
  updatedAt: number
}

function isPosition(value: string): value is FootPosition {
  return value === 'left-dorsal' || value === 'left-sole' || value === 'right-dorsal' || value === 'right-sole'
}

export function readExaminationDraft(): ExaminationDraftSnapshot | null {
  try {
    const stored = window.localStorage.getItem(DRAFT_KEY)
    if (!stored) return null
    const parsed: unknown = JSON.parse(stored)
    if (typeof parsed !== 'object' || parsed === null) return null
    const value = parsed as Record<string, unknown>
    if ((value.stage !== 'capture' && value.stage !== 'review') || typeof value.step !== 'number' || !Number.isInteger(value.step) || value.step < 0 || value.step > 3) return null
    if (typeof value.photos !== 'object' || value.photos === null) return null
    const photos: Partial<Record<FootPosition, string>> = {}
    for (const [key, photo] of Object.entries(value.photos as Record<string, unknown>)) {
      if (isPosition(key) && typeof photo === 'string' && (photo === 'demo' || photo.startsWith('data:image/'))) photos[key] = photo
    }
    return { stage: value.stage, step: value.step, photos, updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : Date.now() }
  } catch {
    return null
  }
}

export function saveExaminationDraft(draft: Omit<ExaminationDraftSnapshot, 'updatedAt'>): void {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, updatedAt: Date.now() }))
  } catch {
    // Private browsing or a full storage quota should not block an examination.
  }
}

export function clearExaminationDraft(): void {
  try {
    window.localStorage.removeItem(DRAFT_KEY)
  } catch {
    // Best-effort cleanup only.
  }
}
