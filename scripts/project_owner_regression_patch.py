from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str) -> None:
    file_path = Path(path)
    text = file_path.read_text()
    if old not in text:
        raise RuntimeError(f'{label}: expected source block not found; refusing blind patch')
    file_path.write_text(text.replace(old, new, 1))


# 1) Auth compatibility: visible username is not the Supabase Auth email identity.
replace_once(
    'backend/api/_lib/supabase.mjs',
    """  const email = internalAuthEmail(normalizedUsername)
  const internalPassword = internalAuthPassword(normalizedUsername)
  let tokenResponse = await requestPasswordToken(url, publishableKey, email, internalPassword)

  // Existing accounts created before deterministic internal credentials may
  // still have a random Supabase password. Repair once, then future logins use
  // the direct token path without an admin user read/write round trip.
  if (!tokenResponse.ok) {
    const passwordUpdate = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(profile.user_id)}`, {
      method: 'PUT',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ password: internalPassword, email_confirm: true }),
    })
    if (!passwordUpdate.ok) return null
    tokenResponse = await requestPasswordToken(url, publishableKey, email, internalPassword)
  }

  if (!tokenResponse.ok) return null
  const token = await tokenResponse.json()
""",
    """  const preferredEmail = internalAuthEmail(normalizedUsername)
  const internalPassword = internalAuthPassword(normalizedUsername)
  let signInEmail = preferredEmail
  let tokenResponse = await requestPasswordToken(url, publishableKey, signInEmail, internalPassword)

  // Legacy accounts may use an internal Auth email that predates the visible
  // username convention. Resolve the immutable Auth user id only on the slow
  // fallback path, repair its password, then authenticate with its real email.
  if (!tokenResponse.ok) {
    const authUserResponse = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(profile.user_id)}`, {
      headers,
    })
    if (!authUserResponse.ok) return null
    const authUser = await authUserResponse.json()
    signInEmail = String(authUser?.email || '').trim().toLowerCase()
    if (!signInEmail) return null

    const passwordUpdate = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(profile.user_id)}`, {
      method: 'PUT',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ password: internalPassword, email_confirm: true }),
    })
    if (!passwordUpdate.ok) return null
    tokenResponse = await requestPasswordToken(url, publishableKey, signInEmail, internalPassword)
  }

  if (!tokenResponse.ok) return null
  const token = await tokenResponse.json()
  if (!token?.user?.id || token.user.id !== profile.user_id) return null
""",
    'auth compatibility',
)

# 2) Finalize workflow: distinguish thumbnail failures from persistence failures.
path = Path('src/services/finalizeWorkflow.ts')
text = path.read_text()
marker = '/** Generate web-only thumbnails after the final clinical result is confirmed. */'
if marker not in text:
    raise RuntimeError('finalize workflow marker not found')
