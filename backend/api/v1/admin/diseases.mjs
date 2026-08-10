import { handleOptions, readJsonBody, sendJson, setCors } from '../../_lib/http.mjs'
import { requireAdminUser, supabaseRest } from '../../_lib/supabase.mjs'

const VALID_SEVERITIES = new Set(['เล็กน้อย', 'ปานกลาง', 'รุนแรง'])

function badRequest(message) {
  const error = new Error(message)
  error.status = 400
  return error
}

function notFound(message = 'ไม่พบรายการภาวะ') {
  const error = new Error(message)
  error.status = 404
  return error
}

function parseObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value
  const text = String(value || '').trim()
  if (!text) return null
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function normalizeDetectionCriteria(value) {
  const objectValue = parseObject(value)
  if (objectValue) return objectValue
  const text = String(value || '').trim()
  if (!text) return {}
  const signals = text.split(/\n|,/).map((item) => item.trim()).filter(Boolean)
  return { signals: signals.length ? signals : [text] }
}

function normalizeSeverityCriteria(value) {
  const objectValue = parseObject(value)
  if (objectValue) return objectValue
  const text = String(value || '').trim()
  return text ? { description: text } : {}
}

function detectionCriteriaToText(criteria) {
  if (!criteria) return ''
  if (Array.isArray(criteria.signals)) return criteria.signals.map(String).join(', ')
  if (criteria.description) return String(criteria.description)
  return JSON.stringify(criteria)
}

function severityCriteriaToText(criteria) {
  if (!criteria) return ''
  if (criteria.description) return String(criteria.description)
  if (Array.isArray(criteria.signals)) return criteria.signals.map(String).join(', ')
  return JSON.stringify(criteria)
}

function normalizeSeverityLevels(rawLevels) {
  if (!Array.isArray(rawLevels)) return null

  const levels = rawLevels.map((level, index) => {
    const label = String(level?.label || '').trim()
    const rank = Number(level?.rank ?? index + 1)
    if (!VALID_SEVERITIES.has(label)) throw badRequest(`ระดับความรุนแรง "${label}" ไม่ถูกต้อง`)
    if (!Number.isInteger(rank) || rank < 1 || rank > 10) throw badRequest('ลำดับระดับความรุนแรงต้องอยู่ระหว่าง 1-10')
    return { label, rank, criteria: normalizeSeverityCriteria(level?.criteria) }
  })

  if (new Set(levels.map((level) => level.label)).size !== levels.length) throw badRequest('ระดับความรุนแรงห้ามซ้ำกัน')
  if (new Set(levels.map((level) => level.rank)).size !== levels.length) throw badRequest('ลำดับระดับความรุนแรงห้ามซ้ำกัน')
  return levels
}

function normalizeDiseaseInput(body, existing = null) {
  const name = String(body?.name || '').trim()
  const category = String(body?.category || '').trim()
  const description = String(body?.description || '').trim()
  const care = String(body?.care || '').trim()
  const recommendation = String(body?.recommendation || '').trim()
  if (!name) throw badRequest('กรุณาระบุชื่อรายการภาวะ')
  if (!category) throw badRequest('กรุณาระบุหมวดหมู่')

  return {
    name,
    category,
    description,
    detectionCriteria: normalizeDetectionCriteria(body?.criteria),
    care,
    recommendation,
    referenceImage: body?.referenceImage ? String(body.referenceImage) : null,
    active: typeof body?.active === 'boolean' ? body.active : existing?.active ?? true,
    severityLevels: normalizeSeverityLevels(body?.severityLevels),
  }
}

function mapDisease(disease, levels = []) {
  return {
    id: disease.code,
    name: disease.name,
    category: disease.category,
    description: disease.description || '',
    criteria: detectionCriteriaToText(disease.detection_criteria),
    severityCriteria: '',
    severity: 'เล็กน้อย',
    severityLevels: [...levels].sort((a, b) => a.rank - b.rank).map((level) => ({
      label: level.label,
      rank: level.rank,
      criteria: severityCriteriaToText(level.criteria),
    })),
    care: disease.care_instruction || '',
    recommendation: disease.recommendation || '',
    referenceImage: disease.reference_image_path || undefined,
    active: Boolean(disease.active),
  }
}

async function findDiseaseByCode(code) {
  const rows = await supabaseRest(`/rest/v1/diseases?select=id,code,name,category,description,detection_criteria,care_instruction,recommendation,reference_image_path,active,revision&code=eq.${encodeURIComponent(code)}&limit=1`)
  if (!rows?.[0]) throw notFound()
  return rows[0]
}

async function loadLevels(diseaseId) {
  return supabaseRest(`/rest/v1/disease_severity_levels?select=id,disease_id,label,rank,criteria&disease_id=eq.${encodeURIComponent(diseaseId)}&order=rank`)
}

async function listDiseases() {
  const [diseases, levels] = await Promise.all([
    supabaseRest('/rest/v1/diseases?select=id,code,name,category,description,detection_criteria,care_instruction,recommendation,reference_image_path,active,revision&order=code'),
    supabaseRest('/rest/v1/disease_severity_levels?select=disease_id,label,rank,criteria&order=rank'),
  ])
  const levelsByDisease = new Map()
  for (const level of levels) {
    const current = levelsByDisease.get(level.disease_id) || []
    current.push(level)
    levelsByDisease.set(level.disease_id, current)
  }
  return diseases.map((disease) => mapDisease(disease, levelsByDisease.get(disease.id) || []))
}

