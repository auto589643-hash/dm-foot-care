import crypto from 'node:crypto'

let cachedToken = null
let cachedTokenExpiresAt = 0

function credentials() {
  const raw = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('Google Drive service account is not configured')
  const value = typeof raw === 'string' ? JSON.parse(raw) : raw
  if (!value.client_email || !value.private_key) throw new Error('Google Drive service account JSON is incomplete')
  return value
}

function base64Url(value) {
  return Buffer.from(value).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

async function accessToken() {
  if (cachedToken && cachedTokenExpiresAt > Date.now() + 60_000) return cachedToken
  const serviceAccount = credentials()
  const now = Math.floor(Date.now() / 1000)
  const unsigned = `${base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64Url(JSON.stringify({ iss: serviceAccount.client_email, scope: 'https://www.googleapis.com/auth/drive', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }))}`
  const signer = crypto.createSign('RSA-SHA256')
  signer.update(unsigned)
  const assertion = `${unsigned}.${base64Url(signer.sign(serviceAccount.private_key))}`
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  })
  const payload = await response.json()
  if (!response.ok || !payload.access_token) throw new Error(`Google token request failed (${response.status})`)
  cachedToken = payload.access_token
  cachedTokenExpiresAt = Date.now() + Number(payload.expires_in || 3600) * 1000
  return cachedToken
}

async function driveFetch(path, init = {}) {
  const response = await fetch(`https://www.googleapis.com/drive/v3${path}`, {
    ...init,
    headers: { authorization: `Bearer ${await accessToken()}`, ...(init.headers || {}) },
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Google Drive request failed (${response.status}): ${text.slice(0, 300)}`)
  }
  return response
}

export async function findRootFolder() {
  const explicit = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || process.env.GOOGLE_DRIVE_FOLDER_ID
  if (explicit) return explicit
  const query = encodeURIComponent("name = 'DMFC Program' and mimeType = 'application/vnd.google-apps.folder' and trashed = false")
  const response = await driveFetch(`/files?q=${query}&fields=files(id,name)&pageSize=10`)
  const payload = await response.json()
  return payload.files?.[0]?.id || null
}

export async function createFolder(name, parentId = null) {
  const body = { name, mimeType: 'application/vnd.google-apps.folder', ...(parentId ? { parents: [parentId] } : {}) }
  const response = await driveFetch('/files?fields=id,name,parents', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return response.json()
}

export async function uploadFile(folderId, filename, mimeType, data) {
  const boundary = `dmfc_${crypto.randomUUID().replaceAll('-', '')}`
  const metadata = JSON.stringify({ name: filename, parents: [folderId] })
  const preamble = Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType || 'application/octet-stream'}\r\n\r\n`)
  const ending = Buffer.from(`\r\n--${boundary}--`)
  const body = Buffer.concat([preamble, data, ending])
  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType', {
    method: 'POST',
    headers: { authorization: `Bearer ${await accessToken()}`, 'content-type': `multipart/related; boundary=${boundary}`, 'content-length': String(body.length) },
    body,
  })
  if (!response.ok) throw new Error(`Google Drive upload failed (${response.status}): ${(await response.text()).slice(0, 300)}`)
  return response.json()
}

export async function getFileMetadata(fileId) {
  const response = await driveFetch(`/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,parents`)
  return response.json()
}

export async function downloadFile(fileId) {
  const response = await driveFetch(`/files/${encodeURIComponent(fileId)}?alt=media`)
  return { data: Buffer.from(await response.arrayBuffer()), mimeType: response.headers.get('content-type') || 'application/octet-stream' }
}
