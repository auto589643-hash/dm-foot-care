import { handleOptions, readJsonBody, sendJson, setCors } from '../../../../_lib/http.mjs'
import { getOwnedExamination, queryParam } from '../../../../_lib/examinations.mjs'
import { requireSupabaseUser, supabaseRest } from '../../../../_lib/supabase.mjs'

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  setCors(res)
  if (req.method !== 'POST') return sendJson(res, 405, { message: 'Method not allowed' })
  const session = await requireSupabaseUser(req, res)
  if (!session) return
  try {
    const examinationId = queryParam(req, 'id')
    const position = String(queryParam(req, 'position') || '').replace('-', '_')
    const body = await readJsonBody(req)
    const exam = await getOwnedExamination(session.user.id, examinationId)
    if (!exam) return sendJson(res, 404, { message: 'ไม่พบรายการตรวจ' })
    if (!['left_dorsal', 'left_sole', 'right_dorsal', 'right_sole'].includes(position)) return sendJson(res, 400, { message: 'ตำแหน่งรูปไม่ถูกต้อง' })
    await supabaseRest('/rest/v1/examination_images?on_conflict=examination_id,position', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ examination_id: examinationId, idempotency_key: String(body.idempotencyKey || `${examinationId}:${position}`), position, drive_folder_id: String(body.driveFolderId || ''), drive_file_id: String(body.driveFileId || ''), original_metadata: body.metadata || {} }) })
    return sendJson(res, 204, null)
  } catch (error) {
    console.error('image reference save failed', error)
    return sendJson(res, 500, { message: 'ไม่สามารถบันทึกข้อมูลรูปได้' })
  }
}