async function getNextDiseaseCode() {
  const rows = await supabaseRest('/rest/v1/diseases?select=code')
  let maxNumber = 0
  for (const row of rows) {
    const match = String(row.code || '').match(/^D(\d+)$/)
    if (match) maxNumber = Math.max(maxNumber, Number(match[1]))
  }
  return `D${String(maxNumber + 1).padStart(3, '0')}`
}

async function saveSeverityLevels(diseaseId, levels) {
  if (!Array.isArray(levels) || levels.length === 0) return
  const payload = levels.map((level) => ({ disease_id: diseaseId, label: level.label, rank: level.rank, criteria: level.criteria }))
  await supabaseRest('/rest/v1/disease_severity_levels?on_conflict=disease_id,label', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(payload),
  })
}

async function writeAudit(actorId, eventType, code, payload = {}) {
  await supabaseRest('/rest/v1/audit_logs', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ actor_id: actorId, event_type: eventType, entity_type: 'disease', entity_id: code, payload, occurred_at: new Date().toISOString() }),
  })
}

async function createDisease(body, actorId) {
  const input = normalizeDiseaseInput(body)
  const code = await getNextDiseaseCode()
  const rows = await supabaseRest('/rest/v1/diseases', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      code,
      name: input.name,
      category: input.category,
      description: input.description,
      detection_criteria: input.detectionCriteria,
      care_instruction: input.care,
      recommendation: input.recommendation,
      reference_image_path: input.referenceImage,
      active: input.active,
      revision: 1,
      created_by: actorId,
      updated_at: new Date().toISOString(),
    }),
  })
  const disease = rows?.[0]
  if (!disease) throw new Error('Supabase ไม่ได้ส่งข้อมูลรายการภาวะกลับมา')

  try {
    await saveSeverityLevels(disease.id, input.severityLevels)
  } catch (error) {
    await supabaseRest(`/rest/v1/diseases?id=eq.${encodeURIComponent(disease.id)}`, { method: 'DELETE' }).catch(() => {})
    throw error
  }

  await writeAudit(actorId, 'disease_master_created', code, { name: input.name, active: input.active })
  return mapDisease(disease, await loadLevels(disease.id))
}

async function updateDisease(code, body, actorId) {
  const existing = await findDiseaseByCode(code)
  const input = normalizeDiseaseInput(body, existing)
  const rows = await supabaseRest(`/rest/v1/diseases?id=eq.${encodeURIComponent(existing.id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      name: input.name,
      category: input.category,
      description: input.description,
      detection_criteria: input.detectionCriteria,
      care_instruction: input.care,
      recommendation: input.recommendation,
      reference_image_path: input.referenceImage,
      active: input.active,
      revision: Number(existing.revision || 1) + 1,
      updated_at: new Date().toISOString(),
    }),
  })
  const updated = rows?.[0]
  if (!updated) throw new Error('ไม่สามารถอัปเดตรายการภาวะได้')
  await saveSeverityLevels(existing.id, input.severityLevels)
  await writeAudit(actorId, 'disease_master_updated', code, { name: input.name, active: input.active, revision: updated.revision })
  return mapDisease(updated, await loadLevels(existing.id))
}

async function updateDiseaseStatus(code, body, actorId) {
  if (typeof body?.active !== 'boolean') throw badRequest('สถานะ Disease ไม่ถูกต้อง')
  const existing = await findDiseaseByCode(code)
  await supabaseRest(`/rest/v1/diseases?id=eq.${encodeURIComponent(existing.id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ active: body.active, revision: Number(existing.revision || 1) + 1, updated_at: new Date().toISOString() }),
  })
  await writeAudit(actorId, 'disease_master_updated', code, { active: body.active, previousActive: existing.active })
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  setCors(res)
  try {
    const session = await requireAdminUser(req, res)
    if (!session) return
    const diseaseCode = String(req.query?.diseaseId || '').trim()
    const action = String(req.query?.action || '').trim()

    if (req.method === 'GET' && !diseaseCode) return sendJson(res, 200, { diseases: await listDiseases() })
    if (req.method === 'POST' && !diseaseCode) {
      const disease = await createDisease(await readJsonBody(req), session.user.id)
      return sendJson(res, 201, { disease })
    }
    if (req.method === 'PATCH' && diseaseCode && action === 'status') {
      await updateDiseaseStatus(diseaseCode, await readJsonBody(req), session.user.id)
      return sendJson(res, 204, null)
    }
    if (req.method === 'PATCH' && diseaseCode && !action) {
      const disease = await updateDisease(diseaseCode, await readJsonBody(req), session.user.id)
      return sendJson(res, 200, { disease })
    }
    return sendJson(res, 405, { message: 'Method not allowed' })
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 500
    if (status >= 500) console.error('admin diseases failed', error)
    return sendJson(res, status, { message: status === 500 ? 'ไม่สามารถบันทึกรายการภาวะได้' : error.message })
  }
}
