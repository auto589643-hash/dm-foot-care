import { handleOptions, sendJson, setCors } from '../../_lib/http.mjs'
import { requireAdminUser, supabaseRest } from '../../_lib/supabase.mjs'

function ageFromDate(value) {
  const birth = new Date(`${value}T00:00:00Z`)
  const today = new Date()
  let age = today.getUTCFullYear() - birth.getUTCFullYear()
  if (today.getUTCMonth() < birth.getUTCMonth() || (today.getUTCMonth() === birth.getUTCMonth() && today.getUTCDate() < birth.getUTCDate())) age -= 1
  return Math.max(0, age)
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  setCors(res)
  if (req.method !== 'GET') return sendJson(res, 405, { message: 'Method not allowed' })
  try {
    const session = await requireAdminUser(req, res)
    if (!session) return
    const [profiles, examinations] = await Promise.all([
      supabaseRest('/rest/v1/profiles?select=user_id,username,date_of_birth,occupation,account_status,pin_hash&order=username'),
      supabaseRest('/rest/v1/examinations?select=user_id,examined_at,created_at&order=created_at.desc'),
    ])
    const latestByUser = new Map()
    for (const row of examinations) if (!latestByUser.has(row.user_id)) latestByUser.set(row.user_id, row.examined_at || row.created_at)
    return sendJson(res, 200, {
      users: profiles.map((profile) => ({
        id: profile.user_id,
        username: profile.username,
        name: profile.username,
        dateOfBirth: profile.date_of_birth,
        age: ageFromDate(profile.date_of_birth),
        occupation: profile.occupation || '',
        pinConfigured: Boolean(profile.pin_hash),
        status: profile.account_status,
        lastExam: latestByUser.has(profile.user_id) ? String(latestByUser.get(profile.user_id)).slice(0, 10) : 'ยังไม่มีประวัติ',
      })),
    })
  } catch (error) {
    console.error('admin users read failed', error)
    return sendJson(res, 500, { message: 'ไม่สามารถโหลดผู้ใช้งานได้' })
  }
}
