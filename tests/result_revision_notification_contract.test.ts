import assert from 'node:assert/strict'
import fs from 'node:fs'
import { canonicalizeReviewFindings, diffReviewFindings, hasMaterialReviewChange } from '../src/services/reviewRevision.ts'

const mild = { diseaseId: 'D001', name: 'A', severity: 'เล็กน้อย' as const }
const moderate = { diseaseId: 'D001', name: 'A', severity: 'ปานกลาง' as const }
const second = { diseaseId: 'D002', name: 'B', severity: 'รุนแรง' as const }

assert.equal(hasMaterialReviewChange([mild], [mild]), false, 'identical save is a no-op')
assert.equal(hasMaterialReviewChange([mild], [mild, second]), true, 'adding a finding is material')
assert.equal(diffReviewFindings([mild], [mild, second]).added[0]?.diseaseId, 'D002', 'add finding diff')
assert.equal(diffReviewFindings([mild, second], [mild]).removed[0]?.diseaseId, 'D002', 'remove finding diff')
assert.equal(diffReviewFindings([mild], [moderate]).changed[0]?.toSeverity, 'ปานกลาง', 'severity correction diff')
assert.deepEqual(canonicalizeReviewFindings([second, mild]).map((item) => item.diseaseId), ['D001', 'D002'], 'canonical ordering')

const migration = fs.readFileSync('supabase/migrations/20260913093000_result_revisions_notifications.sql', 'utf8')
assert.match(migration, /unique \(examination_id, revision_no\)/i, 'revision number unique per exam')
assert.match(migration, /unique \(examination_id, request_key\)/i, 'request idempotency unique')
assert.match(migration, /for update;/i, 'examination row lock prevents concurrent silent overwrite')
assert.match(migration, /STALE_REVISION:/, 'explicit stale revision conflict')
assert.match(migration, /if v_reviewed_findings = coalesce\(v_current_findings/, 'no-op detection in transaction')
assert.match(migration, /original_ai_findings jsonb not null/, 'AI snapshot preserved in immutable revision')
assert.doesNotMatch(migration, /update public\.ai_analysis_runs|delete from public\.ai_analysis_runs|update public\.ai_findings|delete from public\.ai_findings/i, 'AI source tables are never mutated')
assert.match(migration, /unique \(user_id, examination_id, result_revision_no, type\)/i, 'notification dedupe unique')
assert.match(migration, /insert into public\.user_notifications/, 'material revision creates durable notification')
assert.match(migration, /on conflict \(user_id, examination_id, result_revision_no, type\) do nothing/i, 'notification retry is idempotent')
assert.match(migration, /result_revisions_staff_select/, 'revision RLS is staff-only')
assert.match(migration, /user_notifications_select_own/, 'notification RLS is owner-scoped')
assert.match(migration, /revoke all on public\.result_revisions, public\.user_notifications from anon, authenticated/i, 'browser cannot mutate protected tables')
assert.match(migration, /role in \('doctor'::public\.app_role, 'admin'::public\.app_role\)/i, 'database mutation validates staff role')
assert.match(migration, /delete from public\.confirmed_findings[\s\S]*insert into public\.confirmed_findings[\s\S]*insert into public\.user_notifications/, 'projection and notification happen inside one RPC transaction')

const reviewApi = fs.readFileSync('backend/api/v1/admin/examination-review.mjs', 'utf8')
assert.match(reviewApi, /requireStaffUser/, 'review endpoint enforces server staff authorization')
assert.match(reviewApi, /expectedCurrentRevision/, 'review endpoint requires optimistic concurrency version')
assert.match(reviewApi, /requestId/, 'review endpoint carries idempotency request key')
assert.match(reviewApi, /409/, 'stale revisions become deterministic conflict response')
assert.doesNotMatch(reviewApi, /console\.(log|info)\([^)]*findings/i, 'review endpoint does not log patient findings')

const notificationsApi = fs.readFileSync('backend/api/v1/notifications.mjs', 'utf8')
assert.match(notificationsApi, /user_id=eq\.' \+ encodeURIComponent\(session\.user\.id\)/, 'notification reads are explicitly user-scoped')
assert.match(notificationsApi, /acknowledged_at=is\.null/, 'bootstrap only returns unread notifications')
assert.match(notificationsApi, /notificationId/, 'ack endpoint identifies one notification')
assert.match(notificationsApi, /idempotent: true/, 'repeat acknowledgement is idempotent')

const router = fs.readFileSync('api/[...route].mjs', 'utf8')
assert.match(router, /adminExaminationReview/, 'staff review route is wired')
assert.match(router, /v1\/notifications/, 'notification route is wired')

const history = fs.readFileSync('backend/api/_lib/history.mjs', 'utf8')
assert.match(history, /result_revisions/, 'patient history reads review metadata')
assert.match(history, /reviewed: true/, 'reviewed result is marked for patient UI')
assert.match(history, /confirmed_findings/, 'unreviewed examinations retain existing AI/final projection fallback')

const app = fs.readFileSync('src/App.tsx', 'utf8')
assert.match(app, /ผลตรวจเท้าของคุณมีการอัปเดต|notification\.title/, 'durable update banner is rendered from server notification')
assert.match(app, /ดูผลที่อัปเดต/, 'notification CTA exists')
assert.match(app, /openExaminationId/, 'CTA targets exact examination')
assert.match(app, /acknowledge\(notification\.id\)/, 'ack state is persisted server-side')
assert.match(app, /StaffReviewModal/, 'existing admin examination history opens review workspace')
assert.match(app, /ผลจาก AI ต้นฉบับ/, 'AI original result is separately labelled')
assert.match(app, /บันทึก Revision/, 'staff review save action exists')
assert.match(app, /disabled=\{saving \|\| !material\}/, 'duplicate/no-op submission is blocked in UI')
assert.match(app, /ข้อมูลที่แก้ไว้ยังอยู่/, 'recoverable save failure preserves draft')
assert.match(app, /role="status"/, 'notification surface exposes accessible status semantics')

console.log('result revision + durable notification contract: ok')
