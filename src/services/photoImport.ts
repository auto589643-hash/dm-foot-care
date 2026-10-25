/**
 * Normalize photos picked from iOS/Android into a format accepted by the
 * existing DMFC photoBlobs/analysis workflow (JPEG, PNG, WebP).
 * Native decoders may support HEIC/HEIF; when they do not, fail visibly
 * instead of accepting a file that later breaks examination processing.
 */
export const PHOTO_MAX_UPLOAD_BYTES = 20 * 1024 * 1024
const MAX_IMAGE_EDGE = 2048
const ALLOWED_EXTENSION = /\.(jpe?g|png|webp|heic|heif)$/i

export function validateSelectedPhoto(file: Pick<File, 'name' | 'type' | 'size'>): string | null {
  if (!file.size) return 'ไฟล์รูปภาพไม่มีข้อมูล กรุณาเลือกไฟล์ใหม่'
  if (file.size > PHOTO_MAX_UPLOAD_BYTES) return 'ภาพใหญ่เกิน 20 MB กรุณาเลือกรูปที่เล็กลง'
  if (!(file.type.startsWith('image/') || ALLOWED_EXTENSION.test(file.name))) return 'กรุณาเลือกไฟล์รูปภาพเท่านั้น'
  return null
}

export async function normalizeSelectedPhoto(file: File): Promise<string> {
  const invalid = validateSelectedPhoto(file)
  if (invalid) throw new Error(invalid)
  const objectUrl = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.decoding = 'async'
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('เปิดรูปนี้ไม่ได้ กรุณาลองใช้รูป JPEG หรือ PNG จากเครื่อง'))
      image.src = objectUrl
    })
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('รูปภาพไม่มีขนาดที่อ่านได้ กรุณาเลือกใหม่')
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('อุปกรณ์ไม่สามารถแปลงรูปภาพได้ กรุณาลองใหม่')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
    if (!dataUrl.startsWith('data:image/jpeg;base64,') || dataUrl.length < 100) {
      throw new Error('แปลงรูปภาพไม่สำเร็จ กรุณาเลือก JPEG หรือ PNG')
    }
    return dataUrl
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
