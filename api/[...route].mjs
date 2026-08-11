import health from '../backend/api/health.mjs'
import analysis from '../backend/api/v1/analysis.mjs'
import auditEvents from '../backend/api/v1/audit-events.mjs'
import examinations from '../backend/api/v1/examinations.mjs'
import knowledge from '../backend/api/v1/knowledge.mjs'
import savedKnowledge from '../backend/api/v1/knowledge-saved.mjs'
import originalImages from '../backend/api/v1/original-images.mjs'
import authSession from '../backend/api/v1/auth/session.mjs'
import authSignOut from '../backend/api/v1/auth/sign-out.mjs'
import authSignIn from '../backend/api/v1/auth/username/sign-in.mjs'
import authRegister from '../backend/api/v1/auth/register.mjs'
import drafts from '../backend/api/v1/examinations/drafts.mjs'
import analysisRuns from '../backend/api/v1/examinations/[id]/analysis-runs.mjs'
import confirmedFindings from '../backend/api/v1/examinations/[id]/confirmed-findings.mjs'
import examinationImages from '../backend/api/v1/examinations/[id]/images.mjs'
import examinationImagePosition from '../backend/api/v1/examinations/[id]/images/[position].mjs'
import examinationStatus from '../backend/api/v1/examinations/[id]/status.mjs'
import thumbnailReferences from '../backend/api/v1/examinations/[id]/thumbnail-references.mjs'
import thumbnails from '../backend/api/v1/examinations/[id]/thumbnails.mjs'
import imageFolders from '../backend/api/v1/original-images/folders.mjs'
import adminUsers from '../backend/api/v1/admin/users.mjs'
import adminDiseases from '../backend/api/v1/admin/diseases.mjs'
import adminKnowledge from '../backend/api/v1/admin/knowledge.mjs'
import adminDashboard from '../backend/api/v1/admin/dashboard.mjs'
import adminUserExaminations from '../backend/api/v1/admin/user-examinations.mjs'
import adminExaminationImage from '../backend/api/v1/admin/examination-image.mjs'
import adminUser from '../backend/api/v1/admin/user.mjs'
import { sendJson } from '../backend/api/_lib/http.mjs'

function pathAndQuery(req) {
  const url = new URL(req.url || '/', `https://${req.headers.host || 'localhost'}`)
  const path = url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '')
  const query = Object.fromEntries(url.searchParams.entries())
  req.query = { ...(req.query || {}), ...query }
  return path
}

function withParams(req, params) {
  req.query = { ...(req.query || {}), ...params }
}

export default async function handler(req, res) {
  const path = pathAndQuery(req)
  if (path === 'health') return health(req, res)
  if (path === 'v1/auth/username/sign-in') return authSignIn(req, res)
  if (path === 'v1/auth/register') return authRegister(req, res)
  if (path === 'v1/auth/session') return authSession(req, res)
  if (path === 'v1/auth/sign-out') return authSignOut(req, res)
  if (path === 'v1/analysis') return analysis(req, res)
  if (path === 'v1/audit-events') return auditEvents(req, res)
  if (path === 'v1/examinations') return examinations(req, res)
  if (path === 'v1/examinations/drafts') return drafts(req, res)
  if (path === 'v1/knowledge') return knowledge(req, res)
  if (path === 'v1/knowledge/saved') return savedKnowledge(req, res)
  if (path === 'v1/original-images') return originalImages(req, res)
  if (path === 'v1/original-images/folders') return imageFolders(req, res)
  if (path === 'v1/admin/users') return adminUsers(req, res)
  if (path === 'v1/admin/diseases') return adminDiseases(req, res)
  if (path === 'v1/admin/knowledge') return adminKnowledge(req, res)
  if (path === 'v1/admin/dashboard') return adminDashboard(req, res)

  let match = path.match(/^v1\/admin\/diseases\/([^/]+)(?:\/(status))?$/)
  if (match) {
    withParams(req, { diseaseId: decodeURIComponent(match[1]), action: match[2] || '' })
    return adminDiseases(req, res)
  }
  match = path.match(/^v1\/admin\/knowledge\/([^/]+)$/)
  if (match) {
    withParams(req, { articleId: decodeURIComponent(match[1]) })
    return adminKnowledge(req, res)
  }
  match = path.match(/^v1\/examinations\/([^/]+)\/images\/([^/]+)$/)
  if (match) {
    withParams(req, { id: decodeURIComponent(match[1]), position: decodeURIComponent(match[2]) })
    return examinationImagePosition(req, res)
  }
  match = path.match(/^v1\/admin\/users\/([^/]+)\/examinations$/)
  if (match) {
    withParams(req, { userId: decodeURIComponent(match[1]) })
    return adminUserExaminations(req, res)
  }
  match = path.match(/^v1\/admin\/examinations\/([^/]+)\/images\/([^/]+)$/)
  if (match) {
    withParams(req, { examinationId: decodeURIComponent(match[1]), position: decodeURIComponent(match[2]) })
    return adminExaminationImage(req, res)
  }
  match = path.match(/^v1\/admin\/users\/([^/]+)(?:\/(status))?$/)
  if (match) {
    withParams(req, { userId: decodeURIComponent(match[1]), action: match[2] || '' })
    return adminUser(req, res)
  }
  match = path.match(/^v1\/examinations\/([^/]+)\/(analysis-runs|confirmed-findings|status|thumbnail-references|thumbnails)$/)
  if (match) {
    withParams(req, { id: decodeURIComponent(match[1]) })
    const handlers = { 'analysis-runs': analysisRuns, 'confirmed-findings': confirmedFindings, status: examinationStatus, 'thumbnail-references': thumbnailReferences, thumbnails }
    return handlers[match[2]](req, res)
  }
  match = path.match(/^v1\/examinations\/([^/]+)\/images$/)
  if (match) {
    withParams(req, { id: decodeURIComponent(match[1]) })
    return examinationImages(req, res)
  }
  return sendJson(res, 404, { message: 'API route not found' })
}
