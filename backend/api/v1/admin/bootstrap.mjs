import { handleOptions, sendJson, setCors } from '../../_lib/http.mjs'
import { requireAdminUser, supabaseRest } from '../../_lib/supabase.mjs'
import { listUsers } from './users.mjs'
import { listDiseases } from './diseases.mjs'
import { listArticles } from './knowledge.mjs'

const dayMs = 86_400_000
function timestamp(row) { return row.examined_at || row.created_at || null }
function thaiDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' }).format(date)
}
function dateKey(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Bangkok' }).format(date)
}
function weekday(value) {
  const date = new Date(value)
  return new Intl.DateTimeFormat('th-TH', { weekday: 'short', timeZone: 'Asia/Bangkok' }).format(date).replace('.', '')
}

async function loadDashboard() {
  const [profiles, roles, examinations, findings] = await Promise.all([
    supabaseRest('/rest/v1/profiles?select=user_id,username,display_name,account_status'),
    supabaseRest('/rest/v1/user_roles?select=user_id,role'),
    supabaseRest('/rest/v1/examinations?select=id,user_id,status,examined_at,created_at&order=created_at.desc'),
    supabaseRest('/rest/v1/confirmed_findings?select=examination_id,disease_name_snapshot,severity_label_snapshot,confirmed_at'),
  ])
  const patientIds = new Set(roles.filter((item) => item.role === 'user' || item.role === 'patient').map((item) => item.user_id))
  const users = profiles.filter((profile) => patientIds.has(profile.user_id) && profile.account_status === 'active')
  const activeUserIds = new Set(users.map((user) => user.user_id))
  const userById = new Map(users.map((user) => [user.user_id, user]))
  const confirmed = examinations.filter((exam) => activeUserIds.has(exam.user_id) && exam.status === 'confirmed')
  const findingsByExam = new Map()
  for (const finding of findings) { const list = findingsByExam.get(finding.examination_id) || []; list.push(finding); findingsByExam.set(finding.examination_id, list) }
  const latestByUser = new Map()
  for (const exam of confirmed) if (!latestByUser.has(exam.user_id)) latestByUser.set(exam.user_id, exam)
  const today = new Date()
  const days = Array.from({ length: 7 }, (_, index) => { const date = new Date(today.getTime() - (6 - index) * dayMs); return { key: dateKey(date), label: weekday(date), count: 0 } })
  const dayByKey = new Map(days.map((day) => [day.key, day]))
  for (const exam of confirmed) { const slot = dayByKey.get(dateKey(timestamp(exam))); if (slot) slot.count += 1 }
  const followups = []
  for (const user of users) {
    const latest = latestByUser.get(user.user_id)
    const latestFindings = latest ? (findingsByExam.get(latest.id) || []) : []
    const severe = latestFindings.filter((finding) => finding.severity_label_snapshot === 'รุนแรง')
    const lastAt = latest ? timestamp(latest) : null
    const daysSince = lastAt ? Math.max(0, Math.floor((today.getTime() - new Date(lastAt).getTime()) / dayMs)) : null
    if (severe.length) followups.push({ userId: user.user_id, username: user.username, name: user.display_name || user.username, issue: `${[...new Set(severe.map((finding) => finding.disease_name_snapshot))].join(', ')} · รุนแรง`, time: thaiDate(lastAt), severe: true })
    else if (!latest || (daysSince != null && daysSince >= 7)) followups.push({ userId: user.user_id, username: user.username, name: user.display_name || user.username, issue: latest ? `ไม่ได้ตรวจ ${daysSince} วัน` : 'ยังไม่เคยตรวจ', time: thaiDate(lastAt), severe: false })
  }
  followups.sort((left, right) => Number(right.severe) - Number(left.severe) || left.username.localeCompare(right.username))
  const recentExaminations = confirmed.slice(0, 5).map((exam) => {
    const user = userById.get(exam.user_id); const examFindings = findingsByExam.get(exam.id) || []; const severe = examFindings.some((finding) => finding.severity_label_snapshot === 'รุนแรง')
    return { examinationId: exam.id, userId: exam.user_id, username: user?.username || '—', name: user?.display_name || user?.username || 'ไม่พบชื่อผู้ใช้', displayDate: thaiDate(timestamp(exam)), findings: [...new Set(examFindings.map((finding) => finding.disease_name_snapshot))], status: severe ? 'danger' : examFindings.length ? 'attention' : 'success' }
  })
  const usersWithHistory = new Set(confirmed.map((exam) => exam.user_id)).size
  const severeCount = followups.filter((item) => item.severe).length
  const completedLast7Days = days.reduce((sum, day) => sum + day.count, 0)
  const latestExam = confirmed[0]
  const latestUser = latestExam ? userById.get(latestExam.user_id) : null
  return { activeUsers: users.length, totalUsers: users.length, usersWithHistory, followupCount: followups.length, severeCount, completedLast7Days, averagePerDay: Number((completedLast7Days / 7).toFixed(1)), activityLast7Days: days, latestExam: latestExam ? { displayDate: thaiDate(timestamp(latestExam)), username: latestUser?.username || '—' } : null, followups: followups.slice(0, 8), recentExaminations }
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  setCors(res)
  if (req.method !== 'GET') return sendJson(res, 405, { message: 'Method not allowed' })
  try {
    const session = await requireAdminUser(req, res)
    if (!session) return
    const results = await Promise.allSettled([listUsers(), listDiseases(), listArticles(), loadDashboard()])
    if (results.every((result) => result.status === 'rejected')) throw results[0].reason
    const value = (index, fallback) => results[index].status === 'fulfilled' ? results[index].value : fallback
    const partial = results.some((result) => result.status === 'rejected')
    if (partial) console.warn('admin bootstrap partial failure', results.map((result) => result.status === 'rejected' ? String(result.reason?.message || result.reason) : 'ok'))
    res.setHeader('Cache-Control', 'private, no-store')
    return sendJson(res, 200, { users: value(0, []), diseases: value(1, []), articles: value(2, []), dashboard: value(3, null), partial })
  } catch (error) {
    console.error('admin bootstrap failed', error)
    return sendJson(res, 500, { message: 'ไม่สามารถโหลดข้อมูลผู้ดูแลระบบได้' })
  }
}
