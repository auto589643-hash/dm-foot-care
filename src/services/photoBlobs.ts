import type { FootPosition } from '../types.ts'

/** Convert captured browser data URLs into Blob objects for the real upload and analysis pipeline. */
export async function photosToBlobs(photos: Record<FootPosition, string>): Promise<Record<FootPosition, Blob>> {
  const entries = await Promise.all(Object.entries(photos).map(async ([position, dataUrl]) => {
    if (!/^data:image\/(?:jpeg|png|webp);base64,/i.test(dataUrl)) {
      throw new Error(`รูป ${position} มีรูปแบบไม่ถูกต้อง`)
    }
    const response = await fetch(dataUrl)
    if (!response.ok) throw new Error(`ไม่สามารถเตรียมรูป ${position} ได้`)
    const blob = await response.blob()
    if (!blob.size) throw new Error(`รูป ${position} ไม่มีข้อมูล`)
    return [position, blob] as const
  }))
  return Object.fromEntries(entries) as Record<FootPosition, Blob>
}
