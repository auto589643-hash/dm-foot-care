import { supabaseRest } from './supabase.mjs'

export const RESULT_REVISION_KIND = 'staff_result_revision_v1'
export const RESULT_NOTIFICATION_TYPE = 'result_updated'
export const RESULT_NOTIFICATION_TITLE = 'ผลตรวจเท้าของคุณมีการอัปเดต'
export const RESULT_NOTIFICATION_BODY = 'เจ้าหน้าที่ได้ตรวจทานผลล่าสุดแล้ว แตะเพื่อดูรายละเอียด'
const PENDING_STALE_MS = 2 * 60 * 1000

function appError(status, message, extras = {}) {
  const error = new Error(message)
  error.status = status
  Object.assign(error, extras)
  return error
}

function array(value) {
  return Array.isArray(value) ? value : []
}

function revisionPayload(row) {
  return row?.payload && typeof row.payload === 'object' && !Array.isArray(row.payload) ? row.payload : {}
}

function isDmfcRevision(row) {
  return revisionPayload(row).kind === RESULT_REVISION_KIND
}

function isCommitted(row) {
  return isDmfcRevision(row) && revisionPayload(row).state === 'committed'
}

function isPending(row) {
  return isDmfcRevision(row) && revisionPayload(row).state === 'pending'
}

function findingKey(finding) {
  return `${String(finding?.diseaseId || '')}\u0000${String(finding?.severity || '')}`
}

export function canonicalFindings(findings) {
  return array(findings)
    .map((finding) => ({
      diseaseId: String(finding?.diseaseId || '').trim(),
      name: String(finding?.name || '').trim(),
      severity: String(finding?.severity || '').trim(),
      ...(finding?.detected === false ? { detected: false } : {}),
      ...(finding?.imagePosition ? { imagePosition: finding.imagePosition } : {}),
    }))
    .filter((finding) => finding.diseaseId && finding.severity)
    .sort((a, b) => a.diseaseId.localeCompare(b.diseaseId))
}

export function findingsMateriallyEqual(left, right) {
  const a = canonicalFindings(left)
  const b = canonicalFindings(right)
  if (a.length !== b.length) return false
  return a.every((finding, index) => findingKey(finding) === findingKey(b[index]))
}

export function diffFindings(before, after) {
  const oldById = new Map(canonicalFindings(before).map((finding) => [finding.diseaseId, finding]))
  const newById = new Map(canonicalFindings(after).map((finding) => [finding.diseaseId, finding]))
  return {
    added: [...newById.values()].filter((finding) => !oldById.has(finding.diseaseId)),
    removed: [...oldById.values()].filter((finding) => !newById.has(finding.diseaseId)),
    changed: [...newById.values()].flatMap((finding) => {
      const previous = oldById.get(finding.diseaseId)
      return previous && previous.severity !== finding.severity
        ? [{ diseaseId: finding.diseaseId, fromSeverity: previous.severity, toSeverity: finding.severity }]
        : []
    }),
  }
}

function examAuditQuery(examinationId) {
  return `/rest/v1/audit_logs?select=id,actor_id,entity_id,payload,occurred_at&event_type=eq.human_review_edited&entity_type=eq.examination&entity_id=eq.${encodeURIComponent(examinationId)}&order=id.asc`
}

export async function listResultRevisionLogs(examinationId) {
  const rows = await supabaseRest(examAuditQuery(examinationId))
  return rows.filter(isDmfcRevision)
}

export async function listCommittedResultRevisionsForExaminations(examinationIds) {
  const ids = [...new Set(array(examinationIds).map(String).filter(Boolean))]
  if (!ids.length) return []
  const filter = ids.map((id) => encodeURIComponent(id)).join(',')
  const rows = await supabaseRest(`/rest/v1/audit_logs?select=id,actor_id,entity_id,payload,occurred_at&event_type=eq.human_review_edited&entity_type=eq.examination&entity_id=in.(${filter})&order=id.asc`)
  return rows.filter(isCommitted)
}

export function currentCommittedRevision(logs) {
  return array(logs)
    .filter(isCommitted)
    .reduce((max, row) => Math.max(max, Number(revisionPayload(row).revisionNo) || 0), 0)
}

export function mapRevisionForClient(row, reviewerName = 'เจ้าหน้าที่') {
  const payload = revisionPayload(row)
  return {
    id: String(row.id),
    revisionNo: Number(payload.revisionNo) || 0,
    reviewedFindings: canonicalFindings(payload.reviewedFindings),
    changeSet: payload.changeSet || {},
    reviewNote: String(payload.reviewNote || ''),
    reviewedBy: reviewerName,
    createdAt: payload.committedAt || row.occurred_at,
  }
}

