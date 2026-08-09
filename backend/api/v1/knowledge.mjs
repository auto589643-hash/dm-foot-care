import { handleOptions, sendJson, setCors } from '../_lib/http.mjs'
import { requireSupabaseUser, supabaseRest } from '../_lib/supabase.mjs'

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  setCors(res)
  if (req.method !== 'GET') return sendJson(res, 405, { message: 'Method not allowed' })
  const session = await requireSupabaseUser(req, res)
  if (!session) return
  try {
    const [articles, diseases] = await Promise.all([
      supabaseRest('/rest/v1/knowledge_articles?select=id,disease_id,category,title,summary,body,status&status=eq.published&order=updated_at.desc'),
      supabaseRest('/rest/v1/diseases?select=id,code,name,category,description,detection_criteria,care_instruction,recommendation,reference_image_path,active,revision&active=eq.true&order=code'),
    ])
    return sendJson(res, 200, { articles: articles.map((article) => ({ id: article.id, title: article.title, diseaseId: article.disease_id || undefined, category: article.category, severity: 'ทุกระดับ', summary: article.summary, care: Array.isArray(article.body) ? article.body : [], readTime: 'อ่าน 3 นาที', tone: 'blue', status: article.status })), diseases: diseases.map((disease) => ({ id: disease.code, name: disease.name, category: disease.category, description: disease.description, criteria: JSON.stringify(disease.detection_criteria || {}), severityCriteria: '', severity: 'เล็กน้อย', care: disease.care_instruction, recommendation: disease.recommendation, active: disease.active, severityLevels: [] })) })
  } catch (error) {
    console.error('knowledge read failed', error)
    return sendJson(res, 500, { message: 'ไม่สามารถโหลดคลังความรู้ได้' })
  }
}
