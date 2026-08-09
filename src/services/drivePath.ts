/** Build the private Google Drive convention from an examination timestamp. */
export function buildOriginalDrivePath(username: string, examinationId: string, examinedAt: string | Date): string {
  const date = examinedAt instanceof Date ? examinedAt : new Date(examinedAt)
  if (Number.isNaN(date.getTime())) throw new Error('Invalid examination timestamp')
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  void examinationId
  return `DMFC Program/${year}/${month}/${day}/${safeSegment(username)}`
}

/** Stable Drive filename used inside an examination folder. */
export function buildOriginalDriveFilename(position: 'left-dorsal' | 'left-sole' | 'right-dorsal' | 'right-sole', mimeType = 'image/jpeg'): string {
  const order: Record<typeof position, string> = {
    'left-dorsal': 'หลังเท้าซ้าย',
    'left-sole': 'ฝ่าเท้าซ้าย',
    'right-dorsal': 'หลังเท้าขวา',
    'right-sole': 'ฝ่าเท้าขวา',
  }
  const extension = mimeType.toLowerCase() === 'image/png' ? 'png' : mimeType.toLowerCase() === 'image/webp' ? 'webp' : mimeType.toLowerCase() === 'image/heic' ? 'heic' : 'jpg'
  return `${order[position]}.${extension}`
}

function safeSegment(value: string): string {
  const normalized = value.trim()
  if (!normalized || normalized.includes('/') || normalized.includes('\\')) throw new Error('Drive path segment is invalid')
  return normalized
}