prefix = text[:text.index(marker)]
replacement = '''/** Generate web-only thumbnails after the final clinical result is confirmed. */
export async function finalizeExamination(input: FinalizeExaminationInput): Promise<Record<FootPosition, string>> {
  const { examinationId, images, thumbnailService, repository, confirmedFindings = [], confirmedBy, auditLogger, actorId, reviewChangedCount = 0, precomputedThumbnails } = input

  const markThumbnailFailed = async () => {
    try {
      await repository.updateStatus(examinationId, 'thumbnail_failed')
    } catch {
      // Preserve the original thumbnail failure if this secondary state write fails.
    }
  }

  if (confirmedBy && repository.finalizeExamination) {
    let thumbnails: Record<FootPosition, string>
    try {
      thumbnails = precomputedThumbnails ?? await thumbnailService.generateAndStore(examinationId, images)
      await repository.saveThumbnailReferences({ examinationId, thumbnails })
    } catch (cause) {
      await markThumbnailFailed()
      throw new FinalizePipelineError('สร้างภาพสรุปไม่สำเร็จ กรุณาลองอีกครั้งโดยไม่ต้องถ่ายภาพใหม่', examinationId, cause)
    }

    try {
      await repository.finalizeExamination({
        examinationId,
        confirmedBy,
        reviewChangedCount,
        findings: confirmedFindings.map((finding) => ({ diseaseId: finding.diseaseId, severity: finding.severity })),
      })
    } catch (cause) {
      throw new FinalizePipelineError('บันทึกผลตรวจไม่สำเร็จ กรุณาลองส่งผลอีกครั้งโดยไม่ต้องถ่ายภาพใหม่', examinationId, cause)
    }
    return thumbnails
  }

  try {
    await repository.updateStatus(examinationId, 'thumbnailing')
    if (confirmedBy && confirmedFindings.length) {
      if (repository.saveConfirmedFindings) {
        await repository.saveConfirmedFindings({
          examinationId,
          confirmedBy,
          findings: confirmedFindings.map((finding) => ({ diseaseId: finding.diseaseId, severity: finding.severity })),
        })
      } else {
        await Promise.all(confirmedFindings.map((finding) => repository.saveConfirmedFinding({
          examinationId,
          diseaseId: finding.diseaseId,
          severity: finding.severity,
          confirmedBy,
        })))
      }
    }
  } catch (cause) {
    throw new FinalizePipelineError('เตรียมการบันทึกผลตรวจไม่สำเร็จ กรุณาลองอีกครั้ง', examinationId, cause)
  }

  let thumbnails: Record<FootPosition, string>
  try {
    thumbnails = precomputedThumbnails ?? await thumbnailService.generateAndStore(examinationId, images)
    await repository.saveThumbnailReferences({ examinationId, thumbnails })
  } catch (cause) {
    await markThumbnailFailed()
    throw new FinalizePipelineError('สร้างภาพสรุปไม่สำเร็จ กรุณาลองอีกครั้งโดยไม่ต้องถ่ายภาพใหม่', examinationId, cause)
  }

  try {
    if (auditLogger && reviewChangedCount > 0) {
      await auditLogger.append({ actorId: actorId ?? null, eventType: 'human_review_edited', entityType: 'finding', entityId: examinationId, payload: { changedCount: reviewChangedCount } })
    }
    await auditLogger?.append({ actorId: actorId ?? null, eventType: 'final_result_submitted', entityType: 'examination', entityId: examinationId, payload: { confirmedFindingCount: confirmedFindings.length } })
    await repository.updateStatus(examinationId, 'confirmed')
  } catch (cause) {
    throw new FinalizePipelineError('บันทึกผลตรวจไม่สำเร็จ กรุณาลองส่งผลอีกครั้งโดยไม่ต้องถ่ายภาพใหม่', examinationId, cause)
  }
  return thumbnails
}
'''
path.write_text(prefix + replacement)

# 3) UI should surface the actual retry-safe finalization phase.
replace_once(
    'src/App.tsx',
    """    } catch {
      setFinalizeError('บันทึกผลและเตรียมภาพสรุปไม่สำเร็จ กรุณาลองอีกครั้งโดยไม่ต้องถ่ายภาพใหม่')
    } finally {
""",
    """    } catch (caught) {
      setFinalizeError(caught instanceof Error && caught.message ? caught.message : 'บันทึกผลตรวจไม่สำเร็จ กรุณาลองอีกครั้งโดยไม่ต้องถ่ายภาพใหม่')
    } finally {
""",
    'finalize UI error',
)

# 4) Mobile/Safari dashboard containment from shell down to intrinsic-width children.
css_path = Path('src/legacy65925.css')
css = css_path.read_text()
css_marker = '/* Project-owner regression contract: mobile dashboard intrinsic-width containment. */'
if css_marker in css:
    raise RuntimeError('responsive contract already exists')
css += '''

/* Project-owner regression contract: mobile dashboard intrinsic-width containment. */
.app-shell { width: 100%; min-width: 0; max-width: 100%; overflow-x: clip; }
@media (max-width: 900px) {
  .app-column,
  .top-bar,
  .main-content,
  .mobile-nav {
    width: 100%;
    min-width: 0;
    max-width: 100%;
  }

  .admin-dashboard-page,
  .admin-dashboard-page .admin-stat-grid,
  .admin-dashboard-page .admin-grid,
  .admin-dashboard-page .admin-panel,
  .admin-dashboard-page .followup-list,
  .admin-dashboard-page .activity-chart,
  .admin-dashboard-page .chart-legend,
  .admin-dashboard-page .section-heading {
    min-width: 0;
    max-width: 100%;
  }

  .admin-dashboard-page .admin-stat-grid,
  .admin-dashboard-page .admin-grid,
  .admin-dashboard-page .admin-panel,
  .admin-dashboard-page .followup-list,
  .admin-dashboard-page .activity-chart {
    width: 100%;
  }

  .admin-dashboard-page .section-heading,
  .admin-dashboard-page .chart-legend { flex-wrap: wrap; }

  .admin-dashboard-page .section-heading > *,
  .admin-dashboard-page .chart-legend > *,
  .admin-dashboard-page .followup-list button,
  .admin-dashboard-page .followup-list button > div { min-width: 0; }

  .admin-dashboard-page .followup-list .status-pill {
    flex: 0 1 auto;
    max-width: 44%;
    white-space: normal;
    overflow-wrap: anywhere;
    text-align: center;
  }
}
'''
css_path.write_text(css)

