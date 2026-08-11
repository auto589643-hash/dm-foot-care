import crypto from 'node:crypto'
import { handleOptions, readJsonBody, sendJson, setCors } from '../../_lib/http.mjs'
import { createStorageSignedUrl, requireAdminUser, supabaseRest, supabaseStorage } from '../../_lib/supabase.mjs'

const statuses = new Set(['draft', 'published', 'archived'])
const tones = new Set(['blue', 'teal', 'amber'])
const severities = new Set(['เล็กน้อย', 'ปานกลาง', 'รุนแรง'])
const maxImageBytes = 4_000_000

function badRequest(message) {
  const error = new Error(message)
  error.status = 400
  return error
}

function parseBody(value) {
  if (Array.isArray(value)) return { care: value.map(String), treatment: '', recommendation: '', tone: 'blue' }
  if (value && typeof value === 'object') return {
    care: Array.isArray(value.care) ? value.care.map(String) : [],
    treatment: String(value.treatment || ''),
    recommendation: String(value.recommendation || ''),
    tone: tones.has(value.tone) ? value.tone : 'blue',
  }
  return { care: [], treatment: '', recommendation: '', tone: 'blue' }
}

function readTimeFor(article) {
  const body = parseBody(article.body)
  const text = [article.title, article.summary, ...body.care, body.treatment, body.recommendation].join(' ').trim()
  const estimatedMinutes = Math.max(1, Math.ceil(text.length / 450))
  return `อ่าน ${estimatedMinutes} นาที`
}

function decodeImage(value) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(value || ''))
  if (!match) return null
  const bytes = Buffer.from(match[2], 'base64')
  if (!bytes.length || bytes.length > maxImageBytes) throw badRequest('รูปประกอบมีขนาดใหญ่เกินไป')
  const extension = match[1] === 'image/png' ? 'png' : match[1] === 'image/webp' ? 'webp' : 'jpg'
  return { mimeType: match[1], bytes, extension }
}

