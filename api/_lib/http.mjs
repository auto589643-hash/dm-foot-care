export function setCors(res) {
  const origin = process.env.FRONTEND_ORIGIN || process.env.VERCEL_URL
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin.startsWith('http') ? origin : `https://${origin}`)
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS')
}

export function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

export function handleOptions(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return true
  }
  return false
}

export async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  if (typeof req.body === 'string') return JSON.parse(req.body)
  let raw = ''
  for await (const chunk of req) raw += chunk
  return raw ? JSON.parse(raw) : {}
}

