import { handleOptions, readJsonBody, sendJson, setCors } from '../_lib/http.mjs'
import { downloadFile } from '../_lib/drive.mjs'
import { callGemini } from '../_lib/gemini.mjs'
import { loadActiveDiseaseMaster, requireSupabaseUser } from '../_lib/supabase.mjs'

const validPositions = new Set(['left-dorsal', 'left-sole', 'right-dorsal', 'right-sole'])
const validSeverities = new Set(['เล็กน้อย', 'ปานกลาง', 'รุนแรง'])

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  setCors(res)
  if (req.method !== 'POST') return sendJson(res, 405, { message: 'Method not allowed' })
  try {
    const session = await requireSupabaseUser(req, res)
    if (!session) return
    const body = await readJsonBody(req)
    let images = Array.isArray(body.images) ? body.images : []
    if (!images.length && body.imageReferences && typeof body.imageReferences === 'object') {
      images = await Promise.all(Object.entries(body.imageReferences).map(async ([position, fileId]) => {
        const file = await downloadFile(String(fileId))
        return { position, mimeType: file.mimeType, data: file.data.toString('base64') }
      }))
    }
    if (!body.examinationId || !body.idempotencyKey || images.length === 0) {
      return sendJson(res, 400, { message: 'examinationId, idempotencyKey and images are required for the initial Gemini path' })
    }
    const diseaseMaster = await loadActiveDiseaseMaster()
    const analysis = await callGemini({ images, diseaseMaster })
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
        comparison: 'คงที่',
        imagePosition: positions[0] || null,
        imagePositions: positions,
      })
    })
    sendJson(res, 200, {
      runId: `gemini-${body.examinationId}-${body.idempotencyKey}`,
      rawResult: analysis.rawResult,
      validation: { status: rejectedItems.length ? 'accepted_with_rejections' : 'accepted', rawResult: analysis.rawResult, findings: rawFindings, rejectedItems },
      findings,
      model: analysis.model,
      userId: session.user.id,
    })
  } catch (error) {
    sendJson(res, 500, { message: error instanceof Error ? error.message : 'Gemini analysis failed' })
  }
}
