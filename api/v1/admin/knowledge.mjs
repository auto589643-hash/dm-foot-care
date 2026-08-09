import { handleOptions, sendJson, setCors } from '../../_lib/http.mjs'
import { requireAdminUser, supabaseRest } from '../../_lib/supabase.mjs'

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  setCors(res)
  if (req.method !== 'GET') return sendJson(res, 405, { message: 'Method not allowed' })
  try {
    const session = await requireAdminUser(req, res)
    if (!session) return
    const rows = await supabaseRest('/rest/v1/knowledge_articles?select=id,disease_id,category,title,summary,body,status,updated_at&order=updated_at.desc')
    return sendJson(res, 200, {
      articles: rows.map((article) => ({
        id: article.id,
        title: article.title,
        diseaseId: article.disease_id || undefined,
        category: article.category,
        severity: 'ทุกระดับ',
        summary: article.summary,
        care: Array.isArray(article.body) ? article.body : [],
        readTime: 'อ่าน 3 นาที',
        tone: 'blue',
        status: article.status,
      })),
    })
  } catch (error) {
    console.error('admin knowledge read failed', error)
    return sendJson(res, 500, { message: 'ไม่สามารถโหลดคลังความรู้ได้' })
  }
}
