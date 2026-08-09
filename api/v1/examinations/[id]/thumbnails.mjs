import { handleOptions, sendJson, setCors } from '../../../_lib/http.mjs'
import { getOwnedExamination, queryParam } from '../../../_lib/examinations.mjs'
import { requireSupabaseUser } from '../../../_lib/supabase.mjs'

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  setCors(res)
  if (req.method !== 'POST') return sendJson(res, 405, { message: 'Method not allowed' })
  const session = await requireSupabaseUser(req, res)
  if (!session) return
  try {
    const examinationId = queryParam(req, 'id')
    if (!await getOwnedExamination(session.user.id, examinationId)) return sendJson(res, 404, { message: 'ไม่พบรายการตรวจ' })
    // Thumbnail worker is intentionally a separate job boundary. The API keeps
    // the contract stable and returns an empty private-reference map until the
    // worker is enabled; original images never leave Drive.
    return sendJson(res, 200, { thumbnails: {} })
  } catch (error) {
    console.error('thumbnail request failed', error)
    return sendJson(res, 500, { message: 'ไม่สามารถเตรียมรูปย่อได้' })
  }
}
