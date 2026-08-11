import { handleOptions, sendJson, setCors } from '../_lib/http.mjs'
import { hydrateExaminationHistory } from '../_lib/history.mjs'
import { requireSupabaseUser, supabaseRest } from '../_lib/supabase.mjs'

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  setCors(res)
  if (req.method !== 'GET') return sendJson(res, 405, { message: 'Method not allowed' })
  const startedAt = Date.now()
  try {
    const session = await requireSupabaseUser(req, res)
    if (!session) return
    const includeThumbnails = String(req.query?.includeThumbnails || '').toLowerCase() === 'true'
    const rows = await supabaseRest(`/rest/v1/examinations?select=id,examination_code,status,examined_at,created_at&user_id=eq.${encodeURIComponent(session.user.id)}&order=examined_at.desc.nullslast,created_at.desc`)
    const examinations = await hydrateExaminationHistory(rows, { includeThumbnails })
    res.setHeader('Cache-Control', 'private, no-store')
    res.setHeader('Server-Timing', `history;dur=${Date.now() - startedAt}`)
    return sendJson(res, 200, { examinations })
  } catch (error) {
    console.error('examination list failed', error)
    return sendJson(res, 500, { message: 'ไม่สามารถโหลดประวัติการตรวจได้' })
  }
}