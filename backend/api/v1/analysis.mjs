import { handleOptions, readJsonBody, sendJson, setCors } from '../_lib/http.mjs'
import { downloadFile } from '../_lib/drive.mjs'
import { callGemini } from '../_lib/gemini.mjs'
import { loadActiveDiseaseMaster, requireSupabaseUser, supabaseRest } from '../_lib/supabase.mjs'

const validPositions = new Set(['left-dorsal', 'left-sole', 'right-dorsal', 'right-sole'])
const validSeverities = new Set(['เล็กน้อย', 'ปานกลาง', 'รุนแรง'])
const severityRank = { 'เล็กน้อย': 1, 'ปานกลาง': 2, 'รุนแรง': 3 }
const maxAnalysisImageBytes = 800_000
const maxAnalysisPayloadBytes = 3_200_000

function readInlineImages(values) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) return []
  let totalBytes = 0
  return Object.entries(values).map(([position, value]) => {
    if (!validPositions.has(position)) throw new Error(`Invalid image position: ${position}`)
    const match = /^data:(image\/(?:jpeg|webp|png));base64,([A-Za-z0-9+/=]+)$/.exec(String(value || ''))
    if (!match) throw new Error(`Invalid analysis image: ${position}`)
    const bytes = Buffer.byteLength(match[2], 'base64')
    totalBytes += bytes
    if (!bytes || bytes > maxAnalysisImageBytes || totalBytes > maxAnalysisPayloadBytes) throw new Error('Analysis images are too large')
    return { position, mimeType: match[1], data: match[2] }
  })
}

function logTiming(examinationId, startedAt, phases, outcome) {
  console.info(JSON.stringify({ event: 'dmfc_analysis_timing', examinationId, outcome, totalMs: Date.now() - startedAt, ...phases }))
}

function compareSeverity(current, previous) {
  if (!previous) return 'ยังไม่มีข้อมูลเปรียบเทียบ'
  const currentRank = severityRank[current] || 0
  const previousRank = severityRank[previous] || 0
  if (!currentRank || !previousRank) return 'ยังไม่มีข้อมูลเปรียบเทียบ'
  if (currentRank < previousRank) return 'ดีขึ้น'
  if (currentRank > previousRank) return 'แย่ลง'
  return 'คงที่'
}

async function loadPreviousSeverityByDisease(userId, examinationId) {
  const previousExams = await supabaseRest(`/rest/v1/examinations?select=id&user_id=eq.${encodeURIComponent(userId)}&id=neq.${encodeURIComponent(examinationId)}&status=eq.confirmed&order=examined_at.desc.nullslast,created_at.desc&limit=20`)
  if (!previousExams.length) return new Map()
  const ids = previousExams.map((exam) => exam.id).join(',')
  const rows = await supabaseRest(`/rest/v1/confirmed_findings?select=disease_id,severity_label_snapshot,confirmed_at&examination_id=in.(${encodeURIComponent(ids)})&order=confirmed_at.desc`)
  const result = new Map()
  for (const row of rows) if (!result.has(row.disease_id)) result.set(row.disease_id, row.severity_label_snapshot)
  return result
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  setCors(res)
  if (req.method !== 'POST') return sendJson(res, 405, { message: 'Method not allowed' })
  const startedAt = Date.now()
  const phases = {}
  let examinationId = null
  try {
    const session = await requireSupabaseUser(req, res)
    if (!session) return
    phases.authMs = Date.now() - startedAt
    const body = await readJsonBody(req)
    examinationId = body.examinationId || null
    let images = readInlineImages(body.analysisImages)
    if (!images.length && Array.isArray(body.images)) images = body.images
    if (!images.length && body.imageReferences && typeof body.imageReferences === 'object') {
      const driveStartedAt = Date.now()
      images = await Promise.all(Object.entries(body.imageReferences).map(async ([position, fileId]) => {
        const file = await downloadFile(String(fileId))
        return { position, mimeType: file.mimeType, data: file.data.toString('base64') }
      }))
      phases.driveDownloadMs = Date.now() - driveStartedAt
    }
    phases.inputMs = Date.now() - startedAt - phases.authMs
    if (!body.examinationId || !body.idempotencyKey || images.length === 0) {
      return sendJson(res, 400, { message: 'examinationId, idempotencyKey and images are required for the initial Gemini path' })
    }

    const diseaseStartedAt = Date.now()
    const [diseaseMaster, previousSeverityByDisease] = await Promise.all([
      loadActiveDiseaseMaster(),
      loadPreviousSeverityByDisease(session.user.id, body.examinationId),
    ])
    phases.diseaseMasterMs = Date.now() - diseaseStartedAt

    const geminiStartedAt = Date.now()
    const analysis = await callGemini({ images, diseaseMaster })
    phases.geminiMs = Date.now() - geminiStartedAt
    const diseasesById = new Map(diseaseMaster.map((disease) => [disease.id, disease]))
    const rejectedItems = []
    const findings = []
    const seen = new Set()
    const rawFindings = Array.isArray(analysis.rawResult?.findings) ? analysis.rawResult.findings : []
    rawFindings.forEach((item, index) => {
      const disease = diseasesById.get(item?.diseaseId)
      const positions = Array.isArray(item?.imagePositions) ? item.imagePositions.filter((position) => validPositions.has(position)) : []
      const allowedSeverity = new Set((disease?.severityLevels || []).map((level) => level.label))
      const severity = item?.suggestedSeverity == null ? null : String(item.suggestedSeverity)
      if (!disease || seen.has(item?.diseaseId)) return rejectedItems.push({ index, diseaseId: item?.diseaseId || null, reason: 'Unknown, inactive or duplicate Disease ID' })
      if (typeof item.detected !== 'boolean') return rejectedItems.push({ index, diseaseId: item.diseaseId, reason: 'detected must be boolean' })
      if (item.detected && (!severity || !validSeverities.has(severity) || !allowedSeverity.has(severity))) return rejectedItems.push({ index, diseaseId: item.diseaseId, reason: 'severity does not match Disease Master' })
      if (typeof item.confidence !== 'number' || item.confidence < 0 || item.confidence > 1) return rejectedItems.push({ index, diseaseId: item.diseaseId, reason: 'confidence must be between 0 and 1' })
      seen.add(item.diseaseId)
      findings.push({
        diseaseId: disease.code,
        name: disease.name,
        detected: item.detected,
        severity: severity || 'เล็กน้อย',
        confidence: Math.round(item.confidence * 100),
        comparison: item.detected ? compareSeverity(severity, previousSeverityByDisease.get(disease.id)) : 'ยังไม่มีข้อมูลเปรียบเทียบ',
        imagePosition: positions[0] || null,
        imagePositions: positions,
      })
    })
    logTiming(examinationId, startedAt, phases, 'success')
    sendJson(res, 200, {
      runId: `gemini-${body.examinationId}-${body.idempotencyKey}`,
      rawResult: analysis.rawResult,
      validation: { status: rejectedItems.length ? 'accepted_with_rejections' : 'accepted', rawResult: analysis.rawResult, findings: rawFindings, rejectedItems },
      findings,
      model: analysis.model,
      userId: session.user.id,
    })
  } catch (error) {
    console.error('Gemini analysis failed', error)
    logTiming(examinationId, startedAt, phases, 'failed')
    sendJson(res, 500, { message: error instanceof Error ? error.message : 'Gemini analysis failed' })
  }
}