# 5) Keep the live DB state-machine hotfix represented in source control.
Path('supabase/migrations/20260811100000_allow_optimized_examination_finalize.sql').write_text('''-- Optimized pipeline creates thumbnails before human review.\n-- Finalization may therefore move awaiting_review directly to confirmed.\ncreate or replace function private.validate_examination_status_transition()\nreturns trigger\nlanguage plpgsql\nset search_path to 'pg_catalog'\nas $$\nbegin\n  if new.status = old.status then\n    return new;\n  end if;\n\n  if (old.status = 'draft' and new.status in ('uploading', 'analysis_failed'))\n    or (old.status = 'uploading' and new.status in ('analyzing', 'analysis_failed'))\n    or (old.status = 'analyzing' and new.status in ('awaiting_review', 'analysis_failed'))\n    or (old.status = 'awaiting_review' and new.status in ('thumbnailing', 'confirmed', 'thumbnail_failed', 'analysis_failed'))\n    or (old.status = 'thumbnailing' and new.status in ('confirmed', 'thumbnail_failed'))\n    or (old.status = 'analysis_failed' and new.status = 'uploading')\n    or (old.status = 'thumbnail_failed' and new.status = 'thumbnailing') then\n    return new;\n  end if;\n\n  raise exception 'invalid examination status transition: % -> %', old.status, new.status using errcode = '22023';\nend;\n$$;\n''')

# 6) Regression tests.
Path('tests/auth_legacy_compat.test.ts').write_text('''import assert from 'node:assert/strict'\nimport { signInWithUsername } from '../backend/api/_lib/supabase.mjs'\n\nprocess.env.SUPABASE_URL = 'https://supabase.test'\nprocess.env.SUPABASE_SECRET_KEY = 'service-secret'\nprocess.env.SUPABASE_PUBLISHABLE_KEY = 'publishable-key'\n\nconst userId = '00000000-0000-4000-8000-000000000001'\nconst calls: Array<{ url: string; method: string; body?: unknown }> = []\nconst json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })\nconst originalFetch = globalThis.fetch\n\nglobalThis.fetch = async (input, init = {}) => {\n  const url = String(input)\n  const method = String(init.method || 'GET').toUpperCase()\n  let body: unknown\n  if (typeof init.body === 'string') {\n    try { body = JSON.parse(init.body) } catch { body = init.body }\n  }\n  calls.push({ url, method, body })\n\n  if (url.includes('/rest/v1/profiles?')) return json([{ user_id: userId, username: 'ADMIN_DMFC', display_name: 'ADMIN', date_of_birth: '1990-01-01', occupation: 'Admin', account_status: 'active' }])\n  if (url.endsWith('/rest/v1/rpc/verify_dmfc_pin')) return json(true)\n  if (url.includes('/auth/v1/token?grant_type=password')) {\n    const email = (body as { email?: string })?.email\n    if (email === 'admin_dmfc@dmfc.local') return json({ error: 'invalid credentials' }, 400)\n    if (email === 'admin@dmfc.local') return json({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600, user: { id: userId, email } })\n  }\n  if (url.endsWith(`/auth/v1/admin/users/${userId}`) && method === 'GET') return json({ id: userId, email: 'admin@dmfc.local' })\n  if (url.endsWith(`/auth/v1/admin/users/${userId}`) && method === 'PUT') return json({ id: userId, email: 'admin@dmfc.local' })\n  if (url.includes('/rest/v1/user_roles?')) return json([{ role: 'admin' }])\n  throw new Error(`Unexpected request: ${method} ${url}`)\n}\n\ntry {\n  const session = await signInWithUsername('ADMIN_DMFC', '1234')\n  assert.ok(session)\n  assert.equal(session.profile.username, 'ADMIN_DMFC')\n  assert.equal(session.profile.role, 'admin')\n  assert.ok(calls.some((call) => call.method === 'GET' && call.url.endsWith(`/auth/v1/admin/users/${userId}`)))\n  assert.ok(calls.some((call) => call.url.includes('/auth/v1/token') && (call.body as { email?: string })?.email === 'admin@dmfc.local'))\n} finally {\n  globalThis.fetch = originalFetch\n}\n\nconsole.log('Legacy auth compatibility tests passed')\n''')

