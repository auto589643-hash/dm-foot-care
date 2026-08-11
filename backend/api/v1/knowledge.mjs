import { handleOptions, sendJson, setCors } from '../_lib/http.mjs'
import { createStorageSignedUrl, requireSupabaseUser, supabaseRest } from '../_lib/supabase.mjs'

const validTones = new Set(['blue', 'teal', 'amber'])

function parseBody(value) {
  if (Array.isArray(value)) return { care: value.map(String), treatment: '', recommendation: '', tone: 'blue' }
  if (value && typeof value === 'object') return {
    care: Array.isArray(value.care) ? value.care.map(String) : [],
    treatment: String(value.treatment || ''),
    recommendation: String(value.recommendation || ''),
    tone: validTones.has(value.tone) ? value.tone : 'blue',
  }
  return { care: [], treatment: '', recommendation: '', tone: 'blue' }
}

function readTimeFor(article) {
  const body = parseBody(article.body)
  const text = [article.title, article.summary, ...body.care, body.treatment, body.recommendation].join(' ').trim()
  return `อ่าน ${Math.max(1, Math.ceil(text.length / 450))} นาที`
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  setCors(res)
  if (req.method !== 'GET') return sendJson(res, 405, { message: 'Method not allowed' })
  const session = await requireSupabaseUser(req, res)
  if (!session) return
  try {
    const [articles, diseases, levels] = await Promise.all([
      supabaseRest('/rest/v1/knowledge_articles?select=id,disease_id,category,severity_id,title,summary,body,image_path,status&status=eq.published&order=updated_at.desc'),
      supabaseRest('/rest/v1/diseases?select=id,code,name,category,description,detection_criteria,care_instruction,recommendation,reference_image_path,active,revision&active=eq.true&order=code'),
      supabaseRest('/rest/v1/disease_severity_levels?select=disease_id,label,rank,criteria&order=rank'),
    ])
    const diseaseById = new Map(diseases.map((disease) => [disease.id, disease]))
    const levelsByDisease = new Map()
    const levelById = new Map()
    for (const level of levels) {
      levelById.set(level.id, level)
      const list = levelsByDisease.get(level.disease_id) || []
      list.push(level)
      levelsByDisease.set(level.disease_id, list)
    }

    const mappedArticles = await Promise.all(articles.map(async (article) => {
      const content = parseBody(article.body)
      const disease = article.disease_id ? diseaseById.get(article.disease_id) : null
      const level = article.severity_id ? levelById.get(article.severity_id) : null
      let image
      if (article.image_path) {
        try { image = await createStorageSignedUrl('dmfc-knowledge-media', article.image_path) } catch { image = undefined }
      }
      const severity = level?.label || 'ทุกระดับ'
      return {
        id: article.id,
        title: article.title,
        diseaseId: disease?.code || undefined,
        category: article.category,
        severity,
        summary: article.summary,
        care: content.care,
        treatment: content.treatment || undefined,
        recommendation: content.recommendation || undefined,
        image,
        readTime: readTimeFor(article),
        tone: validTones.has(content.tone) ? content.tone : severity === 'รุนแรง' ? 'amber' : severity === 'ปานกลาง' ? 'teal' : 'blue',
        status: article.status,
      }
    }))

    const mappedDiseases = await Promise.all(diseases.map(async (disease) => {
      let referenceImage
      if (disease.reference_image_path) {
        try { referenceImage = await createStorageSignedUrl('dmfc-disease-reference', disease.reference_image_path) } catch { referenceImage = undefined }
      }
      return {
        id: disease.code,
        name: disease.name,
        category: disease.category,
        description: disease.description,
        criteria: Array.isArray(disease.detection_criteria?.signals) ? disease.detection_criteria.signals.join(', ') : disease.detection_criteria?.description || '',
        severityCriteria: '',
        severity: 'เล็กน้อย',
        care: disease.care_instruction,
        recommendation: disease.recommendation,
        referenceImage,
        active: disease.active,
        severityLevels: (levelsByDisease.get(disease.id) || []).map((level) => ({ label: level.label, rank: level.rank, criteria: level.criteria?.description || (Array.isArray(level.criteria?.signals) ? level.criteria.signals.join(', ') : '') })),
      }
    }))

    return sendJson(res, 200, { articles: mappedArticles, diseases: mappedDiseases })
  } catch (error) {
    console.error('knowledge read failed', error)
    return sendJson(res, 500, { message: 'ไม่สามารถโหลดคลังความรู้ได้' })
  }
}
