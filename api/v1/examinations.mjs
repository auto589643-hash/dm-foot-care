import { handleOptions, sendJson, setCors } from '../_lib/http.mjs'
import { requireSupabaseUser, supabaseRest } from '../_lib/supabase.mjs'

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  setCors(res)
  if (req.method !== 'GET') return sendJson(res, 405, { message: 'Method not allowed' })
  try {
    const session = await requireSupabaseUser(req, res)
    if (!session) return
    const rows = await supabaseRest(`/rest/v1/examinations?select=id,examination_code,status,examined_at,created_at&user_id=eq.${encodeURIComponent(session.user.id)}&order=created_at.desc`)
    return sendJson(res, 200, { examinations: rows.map((row) => ({ id: row.id, date: (row.examined_at || row.created_at || '').slice(0, 10), displayDate: (row.examined_at || row.created_at || '').slice(0, 10), time: '', status: row.status === 'confirmed' ? 'complete' : row.status === 'draft' ? 'draft' : 'processing', findings: [] })) })
  } catch (error) {
    console.error('examination list failed', error)
    return sendJson(res, 500, { message: 'ไม่สามารถโหลดประวัติการตรวจได้' })
  }
}