finalize_test = Path('tests/finalize_workflow.test.ts')
finalize_text = finalize_test.read_text()
needle = "\nconsole.log('Finalize workflow tests passed')"
if needle not in finalize_text:
    raise RuntimeError('finalize test marker not found')
extra = '''\n\nconst persistenceFailureStatuses: string[] = []\nawait assert.rejects(() => finalizeExamination({\n  examinationId: 'EX-PERSISTENCE-FAIL',\n  images,\n  thumbnailService,\n  confirmedBy: 'doctor-1',\n  confirmedFindings: [{ diseaseId: 'D001', name: 'ผิวแห้ง', detected: true, severity: 'ปานกลาง', confidence: 90, comparison: 'คงที่' }],\n  precomputedThumbnails: precomputed,\n  repository: {\n    ...repository,\n    async updateStatus(_id, status) { persistenceFailureStatuses.push(status) },\n    async finalizeExamination() { throw new Error('database unavailable') },\n  },\n}), /บันทึกผลตรวจไม่สำเร็จ/)\nassert.deepEqual(persistenceFailureStatuses, [], 'persistence failure must not be mislabeled as thumbnail_failed')\n'''
finalize_test.write_text(finalize_text.replace(needle, extra + needle, 1))

Path('tests/responsive_contract.test.ts').write_text('''import assert from 'node:assert/strict'\nimport { readFileSync } from 'node:fs'\n\nconst css = readFileSync(new URL('../src/legacy65925.css', import.meta.url), 'utf8')\nfor (const required of [\n  'Project-owner regression contract: mobile dashboard intrinsic-width containment.',\n  '.admin-dashboard-page .admin-grid',\n  '.admin-dashboard-page .activity-chart',\n  '.admin-dashboard-page .followup-list .status-pill',\n  'overflow-wrap: anywhere',\n]) assert.ok(css.includes(required), `Missing responsive regression contract: ${required}`)\nconsole.log('Responsive contract tests passed')\n''')

package_path = Path('package.json')
package_text = package_path.read_text()
needle = '"test:ai": "node --experimental-strip-types tests/ai_validator.test.ts'
if needle not in package_text:
    raise RuntimeError('package test:ai marker not found')
package_text = package_text.replace(needle, '"test:ai": "node --experimental-strip-types tests/auth_legacy_compat.test.ts && node --experimental-strip-types tests/responsive_contract.test.ts && node --experimental-strip-types tests/ai_validator.test.ts', 1)
package_path.write_text(package_text)

Path('REGRESSION_CONTRACT.md').write_text('''# DM Foot Care Regression Contract\n\nBefore changing production behavior, evaluate the full dependency chain rather than the local symptom.\n\n## Invariants\n- Visible username is a product identifier. Never assume it equals the internal Supabase Auth email.\n- Original examination images remain in Google Drive only.\n- Supabase stores clinical/data records and private thumbnails, not original examination images.\n- AI-sized images are transient analysis inputs.\n- A persistence/finalization failure is not a thumbnail failure; retain a retryable examination state.\n- The optimized lifecycle may finalize `awaiting_review -> confirmed` because thumbnails are produced before human review.\n- Patient and Admin historical image viewing use thumbnails first; original Drive images are fetched only on explicit full-image open.\n- Mobile layouts must tolerate long Thai text, browser text scaling and intrinsic-width content without widening the app shell.\n- A Git commit is not released until the Production deployment SHA matches it and health/runtime checks pass.\n\n## Mandatory impact check\n1. Identity/Auth: username, Auth user id/email, role, account status, session restore and legacy accounts.\n2. State machine: current state, allowed next state, retry state, idempotency and failure classification.\n3. Storage: destination for original, thumbnail, metadata and temporary image data.\n4. API: caller count, authentication, duplicate work, retries and partial success.\n5. UI: phone, Safari, zoom/text scaling, long Thai strings, loading/empty/error states and touch targets.\n6. Data compatibility: existing production rows, old examinations and accounts created under earlier versions.\n7. Release: CI verify, migration/source parity, Production SHA, health, runtime errors and rollback point.\n''')

print('Regression patch applied')
