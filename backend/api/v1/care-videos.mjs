import { handleOptions, sendJson, setCors } from '../_lib/http.mjs'
import { createStorageSignedUrl, requireSupabaseUser, supabaseRest } from '../_lib/supabase.mjs'

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

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  setCors(res)
  if (req.method !== 'GET') return sendJson(res, 405, { message: 'Method not allowed' })
  const session = await requireSupabaseUser(req, res)
  if (!session) return
  try {
    const rows = await supabaseRest('/rest/v1/care_videos?select=id,title,summary,youtube_url,image_path,status,updated_at&status=eq.published&order=updated_at.desc')
    const videos = await Promise.all(rows.map(mapVideo))
    res.setHeader('Cache-Control', 'private, no-store')
    return sendJson(res, 200, { videos })
  } catch (error) {
    console.error('care videos read failed', error)
    return sendJson(res, 500, { message: 'ไม่สามารถโหลดวิดีโอแนะนำการดูแลเท้าได้' })
  }
}
