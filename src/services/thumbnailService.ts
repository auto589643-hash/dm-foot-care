import type { FootPosition } from '../types.ts'

export type ThumbnailMap = Partial<Record<FootPosition, string>>

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
