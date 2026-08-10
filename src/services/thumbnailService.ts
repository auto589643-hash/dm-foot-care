import type { FootPosition } from '../types.ts'

export type ThumbnailMap = Partial<Record<FootPosition, string>>

export type AnalysisImageMap = Partial<Record<FootPosition, string>>

/**
 * Creates a lightweight preview without mutating the original capture.
 * Production can replace this browser adapter with the post-confirmation worker
 * that reads Drive originals and writes private Supabase Storage objects.
 */
export function createThumbnail(dataUrl: string, maxDimension = 320): Promise<string> {
  if (!dataUrl || dataUrl === 'demo' || typeof Image === 'undefined') return Promise.resolve(dataUrl)
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
      const context = canvas.getContext('2d')
      if (!context) {
        resolve(dataUrl)
        return
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/webp', 0.72))
    }
    image.onerror = () => resolve(dataUrl)
    image.src = dataUrl
  })
}

export async function createThumbnails(photos: Partial<Record<FootPosition, string>>): Promise<ThumbnailMap> {
  const entries = await Promise.all(Object.entries(photos).map(async ([position, dataUrl]) => [position, await createThumbnail(dataUrl ?? '')] as const))
  return Object.fromEntries(entries) as ThumbnailMap
}

/**
 * Creates Gemini-sized copies in the browser. The originals can upload to Drive
 * at the same time, so Gemini no longer has to wait for Drive and then download
 * the same four files again.
 */
export function createAnalysisImage(dataUrl: string, maxDimension = 1024): Promise<string> {
  if (!dataUrl || dataUrl === 'demo' || typeof Image === 'undefined') return Promise.resolve(dataUrl)
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
      const context = canvas.getContext('2d')
      if (!context) return reject(new Error('ไม่สามารถเตรียมภาพสำหรับ AI ได้'))
      context.drawImage(image, 0, 0, canvas.width, canvas.height)

      // Keep all four JSON-embedded images comfortably below Vercel's request
      // body ceiling. Most images fit on the first pass; detailed photos are
      // progressively compressed without changing the Drive original.
      const maxEncodedLength = 900_000
      let quality = 0.76
      let encoded = canvas.toDataURL('image/jpeg', quality)
      while (encoded.length > maxEncodedLength && quality > 0.48) {
        quality -= 0.07
        encoded = canvas.toDataURL('image/jpeg', quality)
      }
      resolve(encoded)
    }
    image.onerror = () => reject(new Error('ไม่สามารถอ่านภาพสำหรับ AI ได้'))
    image.src = dataUrl
  })
}

export async function createAnalysisImages(photos: Partial<Record<FootPosition, string>>): Promise<AnalysisImageMap> {
  const entries = await Promise.all(Object.entries(photos).map(async ([position, dataUrl]) => [position, await createAnalysisImage(dataUrl ?? '')] as const))
  return Object.fromEntries(entries) as AnalysisImageMap
}