export async function loadCurrentConfirmedFindings(examinationId) {
  const rows = await supabaseRest(`/rest/v1/confirmed_findings?select=disease_code_snapshot,disease_name_snapshot,severity_label_snapshot&examination_id=eq.${encodeURIComponent(examinationId)}&order=disease_code_snapshot`)
  return canonicalFindings(rows.map((row) => ({
    diseaseId: row.disease_code_snapshot,
    name: row.disease_name_snapshot,
    severity: row.severity_label_snapshot || 'เล็กน้อย',
  })))
}

export async function loadOriginalAiSnapshot(examinationId) {
  const runs = await supabaseRest(`/rest/v1/ai_analysis_runs?select=id,created_at,completed_at&examination_id=eq.${encodeURIComponent(examinationId)}&status=eq.validated&order=completed_at.desc.nullslast,created_at.desc&limit=1`)
  const run = runs[0] || null
  if (!run) return { runId: null, findings: [] }
  const rows = await supabaseRest(`/rest/v1/ai_findings?select=id,disease_id,disease_code_snapshot,disease_name_snapshot,detected,suggested_severity_label_snapshot,image_position&run_id=eq.${encodeURIComponent(run.id)}&order=disease_code_snapshot`)
  return {
    runId: run.id,
    findings: rows.map((row) => ({
      diseaseId: row.disease_code_snapshot || '',
      name: row.disease_name_snapshot || 'ไม่ระบุภาวะ',
      detected: Boolean(row.detected),
      severity: row.suggested_severity_label_snapshot || 'เล็กน้อย',
      imagePosition: row.image_position || null,
    })),
  }
}

async function resolveFindings(findings, { requireActive = true } = {}) {
  const canonical = canonicalFindings(findings)
  if (!canonical.length) return []
  if (new Set(canonical.map((finding) => finding.diseaseId)).size !== canonical.length) throw appError(400, 'มีรายการภาวะซ้ำกัน')

  const codeFilter = canonical.map((finding) => encodeURIComponent(finding.diseaseId)).join(',')
  const diseases = await supabaseRest(`/rest/v1/diseases?select=id,code,name,active&code=in.(${codeFilter})`)
  const diseaseByCode = new Map(diseases.map((disease) => [disease.code, disease]))
  if (canonical.some((finding) => !diseaseByCode.has(finding.diseaseId))) throw appError(400, 'พบรายการภาวะที่ไม่ถูกต้อง')
  if (requireActive && canonical.some((finding) => !diseaseByCode.get(finding.diseaseId)?.active)) throw appError(400, 'ไม่สามารถเลือกภาวะที่ปิดใช้งานแล้ว')

  const diseaseIds = diseases.map((disease) => encodeURIComponent(disease.id)).join(',')
  const levels = await supabaseRest(`/rest/v1/disease_severity_levels?select=id,disease_id,label&disease_id=in.(${diseaseIds})`)
  const levelByKey = new Map(levels.map((level) => [`${level.disease_id}\u0000${level.label}`, level]))

  return canonical.map((finding) => {
    const disease = diseaseByCode.get(finding.diseaseId)
    const level = levelByKey.get(`${disease.id}\u0000${finding.severity}`)
    if (!level) throw appError(400, `ระดับความรุนแรงของ ${finding.diseaseId} ไม่ถูกต้อง`)
    return {
      diseaseId: disease.code,
      name: disease.name,
      severity: finding.severity,
      diseaseUuid: disease.id,
      severityUuid: level.id,
    }
  }).sort((a, b) => a.diseaseId.localeCompare(b.diseaseId))
}

function publicFindings(resolved) {
  return resolved.map(({ diseaseId, name, severity }) => ({ diseaseId, name, severity }))
}

async function replaceConfirmedProjection(examinationId, findings, reviewerId, aiRunId, { requireActive = true } = {}) {
  const resolved = await resolveFindings(findings, { requireActive })
  const aiRows = aiRunId && resolved.length
    ? await supabaseRest(`/rest/v1/ai_findings?select=id,disease_id,detected&run_id=eq.${encodeURIComponent(aiRunId)}`)
    : []
  const aiFindingByDisease = new Map(aiRows.filter((row) => row.detected).map((row) => [row.disease_id, row.id]))

  await supabaseRest(`/rest/v1/confirmed_findings?examination_id=eq.${encodeURIComponent(examinationId)}`, { method: 'DELETE' })
  if (resolved.length) {
    const confirmedAt = new Date().toISOString()
    await supabaseRest('/rest/v1/confirmed_findings', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(resolved.map((finding) => ({
        examination_id: examinationId,
        disease_id: finding.diseaseUuid,
        disease_code_snapshot: finding.diseaseId,
        disease_name_snapshot: finding.name,
        severity_id: finding.severityUuid,
        severity_label_snapshot: finding.severity,
        ai_finding_id: aiFindingByDisease.get(finding.diseaseUuid) || null,
        confirmed_by: reviewerId,
        confirmed_at: confirmedAt,
      }))),
    })
  }
  return publicFindings(resolved)
}