async function resolveImagePath(articleId, value, existingPath = null) {
  if (!value) return null
  const decoded = decodeImage(value)
  if (!decoded) return existingPath
  const path = `${articleId}/${Date.now()}.${decoded.extension}`
  await supabaseStorage(`/object/dmfc-knowledge-media/${path.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'POST',
    headers: { 'content-type': decoded.mimeType, 'x-upsert': 'false', 'cache-control': '31536000' },
    body: decoded.bytes,
  })
  return path
}

async function loadLookups() {
  const [diseases, levels] = await Promise.all([
    supabaseRest('/rest/v1/diseases?select=id,code,name'),
    supabaseRest('/rest/v1/disease_severity_levels?select=id,disease_id,label'),
  ])
  return {
    diseaseById: new Map(diseases.map((row) => [row.id, row])),
    diseaseByCode: new Map(diseases.map((row) => [row.code, row])),
    levelById: new Map(levels.map((row) => [row.id, row])),
    levels,
  }
}

async function mapArticle(article, lookups) {
  const body = parseBody(article.body)
  const disease = article.disease_id ? lookups.diseaseById.get(article.disease_id) : null
  const level = article.severity_id ? lookups.levelById.get(article.severity_id) : null
  let image
  if (article.image_path) {
    try { image = await createStorageSignedUrl('dmfc-knowledge-media', article.image_path) } catch { image = undefined }
  }
  const severity = level?.label && severities.has(level.label) ? level.label : 'ทุกระดับ'
  const tone = body.tone && tones.has(body.tone) ? body.tone : severity === 'รุนแรง' ? 'amber' : severity === 'ปานกลาง' ? 'teal' : 'blue'
  return {
    id: article.id,
    title: article.title,
    diseaseId: disease?.code || undefined,
    category: article.category,
    severity,
    summary: article.summary || '',
    care: body.care,
    treatment: body.treatment || undefined,
    recommendation: body.recommendation || undefined,
    image,
    readTime: readTimeFor(article),
    tone,
    status: article.status,
  }
}

async function normalizeInput(body, lookups) {
  const title = String(body.title || '').trim()
  const category = String(body.category || '').trim()
  const summary = String(body.summary || '').trim()
  const care = Array.isArray(body.care) ? body.care.map((item) => String(item).trim()).filter(Boolean) : []
  const status = statuses.has(body.status) ? body.status : 'draft'
  const diseaseCode = String(body.diseaseId || '').trim()
  const severity = String(body.severity || 'ทุกระดับ')
  if (!title) throw badRequest('กรุณาระบุชื่อบทความ')
  if (!category) throw badRequest('กรุณาระบุหมวดหมู่')
  if (!summary) throw badRequest('กรุณาระบุสรุปบทความ')
  if (!care.length) throw badRequest('กรุณาระบุขั้นตอนการดูแลอย่างน้อย 1 ขั้นตอน')
  if (severity !== 'ทุกระดับ' && !severities.has(severity)) throw badRequest('ระดับความรุนแรงไม่ถูกต้อง')
  const disease = diseaseCode ? lookups.diseaseByCode.get(diseaseCode) : null
  if (diseaseCode && !disease) throw badRequest('ไม่พบรายการภาวะที่เลือก')
  let severityId = null
  if (disease && severity !== 'ทุกระดับ') {
    const level = lookups.levels.find((item) => item.disease_id === disease.id && item.label === severity)
    if (!level) throw badRequest('ไม่พบระดับความรุนแรงที่เลือกสำหรับภาวะนี้')
    severityId = level.id
  }
  return {
    title, category, summary, status,
    diseaseId: disease?.id || null,
    severityId,
    content: {
      care,
      treatment: String(body.treatment || '').trim(),
      recommendation: String(body.recommendation || '').trim(),
      tone: severity === 'รุนแรง' ? 'amber' : severity === 'ปานกลาง' ? 'teal' : 'blue',
    },
    image: body.image ? String(body.image) : '',
  }
}

export async function listArticles() {
  const [rows, lookups] = await Promise.all([
    supabaseRest('/rest/v1/knowledge_articles?select=id,disease_id,category,severity_id,title,summary,body,image_path,status,created_at,updated_at&order=updated_at.desc'),
    loadLookups(),
  ])
  return Promise.all(rows.map((row) => mapArticle(row, lookups)))
}

async function createArticle(body, actorId) {
  const lookups = await loadLookups()
  const input = await normalizeInput(body, lookups)
  const id = crypto.randomUUID()
  const imagePath = await resolveImagePath(id, input.image)
  const rows = await supabaseRest('/rest/v1/knowledge_articles', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ id, disease_id: input.diseaseId, category: input.category, severity_id: input.severityId, title: input.title, summary: input.summary, body: input.content, image_path: imagePath, status: input.status, created_by: actorId, updated_by: actorId }),
  })
  return mapArticle(rows[0], lookups)
}

async function updateArticle(articleId, body, actorId) {
  const existingRows = await supabaseRest(`/rest/v1/knowledge_articles?select=id,disease_id,category,severity_id,title,summary,body,image_path,status&id=eq.${encodeURIComponent(articleId)}&limit=1`)
  const existing = existingRows[0]
  if (!existing) {
    const error = new Error('ไม่พบบทความ')
    error.status = 404
    throw error
  }
  const lookups = await loadLookups()
  const input = await normalizeInput(body, lookups)
  const imagePath = await resolveImagePath(articleId, input.image, existing.image_path)
  const rows = await supabaseRest(`/rest/v1/knowledge_articles?id=eq.${encodeURIComponent(articleId)}`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ disease_id: input.diseaseId, category: input.category, severity_id: input.severityId, title: input.title, summary: input.summary, body: input.content, image_path: imagePath, status: input.status, updated_by: actorId, updated_at: new Date().toISOString() }),
  })
  return mapArticle(rows[0], lookups)
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  setCors(res)
  try {
    const session = await requireAdminUser(req, res)
    if (!session) return
    const articleId = String(req.query?.articleId || '').trim()
    if (req.method === 'GET' && !articleId) return sendJson(res, 200, { articles: await listArticles() })
    if (req.method === 'POST' && !articleId) return sendJson(res, 201, { article: await createArticle(await readJsonBody(req), session.user.id) })
    if (req.method === 'PATCH' && articleId) return sendJson(res, 200, { article: await updateArticle(articleId, await readJsonBody(req), session.user.id) })
    return sendJson(res, 405, { message: 'Method not allowed' })
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 500
    if (status >= 500) console.error('admin knowledge request failed', error)
    return sendJson(res, status, { message: status >= 500 ? 'ไม่สามารถบันทึกคลังความรู้ได้' : error.message })
  }
}
