import { handleOptions, sendJson, setCors } from '../../../_lib/http.mjs'
import { getOwnedExamination, queryParam } from '../../../_lib/examinations.mjs'
import { requireSupabaseUser, supabaseRest } from '../../../_lib/supabase.mjs'

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  setCors(res)
  const session = await requireSupabaseUser(req, res)
  if (!session) return
  const examinationId = queryParam(req, 'id')
  try {
    const exam = await getOwnedExamination(session.user.id, examinationId)
    if (!exam) return sendJson(res, 404, { message: 'ไม่พบรายการตรวจ' })
    if (req.method !== 'GET') return sendJson(res, 405, { message: 'Method not allowed' })
    const rows = await supabaseRest(`/rest/v1/examination_images?select=position,drive_folder_id,drive_file_id,original_metadata&examination_id=eq.${encodeURIComponent(examinationId)}&order=position`)
    return sendJson(res, 200, { driveFolderId: rows[0]?.drive_folder_id || null, driveFileIds: Object.fromEntries(rows.map((row) => [row.position.replace('_', '-'), row.drive_file_id])) })
  } catch (error) {
    console.error('image references read failed', error)
    return sendJson(res, 500, { message: 'ไม่สามารถโหลดรายการรูปได้' })
  }
}
