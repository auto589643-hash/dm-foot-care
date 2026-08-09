import { handleOptions, readJsonBody, sendJson, setCors } from '../../_lib/http.mjs'
import { createFolder, findRootFolder } from '../../_lib/drive.mjs'
import { requireSupabaseUser, supabaseRest } from '../../_lib/supabase.mjs'

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  setCors(res)
  if (req.method !== 'POST') return sendJson(res, 405, { message: 'Method not allowed' })
  try {
    const session = await requireSupabaseUser(req, res)
    if (!session) return
    const body = await readJsonBody(req)
    const examinationId = String(body.examinationId || '')
    if (!examinationId) return sendJson(res, 400, { message: 'examinationId is required' })
    const exams = await supabaseRest(`/rest/v1/examinations?select=id,examination_code,examined_at&id=eq.${encodeURIComponent(examinationId)}&user_id=eq.${encodeURIComponent(session.user.id)}&limit=1`)
    const exam = exams?.[0]
    if (!exam) return sendJson(res, 404, { message: 'ไม่พบรายการตรวจของผู้ใช้' })
    const examinedAt = body.examinedAt || exam.examined_at || new Date().toISOString()
    const date = new Date(examinedAt)
    const pad = (value) => String(value).padStart(2, '0')
    const folderName = `DM Foot Care_${session.user.id}_${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}_${exam.examination_code}`
    const folder = await createFolder(folderName, await findRootFolder())
    return sendJson(res, 201, { folderId: folder.id })
  } catch (error) {
    console.error('Drive folder creation failed', error)
    return sendJson(res, 500, { message: 'ไม่สามารถสร้างโฟลเดอร์เก็บรูปได้' })
  }
}
