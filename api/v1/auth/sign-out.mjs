import { handleOptions, sendJson, setCors } from '../../_lib/http.mjs'

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  setCors(res)
  if (req.method !== 'POST') return sendJson(res, 405, { message: 'Method not allowed' })
  return sendJson(res, 200, { ok: true })
}