async function updateAuditPayload(row, payload) {
  const rows = await supabaseRest(`/rest/v1/audit_logs?id=eq.${encodeURIComponent(row.id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ payload }),
  })
  if (!rows?.[0]) throw new Error('ไม่สามารถอัปเดต audit revision ได้')
  return rows[0]
}

async function deleteAuditRow(id) {
  await supabaseRest(`/rest/v1/audit_logs?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' })
}

async function recoverStalePending(examinationId, logs, aiRunId) {
  let changed = false
  for (const row of logs.filter(isPending)) {
    const payload = revisionPayload(row)
    const startedAt = new Date(payload.startedAt || row.occurred_at).getTime()
    if (Number.isFinite(startedAt) && Date.now() - startedAt < PENDING_STALE_MS) continue

    const current = await loadCurrentConfirmedFindings(examinationId)
    const before = canonicalFindings(payload.beforeFindings)
    const after = canonicalFindings(payload.reviewedFindings)
    if (findingsMateriallyEqual(current, after)) {
      await updateAuditPayload(row, { ...payload, state: 'committed', committedAt: new Date().toISOString(), recovered: true })
      changed = true
      continue
    }
    if (!findingsMateriallyEqual(current, before)) await replaceConfirmedProjection(examinationId, before, row.actor_id, aiRunId, { requireActive: false })
    await deleteAuditRow(row.id)
    changed = true
  }
  return changed
}

function reviewerIdsFromLogs(logs) {
  return [...new Set(logs.map((row) => row.actor_id).filter(Boolean))]
}

export async function loadResultReviewDetail(examinationId) {
  const exams = await supabaseRest(`/rest/v1/examinations?select=id,user_id,status,updated_at,examined_at,created_at&id=eq.${encodeURIComponent(examinationId)}&limit=1`)
  const exam = exams[0]
  if (!exam) return null

  const [currentFindings, ai, initialLogs] = await Promise.all([
    loadCurrentConfirmedFindings(examinationId),
    loadOriginalAiSnapshot(examinationId),
    listResultRevisionLogs(examinationId),
  ])
  let logs = initialLogs
  if (await recoverStalePending(examinationId, logs, ai.runId)) logs = await listResultRevisionLogs(examinationId)
  const committed = logs.filter(isCommitted)
  const reviewerIds = reviewerIdsFromLogs(committed)
  const reviewerProfiles = reviewerIds.length
    ? await supabaseRest(`/rest/v1/profiles?select=user_id,username,display_name&user_id=in.(${reviewerIds.map(encodeURIComponent).join(',')})`)
    : []
  const reviewerById = new Map(reviewerProfiles.map((row) => [row.user_id, row.display_name || row.username || 'เจ้าหน้าที่']))

  return {
    examinationId: exam.id,
    status: exam.status,
    currentRevision: currentCommittedRevision(committed),
    originalAiFindings: ai.findings,
    currentFindings,
    revisions: [...committed]
      .sort((a, b) => Number(revisionPayload(b).revisionNo) - Number(revisionPayload(a).revisionNo))
      .map((row) => mapRevisionForClient(row, reviewerById.get(row.actor_id) || 'เจ้าหน้าที่')),
  }
}

function changeSet(before, after) {
  const diff = diffFindings(before, after)
  return { added: diff.added, removed: diff.removed, changed: diff.changed }
}

export async function createReviewedResultRevision({ examinationId, expectedCurrentRevision, findings, reviewNote, reviewerId, requestKey }) {
  const exams = await supabaseRest(`/rest/v1/examinations?select=id,user_id,status,updated_at&id=eq.${encodeURIComponent(examinationId)}&limit=1`)
  let exam = exams[0]
  if (!exam) throw appError(404, 'ไม่พบรายการตรวจ')
  if (exam.status !== 'confirmed') throw appError(400, 'ตรวจทานได้เฉพาะผลตรวจที่ส่งให้ผู้ใช้งานแล้ว')

  const ai = await loadOriginalAiSnapshot(examinationId)
  let logs = await listResultRevisionLogs(examinationId)
  if (await recoverStalePending(examinationId, logs, ai.runId)) {
    logs = await listResultRevisionLogs(examinationId)
    const refreshed = await supabaseRest(`/rest/v1/examinations?select=id,user_id,status,updated_at&id=eq.${encodeURIComponent(examinationId)}&limit=1`)
    exam = refreshed[0] || exam
  }

  const priorSameRequest = logs.find((row) => revisionPayload(row).requestKey === requestKey && isCommitted(row))
  if (priorSameRequest) {
    const payload = revisionPayload(priorSameRequest)
    return { revisionId: String(priorSameRequest.id), revisionNo: Number(payload.revisionNo) || 0, noOp: false, idempotent: true, notificationId: String(priorSameRequest.id) }
  }

  const activePending = logs.filter(isPending)
  if (activePending.length) throw appError(409, 'มีเจ้าหน้าที่กำลังบันทึกผลรายการนี้ กรุณาโหลดข้อมูลล่าสุด', { currentRevision: currentCommittedRevision(logs) })

  const currentRevision = currentCommittedRevision(logs)
  if (expectedCurrentRevision !== currentRevision) throw appError(409, 'ผลตรวจถูกแก้ไขโดยเจ้าหน้าที่อีกคน กรุณาโหลดข้อมูลล่าสุด', { currentRevision })

  const before = await loadCurrentConfirmedFindings(examinationId)
  const resolvedAfter = await resolveFindings(findings, { requireActive: true })
  const after = publicFindings(resolvedAfter)
  if (findingsMateriallyEqual(before, after)) return { revisionNo: currentRevision, noOp: true, idempotent: false, notificationId: null }

  const revisionNo = currentRevision + 1
  const startedAt = new Date().toISOString()
  const payload = {
    kind: RESULT_REVISION_KIND,
    state: 'pending',
    revisionNo,
    requestKey,
    examinationId,
    patientUserId: exam.user_id,
    originalAiRunId: ai.runId,
    originalAiFindings: ai.findings,
    beforeFindings: before,
    reviewedFindings: after,
    changeSet: changeSet(before, after),
    reviewNote: reviewNote || '',
    notification: { type: RESULT_NOTIFICATION_TYPE, title: RESULT_NOTIFICATION_TITLE, body: RESULT_NOTIFICATION_BODY },
    startedAt,
  }

  const inserted = await supabaseRest('/rest/v1/audit_logs', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ actor_id: reviewerId, event_type: 'human_review_edited', entity_type: 'examination', entity_id: examinationId, payload, occurred_at: startedAt }),
  })
  const pending = inserted?.[0]
  if (!pending) throw new Error('ไม่สามารถสร้าง audit revision ได้')

  const contenders = (await listResultRevisionLogs(examinationId))
    .filter((row) => isPending(row) && Number(revisionPayload(row).revisionNo) === revisionNo)
    .sort((a, b) => Number(a.id) - Number(b.id))
  if (String(contenders[0]?.id) !== String(pending.id)) {
    await deleteAuditRow(pending.id).catch(() => {})
    throw appError(409, 'ผลตรวจถูกแก้ไขพร้อมกัน กรุณาโหลดข้อมูลล่าสุด', { currentRevision })
  }

  const claimed = await supabaseRest(`/rest/v1/examinations?id=eq.${encodeURIComponent(examinationId)}&updated_at=eq.${encodeURIComponent(exam.updated_at)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ updated_at: exam.updated_at }),
  })
  if (!claimed?.length) {
    await deleteAuditRow(pending.id).catch(() => {})
    throw appError(409, 'ผลตรวจมีการเปลี่ยนแปลง กรุณาโหลดข้อมูลล่าสุด', { currentRevision })
  }

  try {
    await replaceConfirmedProjection(examinationId, after, reviewerId, ai.runId, { requireActive: true })
    const committedAt = new Date().toISOString()
    await updateAuditPayload(pending, { ...payload, state: 'committed', committedAt })
    return { revisionId: String(pending.id), revisionNo, noOp: false, idempotent: false, notificationId: String(pending.id) }
  } catch (error) {
    try {
      await replaceConfirmedProjection(examinationId, before, reviewerId, ai.runId, { requireActive: false })
      await deleteAuditRow(pending.id)
    } catch {
      // Leave the journal pending so the next staff load can recover deterministically.
    }
    throw error
  }
}

export function notificationFromRevision(row, acknowledgedAt = null) {
  const payload = revisionPayload(row)
  const notification = payload.notification || {}
  return {
    id: String(row.id),
    type: notification.type || RESULT_NOTIFICATION_TYPE,
    examinationId: String(payload.examinationId || row.entity_id || ''),
    resultRevisionNo: Number(payload.revisionNo) || 0,
    title: notification.title || RESULT_NOTIFICATION_TITLE,
    body: notification.body || RESULT_NOTIFICATION_BODY,
    acknowledgedAt,
    createdAt: payload.committedAt || row.occurred_at,
  }
}

export function revisionPayloadForServer(row) {
  return revisionPayload(row)
}
