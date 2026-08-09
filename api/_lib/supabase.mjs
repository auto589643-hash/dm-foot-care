import { sendJson } from './http.mjs'

function config() {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '')
  const serviceKey = process.env.SUPABASE_SECRET_KEY || ''
  const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || ''
  if (!url || !serviceKey || !publishableKey) throw new Error('Supabase server variables are not configured')
  return { url, serviceKey, publishableKey }
}

export async function requireSupabaseUser(req, res) {
  const authorization = req.headers.authorization || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length).trim() : ''
  if (!token) {
    sendJson(res, 401, { message: 'Authorization bearer token is required' })
    return null
  }
  const { url, publishableKey } = config()
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: publishableKey, authorization: `Bearer ${token}` },
  })
  if (!response.ok) {
    sendJson(res, 401, { message: 'Invalid or expired session' })
    return null
  }
  return { token, user: await response.json() }
}

export async function loadActiveDiseaseMaster() {
  const { url, serviceKey } = config()
  const baseHeaders = { apikey: serviceKey, authorization: `Bearer ${serviceKey}` }
  const diseaseResponse = await fetch(`${url}/rest/v1/diseases?select=id,code,name,description,detection_criteria,active,revision&active=eq.true&order=code`, { headers: baseHeaders })
  if (!diseaseResponse.ok) throw new Error(`Disease Master request failed (${diseaseResponse.status})`)
  const diseases = await diseaseResponse.json()
  const levelResponse = await fetch(`${url}/rest/v1/disease_severity_levels?select=disease_id,label,rank,criteria&order=rank`, { headers: baseHeaders })
  if (!levelResponse.ok) throw new Error(`Disease severity request failed (${levelResponse.status})`)
  const levels = await levelResponse.json()
  const levelsByDisease = new Map()
  for (const level of levels) {
    const list = levelsByDisease.get(level.disease_id) || []
    list.push(level)
    levelsByDisease.set(level.disease_id, list)
  }
  return diseases.map((disease) => ({
    ...disease,
    severityLevels: (levelsByDisease.get(disease.id) || []).sort((a, b) => a.rank - b.rank),
  }))
}

