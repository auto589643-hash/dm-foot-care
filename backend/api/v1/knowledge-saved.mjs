import { handleOptions, readJsonBody, sendJson, setCors } from '../_lib/http.mjs'
import { requireSupabaseUser, supabaseRest } from '../_lib/supabase.mjs'

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  setCors(res)
  try {
    const session = await requireSupabaseUser(req, res)
    if (!session) return

    if (req.method === 'GET') {
      const rows = await supabaseRest(`/rest/v1/saved_knowledge_articles?select=article_id,saved_at&user_id=eq.${encodeURIComponent(session.user.id)}&order=saved_at.desc`)
      return sendJson(res, 200, { articleIds: rows.map((row) => row.article_id) })
    }

    if (req.method === 'POST') {
      const body = await readJsonBody(req)
      const articleId = String(body.articleId || '').trim()
      const saved = body.saved === true
      if (!articleId) return sendJson(res, 400, { message: 'ไม่พบรหัสบทความ' })
      const articles = await supabaseRest(`/rest/v1/knowledge_articles?select=id,status&id=eq.${encodeURIComponent(articleId)}&limit=1`)
      if (!articles[0] || articles[0].status !== 'published') return sendJson(res, 404, { message: 'ไม่พบบทความที่เผยแพร่แล้ว' })

      if (saved) {
        await supabaseRest('/rest/v1/saved_knowledge_articles?on_conflict=user_id,article_id', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({ user_id: session.user.id, article_id: articleId, saved_at: new Date().toISOString() }),
        })
      } else {
        await supabaseRest(`/rest/v1/saved_knowledge_articles?user_id=eq.${encodeURIComponent(session.user.id)}&article_id=eq.${encodeURIComponent(articleId)}`, { method: 'DELETE' })
      }
      return sendJson(res, 200, { ok: true, saved })
    }

    return sendJson(res, 405, { message: 'Method not allowed' })
  } catch (error) {
    console.error('saved knowledge request failed', error)
    return sendJson(res, 500, { message: 'ไม่สามารถบันทึกบทความไว้อ่านภายหลังได้' })
  }
}
