import { handleOptions, sendJson } from './_lib/http.mjs'

export default function handler(req, res) {
  if (handleOptions(req, res)) return
  if (req.method !== 'GET') return sendJson(res, 405, { message: 'Method not allowed' })
  sendJson(res, 200, {
    ok: true,
    service: 'dmfc-api',
    configured: {
      gemini: Boolean(process.env.GEMINI_API_KEY),
      supabase: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY),
      drive: Boolean(process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON),
    },
  })
}

