import { handleOptions, readJsonBody, sendJson, setCors } from '../../_lib/http.mjs'
import { createFolder, findOrCreateFolder, findRootFolder } from '../../_lib/drive.mjs'
import { requireSupabaseUser, supabaseRest } from '../../_lib/supabase.mjs'

function bangkokDateParts(value) {
  const direct = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (direct) return { year: direct[1], month: direct[2], day: direct[3] }
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value || Date.now()))
  return Object.fromEntries(parts.filter((part) => ['year', 'month', 'day'].includes(part.type)).map((part) => [part.type, part.value]))
}

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
    const [exams, profiles] = await Promise.all([
      supabaseRest(`/rest/v1/examinations?select=id,examination_code,examined_at&id=eq.${encodeURIComponent(examinationId)}&user_id=eq.${encodeURIComponent(session.user.id)}&limit=1`),
      supabaseRest(`/rest/v1/profiles?select=username&user_id=eq.${encodeURIComponent(session.user.id)}&limit=1`),
    ])
    const exam = exams?.[0]
    if (!exam) return sendJson(res, 404, { message: 'ไม่พบรายการตรวจของผู้ใช้' })
    const examinedAt = body.examinedAt || exam.examined_at || new Date().toISOString()
    const { year, month, day } = bangkokDateParts(examinedAt)
    const username = String(profiles?.[0]?.username || session.user.id).replace(/[\\/:*?"<>|]/g, '_')

    // Supabase stores file IDs only. Original images are saved as:
    // DMFC Program/YYYY/MM/DD/<username>/<image name>.
    let rootId = await findRootFolder()
    if (!rootId) rootId = (await createFolder('DMFC Program')).id
    const yearFolder = await findOrCreateFolder(rootId, year)
    const monthFolder = await findOrCreateFolder(yearFolder.id, month)
    const dayFolder = await findOrCreateFolder(monthFolder.id, day)
    const userFolder = await findOrCreateFolder(dayFolder.id, username, {
      dmfcOwnerUserId: session.user.id,
      dmfcExaminationId: examinationId,
    })
    return sendJson(res, 201, { folderId: userFolder.id })
  } catch (error) {
    console.error('Drive folder creation failed', error)
    return sendJson(res, 500, { message: 'ไม่สามารถสร้างโฟลเดอร์เก็บรูปได้' })
  }
}