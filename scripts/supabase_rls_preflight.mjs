/**
 * Supabase Data API/RLS preflight. Run only against a development/staging
 * project with three short-lived user tokens; it performs read checks and a
 * deliberately invalid client-write attempt without creating test data.
 *
 * Required environment variables:
 *   SUPABASE_URL
 *   VITE_SUPABASE_PUBLISHABLE_KEY
 *   DMFC_PATIENT_A_TOKEN
 *   DMFC_PATIENT_B_TOKEN
 *   DMFC_DOCTOR_TOKEN
 */

const supabaseUrl = process.env.SUPABASE_URL
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
const tokens = {
  patientA: process.env.DMFC_PATIENT_A_TOKEN,
  patientB: process.env.DMFC_PATIENT_B_TOKEN,
  doctor: process.env.DMFC_DOCTOR_TOKEN,
}
const timeoutMs = Number(process.env.DMFC_RLS_PREFLIGHT_TIMEOUT_MS ?? 10000)

if (!supabaseUrl || !publishableKey || Object.values(tokens).some((value) => !value)) {
  fail('กำหนด SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY และ token ของ patient A/B กับ doctor ให้ครบ')
}

let parsedUrl
try {
  parsedUrl = new URL(supabaseUrl)
} catch {
  fail('SUPABASE_URL ไม่ใช่ URL ที่ถูกต้อง')
}
if (parsedUrl.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(parsedUrl.hostname)) {
  fail('SUPABASE_URL ต้องใช้ HTTPS นอก local development')
}

const restUrl = new URL('rest/v1/', `${parsedUrl.toString().replace(/\/$/, '')}/`).toString()
const patientA = await readRows('patientA', tokens.patientA, 'profiles?select=user_id,username')
const patientB = await readRows('patientB', tokens.patientB, 'profiles?select=user_id,username')
const doctor = await readRows('doctor', tokens.doctor, 'profiles?select=user_id,username')

if (patientA.length !== 1 || patientB.length !== 1) fail('Patient profile RLS ควรเห็น profile ของตัวเองเพียง 1 แถว')
if (patientA[0].user_id === patientB[0].user_id) fail('Patient A และ Patient B ต้องเป็นคนละ user_id')
if (doctor.length < 1) fail('Doctor ต้องอ่าน profile ที่ได้รับอนุญาตได้อย่างน้อย 1 แถว')
console.log('profiles: patient A/B isolation and doctor access passed')

const examsA = await readRows('patientA', tokens.patientA, 'examinations?select=id,user_id')
const examsB = await readRows('patientB', tokens.patientB, 'examinations?select=id,user_id')
const ownA = patientA[0].user_id
const ownB = patientB[0].user_id
if (examsA.some((row) => row.user_id !== ownA) || examsB.some((row) => row.user_id !== ownB)) {
  fail('Examination RLS เปิดเผยข้อมูลข้ามผู้ใช้')
}
console.log(`examinations: patient isolation passed (A=${examsA.length}, B=${examsB.length})`)

const writeAttempt = await request('patientA', tokens.patientA, 'examinations', {
  method: 'POST',
  // Ask PostgREST to roll the transaction back even if an unsafe policy lets
  // the insert through; the probe must never leave a test examination behind.
  headers: { 'content-type': 'application/json', prefer: 'tx=rollback,return=minimal' },
  body: JSON.stringify({ user_id: ownA, status: 'draft' }),
})
if (writeAttempt.status >= 200 && writeAttempt.status < 300) fail('Patient client write to examinations unexpectedly succeeded')
console.log(`patient write denial: HTTP ${writeAttempt.status} (expected non-2xx)`)
console.log('Supabase RLS preflight passed')

async function readRows(actor, token, path) {
  const response = await request(actor, token, path)
  if (response.status < 200 || response.status >= 300) fail(`${actor} GET ${path} ได้ HTTP ${response.status}`)
  const payload = parseJson(response.body)
  if (!Array.isArray(payload)) fail(`${actor} GET ${path} ต้องคืน JSON array`)
  return payload
}

async function request(_actor, token, path, init = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const headers = new Headers(init.headers)
    headers.set('apikey', publishableKey)
    headers.set('authorization', `Bearer ${token}`)
    headers.set('accept', 'application/json')
    const response = await fetch(new URL(path, restUrl), { ...init, headers, signal: controller.signal })
    return { status: response.status, body: await response.text() }
  } catch (error) {
    fail(`Supabase API เชื่อมต่อไม่ได้: ${error instanceof Error ? error.message : 'unknown error'}`)
  } finally {
    clearTimeout(timer)
  }
}

function parseJson(value) {
  try {
    return JSON.parse(value)
  } catch {
    fail('Supabase response ไม่ใช่ JSON ที่ถูกต้อง')
  }
}

function fail(message) {
  console.error(`Supabase RLS preflight failed: ${message}`)
  process.exitCode = 1
  throw new Error(message)
}
