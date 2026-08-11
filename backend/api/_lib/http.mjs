export function setCors(res) {
  const origin = process.env.FRONTEND_ORIGIN || process.env.VERCEL_URL
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin.startsWith('http') ? origin : `https://${origin}`)
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, x-dmfc-drive-folder, x-dmfc-image-position, x-dmfc-drive-filename, x-dmfc-examination-id')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
}

export function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

export function readCookie(req, name) {
  const cookieHeader = String(req.headers.cookie || '')
  for (const item of cookieHeader.split(';')) {
    const separator = item.indexOf('=')
    if (separator < 0) continue
    if (item.slice(0, separator).trim() === name) return decodeURIComponent(item.slice(separator + 1).trim())
  }
  return ''
}

export function setCookie(res, name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${options.path || '/'}`, `SameSite=${options.sameSite || 'Lax'}`]
  if (options.httpOnly !== false) parts.push('HttpOnly')
  if (options.secure !== false) parts.push('Secure')
  if (Number.isFinite(options.maxAge)) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`)
  res.setHeader('Set-Cookie', parts.join('; '))
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

export async function readBinaryBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body
  if (req.body instanceof Uint8Array) return Buffer.from(req.body)
  const chunks = []
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks)
}