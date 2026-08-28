import crypto from 'node:crypto'
import { handleOptions, readJsonBody, sendJson, setCors } from '../../_lib/http.mjs'
import { createStorageSignedUrl, requireAdminUser, supabaseRest, supabaseStorage } from '../../_lib/supabase.mjs'

const statuses = new Set(['draft', 'published', 'archived'])
const maxImageBytes = 4_000_000

function badRequest(message) {
  const error = new Error(message)
  error.status = 400
  return error
}

function youtubeVideoId(value) {
  const raw = String(value || '').trim()
  let parsed
  try { parsed = new URL(raw) } catch { throw badRequest('URL YouTube ไม่ถูกต้อง') }
  if (parsed.protocol !== 'https:') throw badRequest('กรุณาใช้ลิงก์ YouTube แบบ https เท่านั้น')
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
  let videoId = ''
  if (host === 'youtu.be') videoId = parsed.pathname.split('/').filter(Boolean)[0] || ''
  else if (host === 'youtube.com' || host === 'm.youtube.com') {
    videoId = parsed.searchParams.get('v') || ''
    if (!videoId) {
      const segments = parsed.pathname.split('/').filter(Boolean)
      if (['embed', 'shorts', 'live'].includes(segments[0] || '')) videoId = segments[1] || ''
    }
  } else throw badRequest('กรุณาใช้ลิงก์จาก YouTube เท่านั้น')
  if (!/^[A-Za-z0-9_-]{6,32}$/.test(videoId)) throw badRequest('ไม่พบรหัสวิดีโอ YouTube ในลิงก์นี้')
  return videoId
}

function normalizeYoutubeUrl(value) {
  return `https://www.youtube.com/watch?v=${youtubeVideoId(value)}`
}

function decodeImage(value) {
  if (!value) return null
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(value))
  if (!match) return null
  const bytes = Buffer.from(match[2], 'base64')
  if (!bytes.length || bytes.length > maxImageBytes) throw badRequest('รูปปกวิดีโอมีขนาดใหญ่เกินไป')
  const extension = match[1] === 'image/png' ? 'png' : match[1] === 'image/webp' ? 'webp' : 'jpg'
  return { mimeType: match[1], bytes, extension }
}

async function resolveImagePath(videoId, value, existingPath = null) {
  if (!value) return existingPath
  const decoded = decodeImage(value)
  if (!decoded) return existingPath
  const path = `videos/${videoId}/${Date.now()}.${decoded.extension}`
  await supabaseStorage(`/object/dmfc-knowledge-media/${path.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'POST',
    headers: { 'content-type': decoded.mimeType, 'x-upsert': 'false', 'cache-control': '31536000' },
    body: decoded.bytes,
  })
  return path
}

async function mapVideo(video) {
  let image
  if (video.image_path) {
    try { image = await createStorageSignedUrl('dmfc-knowledge-media', video.image_path) } catch { image = undefined }
  }
  return {
    id: video.id,
    title: video.title,
    summary: video.summary || '',
    youtubeUrl: video.youtube_url,
    image,
    status: video.status,
  }
}

function normalizeInput(body) {
  const title = String(body.title || '').trim()
  const summary = String(body.summary || '').trim()
  const youtubeUrl = normalizeYoutubeUrl(body.youtubeUrl)
  const status = statuses.has(body.status) ? body.status : 'draft'
  if (!title) throw badRequest('กรุณาระบุชื่อวิดีโอ')
  if (title.length > 160) throw badRequest('ชื่อวิดีโอยาวเกินไป')
  return { title, summary, youtubeUrl, status, image: body.image ? String(body.image) : '' }
}

export async function listCareVideos() {
  const rows = await supabaseRest('/rest/v1/care_videos?select=id,title,summary,youtube_url,image_path,status,created_at,updated_at&order=updated_at.desc')
  return Promise.all(rows.map(mapVideo))
}

async function createVideo(body, actorId) {
  const input = normalizeInput(body)
  const id = crypto.randomUUID()
  const imagePath = await resolveImagePath(id, input.image)
  const rows = await supabaseRest('/rest/v1/care_videos', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ id, title: input.title, summary: input.summary, youtube_url: input.youtubeUrl, image_path: imagePath, status: input.status, created_by: actorId, updated_by: actorId }),
  })
  return mapVideo(rows[0])
}

async function updateVideo(videoId, body, actorId) {
  const existingRows = await supabaseRest(`/rest/v1/care_videos?select=id,image_path&id=eq.${encodeURIComponent(videoId)}&limit=1`)
  const existing = existingRows[0]
  if (!existing) {
    const error = new Error('ไม่พบวิดีโอ')
    error.status = 404
    throw error
  }
  const input = normalizeInput(body)
  const imagePath = await resolveImagePath(videoId, input.image, existing.image_path)
  const rows = await supabaseRest(`/rest/v1/care_videos?id=eq.${encodeURIComponent(videoId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ title: input.title, summary: input.summary, youtube_url: input.youtubeUrl, image_path: imagePath, status: input.status, updated_by: actorId, updated_at: new Date().toISOString() }),
  })
  return mapVideo(rows[0])
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  setCors(res)
  try {
    const session = await requireAdminUser(req, res)
    if (!session) return
    const videoId = String(req.query?.videoId || '').trim()
    if (req.method === 'GET' && !videoId) return sendJson(res, 200, { videos: await listCareVideos() })
    if (req.method === 'POST' && !videoId) return sendJson(res, 201, { video: await createVideo(await readJsonBody(req), session.user.id) })
    if (req.method === 'PATCH' && videoId) return sendJson(res, 200, { video: await updateVideo(videoId, await readJsonBody(req), session.user.id) })
    return sendJson(res, 405, { message: 'Method not allowed' })
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 500
    if (status >= 500) console.error('admin care videos request failed', error)
    return sendJson(res, status, { message: status >= 500 ? 'ไม่สามารถบันทึกวิดีโอแนะนำได้' : error.message })
  }
}
