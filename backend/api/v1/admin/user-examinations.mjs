import { handleOptions, sendJson, setCors } from '../../_lib/http.mjs'
import { hydrateExaminationHistory } from '../../_lib/history.mjs'
import { requireAdminUser, supabaseRest } from '../../_lib/supabase.mjs'

function queryParam(req, name) {
  const value = req.query?.[name]
  return Array.isArray(value) ? value[0] : value
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  setCors(res)
  if (req.method !== 'GET') return sendJson(res, 405, { message: 'Method not allowed' })
  try {
    const session = await requireAdminUser(req, res)
    if (!session) return
    const userId = String(queryParam(req, 'userId') || '')
    if (!isUuid(userId)) return sendJson(res, 400, { message: 'รหัสผู้ใช้งานไม่ถูกต้อง' })

    const examinations = await supabaseRest(`/rest/v1/examinations?select=id,examination_code,status,examined_at,created_at&user_id=eq.${encodeURIComponent(userId)}&order=examined_at.desc.nullslast,created_at.desc`)
    if (!examinations.length) return sendJson(res, 200, { examinations: [] })
    return sendJson(res, 200, { examinations: await hydrateExaminationHistory(examinations, { includeThumbnails: false }) })
  } catch (error) {
    console.error('admin user examinations read failed', error)
    return sendJson(res, 500, { message: 'ไม่สามารถโหลดประวัติการตรวจได้' })
  }
}
