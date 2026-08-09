import catchAllHandler from './[...route].mjs'

/**
 * Vercel's plain Vite deployment does not consistently expose a multi-segment
 * catch-all function directly. `vercel.json` rewrites every `/api/*` request
 * to this fixed function and passes the original path in `route`.
 */
export default async function handler(req, res) {
  const query = req.query || {}
  const routeValue = Array.isArray(query.route) ? query.route.join('/') : String(query.route || '')
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (key === 'route') continue
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined && item !== null) params.append(key, String(item))
    }
  }
  req.url = `/api/${routeValue}${params.toString() ? `?${params.toString()}` : ''}`
  return catchAllHandler(req, res)
}
