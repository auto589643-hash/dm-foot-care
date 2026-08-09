/** Build the private Google Drive convention from an examination timestamp. */
export function buildOriginalDrivePath(username: string, examinationId: string, examinedAt: string | Date): string {
  const date = examinedAt instanceof Date ? examinedAt : new Date(examinedAt)
  if (Number.isNaN(date.getTime())) throw new Error('Invalid examination timestamp')
  const year = date.getUTCFullYear()
  const month = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(date)
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `DM Foot Care/รูปเท้า/${year}/${month}/${day}/${safeSegment(username)}_${safeSegment(examinationId)}`
}

/** Stable Drive filename used inside an examination folder. */
export function buildOriginalDriveFilename(position: 'left-dorsal' | 'left-sole' | 'right-dorsal' | 'right-sole', mimeType = 'image/jpeg'): string {
  const order: Record<typeof position, string> = {
    'left-dorsal': '01_left_dorsal',
    'left-sole': '02_left_sole',
    'right-dorsal': '03_right_dorsal',
    'right-sole': '04_right_sole',
  }
  const extension = mimeType.toLowerCase() === 'image/png' ? 'png' : mimeType.toLowerCase() === 'image/webp' ? 'webp' : mimeType.toLowerCase() === 'image/heic' ? 'heic' : 'jpg'
  return `${order[position]}.${extension}`
}

function safeSegment(value: string): string {
  const normalized = value.trim()
  if (!normalized || normalized.includes('/') || normalized.includes('\\')) throw new Error('Drive path segment is invalid')
  return normalized
}
