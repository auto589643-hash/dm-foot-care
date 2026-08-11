import { readFileSync, writeFileSync } from 'node:fs'

function replaceRequired(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`Missing target: ${label}`)
  return source.replace(from, to)
}

// 1) Allow DELETE through the API CORS surface.
{
  const path = 'backend/api/_lib/http.mjs'
  let source = readFileSync(path, 'utf8')
  source = replaceRequired(source,
    "res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS')",
    "res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')",
    'CORS methods')
  writeFileSync(path, source)
}

// 2) Admin user endpoint: status updates plus safe pending-request deletion.
{
  const path = 'backend/api/v1/admin/user.mjs'
  const source = `import { handleOptions, readJsonBody, sendJson, setCors } from '../../_lib/http.mjs'\nimport { requireAdminUser, supabaseConfig, supabaseRest } from '../../_lib/supabase.mjs'\n\nconst USERNAME_PATTERN = /^[A-Z0-9_-]{3,32}$/\nconst PIN_PATTERN = /^\\d{4}$/\nconst ACCOUNT_STATUSES = new Set(['pending', 'active', 'inactive'])\n\nfunction badRequest(message) {\n  const error = new Error(message)\n  error.status = 400\n  return error\n}\n\nfunction httpError(status, message) {\n  const error = new Error(message)\n  error.status = status\n  return error\n}\n\nfunction validateDate(value) {\n  const date = new Date(\`${'${value}'}T00:00:00Z\`)\n  return /^\\d{4}-\\d{2}-\\d{2}$/.test(value) && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && date <= new Date()\n}\n\nasync function updateUser(userId, body, action) {\n  if (action === 'status') {\n    const status = String(body.status || '')\n    if (!ACCOUNT_STATUSES.has(status)) throw badRequest('สถานะผู้ใช้ไม่ถูกต้อง')\n    const profiles = await supabaseRest(\`/rest/v1/profiles?user_id=eq.${'${encodeURIComponent(userId)}'}\`, {\n      method: 'PATCH',\n      headers: { Prefer: 'return=representation' },\n      body: JSON.stringify({ account_status: status, updated_at: new Date().toISOString() }),\n    })\n    if (!profiles[0]) throw httpError(404, 'ไม่พบบัญชีผู้ใช้')\n    return { status }\n  }\n\n  const patch = {}\n  if ('username' in body) {\n    const username = String(body.username || '').trim().toUpperCase()\n    if (!USERNAME_PATTERN.test(username)) throw badRequest('Username ไม่ถูกต้อง')\n    patch.username = username\n  }\n  if ('name' in body) {\n    const displayName = String(body.name || '').trim()\n    if (!displayName || displayName.length > 160) throw badRequest('ชื่อ-นามสกุลไม่ถูกต้อง')\n    patch.display_name = displayName\n  }\n  if ('dateOfBirth' in body) {\n    const dateOfBirth = String(body.dateOfBirth || '').trim()\n    if (!validateDate(dateOfBirth)) throw badRequest('วันเดือนปีเกิดไม่ถูกต้อง')\n    patch.date_of_birth = dateOfBirth\n  }\n  if ('occupation' in body) {\n    const occupation = String(body.occupation || '').trim()\n    if (!occupation || occupation.length > 160) throw badRequest('อาชีพไม่ถูกต้อง')\n    patch.occupation = occupation\n  }\n  if ('status' in body) {\n    const status = String(body.status || '')\n    if (!ACCOUNT_STATUSES.has(status)) throw badRequest('สถานะผู้ใช้ไม่ถูกต้อง')\n    patch.account_status = status\n  }\n  if (body.pin) {\n    const pin = String(body.pin)\n    if (!PIN_PATTERN.test(pin)) throw badRequest('PIN ต้องเป็นตัวเลข 4 หลัก')\n    patch.pin_hash = await supabaseRest('/rest/v1/rpc/hash_dmfc_pin', { method: 'POST', body: JSON.stringify({ p_pin: pin }) })\n  }\n  patch.updated_at = new Date().toISOString()\n  const profiles = await supabaseRest(\`/rest/v1/profiles?user_id=eq.${'${encodeURIComponent(userId)}'}\`, {\n    method: 'PATCH',\n    headers: { Prefer: 'return=representation' },\n    body: JSON.stringify(patch),\n  })\n  if (!profiles[0]) throw httpError(404, 'ไม่พบบัญชีผู้ใช้')\n  return profiles[0]\n}\n\nasync function deletePendingUser(userId) {\n  const profiles = await supabaseRest(\`/rest/v1/profiles?select=user_id,username,account_status&user_id=eq.${'${encodeURIComponent(userId)}'}&limit=1\`)\n  const profile = profiles[0]\n  if (!profile) throw httpError(404, 'ไม่พบบัญชีผู้ใช้')\n  if (profile.account_status !== 'pending') throw httpError(409, 'ลบได้เฉพาะคำขอที่ยังรออนุมัติเท่านั้น')\n\n  const examinations = await supabaseRest(\`/rest/v1/examinations?select=id&user_id=eq.${'${encodeURIComponent(userId)}'}&limit=1\`)\n  if (examinations.length) throw httpError(409, 'บัญชีนี้มีประวัติการตรวจแล้ว จึงไม่สามารถลบคำขอได้')\n\n  const { url, serviceKey } = supabaseConfig()\n  const response = await fetch(\`${'${url}'}/auth/v1/admin/users/${'${encodeURIComponent(userId)}'}\`, {\n    method: 'DELETE',\n    headers: { apikey: serviceKey, authorization: \`Bearer ${'${serviceKey}'}\` },\n  })\n  if (!response.ok) {\n    const payload = await response.json().catch(() => null)\n    throw httpError(response.status, payload?.msg || payload?.message || 'ไม่สามารถลบบัญชีออกจากระบบยืนยันตัวตนได้')\n  }\n  return { username: profile.username }\n}\n\nexport default async function handler(req, res) {\n  if (handleOptions(req, res)) return\n  setCors(res)\n  try {\n    const session = await requireAdminUser(req, res)\n    if (!session) return\n    const userId = String(req.query?.userId || '')\n    if (!userId) return sendJson(res, 400, { message: 'ไม่พบรหัสผู้ใช้' })\n\n    if (req.method === 'DELETE') {\n      const result = await deletePendingUser(userId)\n      return sendJson(res, 200, { ok: true, result })\n    }\n    if (req.method !== 'PATCH') return sendJson(res, 405, { message: 'Method not allowed' })\n\n    const result = await updateUser(userId, await readJsonBody(req), String(req.query?.action || ''))\n    return sendJson(res, 200, { ok: true, result })\n  } catch (error) {\n    const status = Number.isInteger(error.status) ? error.status : 500\n    if (status >= 500) console.error('admin user operation failed', error)\n    const fallback = req.method === 'DELETE' ? 'ไม่สามารถลบคำขอผู้ใช้งานได้' : 'ไม่สามารถแก้ไขบัญชีผู้ใช้ได้'\n    return sendJson(res, status, { message: status >= 500 ? fallback : error.message })\n  }\n}\n`
  writeFileSync(path, source)
}

// 3) Dashboard must only use approved active users. Pending/inactive users are excluded from all metrics and recent activity.
{
  const path = 'backend/api/v1/admin/dashboard.mjs'
  let source = readFileSync(path, 'utf8')
  source = replaceRequired(source,
`    const patientIds = new Set(roles.filter((item) => item.role === 'user' || item.role === 'patient').map((item) => item.user_id))
    const users = profiles.filter((profile) => patientIds.has(profile.user_id))
    const userById = new Map(users.map((user) => [user.user_id, user]))
    const confirmed = examinations.filter((exam) => patientIds.has(exam.user_id) && exam.status === 'confirmed')`,
`    const patientIds = new Set(roles.filter((item) => item.role === 'user' || item.role === 'patient').map((item) => item.user_id))
    const users = profiles.filter((profile) => patientIds.has(profile.user_id) && profile.account_status === 'active')
    const activeUserIds = new Set(users.map((user) => user.user_id))
    const userById = new Map(users.map((user) => [user.user_id, user]))
    const confirmed = examinations.filter((exam) => activeUserIds.has(exam.user_id) && exam.status === 'confirmed')`,
    'dashboard active users')
  source = replaceRequired(source,
    "    for (const user of users.filter((item) => item.account_status === 'active')) {",
    "    for (const user of users) {",
    'dashboard followups active filter')
  source = replaceRequired(source,
    "      activeUsers: users.filter((user) => user.account_status === 'active').length,\n      totalUsers: users.length,",
    "      activeUsers: users.length,\n      totalUsers: users.length,",
    'dashboard counts')
  writeFileSync(path, source)
}

// 4) Browser contract and transport for deleting pending registrations.
{
  const path = 'src/services/contracts.ts'
  let source = readFileSync(path, 'utf8')
  source = replaceRequired(source,
    "  setUserStatus(userId: string, status: UserRecord['status']): Promise<void>\n  resetUserPin(userId: string): Promise<void>",
    "  setUserStatus(userId: string, status: UserRecord['status']): Promise<void>\n  deletePendingUser(userId: string): Promise<void>\n  resetUserPin(userId: string): Promise<void>",
    'AdminService deletePendingUser')
  writeFileSync(path, source)
}

{
  const path = 'src/services/httpAdapters.ts'
  let source = readFileSync(path, 'utf8')
  source = replaceRequired(source,
`  async patchJson<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PATCH', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
  }
`,
`  async patchJson<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PATCH', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' })
  }
`,
    'BackendHttpClient delete')
  source = replaceRequired(source,
`  async setUserStatus(userId: string, status: import('../types.ts').UserRecord['status']): Promise<void> {
    await this.client.patchJson(\`/v1/admin/users/${'${encodeURIComponent(userId)}'}/status\`, { status })
  }

  async resetUserPin(userId: string): Promise<void> {`,
`  async setUserStatus(userId: string, status: import('../types.ts').UserRecord['status']): Promise<void> {
    await this.client.patchJson(\`/v1/admin/users/${'${encodeURIComponent(userId)}'}/status\`, { status })
  }

  async deletePendingUser(userId: string): Promise<void> {
    await this.client.delete(\`/v1/admin/users/${'${encodeURIComponent(userId)}'}\`)
  }

  async resetUserPin(userId: string): Promise<void> {`,
    'HttpAdminService deletePendingUser')
  writeFileSync(path, source)
}

// 5) User management UI: Active / Pending / Trash with confirmation and optimistic rollback.
{
  const path = 'src/App.tsx'
  let source = readFileSync(path, 'utf8')
  source = source.replace('  MoreHorizontal,\n', '')
  source = replaceRequired(source,
    `if (page === 'users') return <UserManagement users={userRecords} diseaseRecords={diseaseRecords} setUsers={setUserRecords} showToast={showToast} adminService={adminService} auditLogger={auditLogger} />`,
    `if (page === 'users') return <UserManagement users={userRecords} diseaseRecords={diseaseRecords} setUsers={setUserRecords} showToast={showToast} adminService={adminService} auditLogger={auditLogger} onUsersChanged={() => { void adminService.getDashboard().then(setDashboard).catch(() => {}) }} />`,
    'UserManagement dashboard refresh')

  const start = source.indexOf('function UserManagement(')
  const end = source.indexOf('\nfunction UserHistoryModal(', start)
  if (start < 0 || end < 0) throw new Error('Unable to locate UserManagement block')

  const block = `function UserManagement({ users, diseaseRecords, setUsers, showToast, adminService, auditLogger, onUsersChanged }: { users: UserRecord[]; diseaseRecords: Disease[]; setUsers: React.Dispatch<React.SetStateAction<UserRecord[]>>; showToast: (text: string) => void; adminService: AdminService; auditLogger?: AuditLogger; onUsersChanged: () => void }) {
  type UserView = 'active' | 'pending' | 'trash'
  type ConfirmAction = { kind: 'deactivate' | 'delete-request'; user: UserRecord }
  const [query, setQuery] = useState('')
  const [view, setView] = useState<UserView>('active')
  const [editing, setEditing] = useState<UserRecord | null>(null)
  const [creating, setCreating] = useState(false)
  const [historyUser, setHistoryUser] = useState<UserRecord | null>(null)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [pendingUserIds, setPendingUserIds] = useState<Set<string>>(() => new Set())

  const activeCount = users.filter((user) => user.status === 'active').length
  const pendingCount = users.filter((user) => user.status === 'pending').length
  const trashCount = users.filter((user) => user.status === 'inactive').length
  const viewStatus: Record<UserView, UserRecord['status']> = { active: 'active', pending: 'pending', trash: 'inactive' }
  const filtered = users
    .filter((user) => user.status === viewStatus[view])
    .filter((user) => \`${'${user.name} ${user.username}'}\`.toLowerCase().includes(query.toLowerCase()))
    .sort((left, right) => left.username.localeCompare(right.username))

  const markPending = (id: string, pending: boolean) => setPendingUserIds((current) => {
    const next = new Set(current)
    if (pending) next.add(id); else next.delete(id)
    return next
  })

  const changeStatus = (user: UserRecord, nextStatus: UserRecord['status'], successMessage: string) => {
    if (pendingUserIds.has(user.id)) return
    const previousStatus = user.status
    setUsers((current) => current.map((item) => item.id === user.id ? { ...item, status: nextStatus } : item))
    markPending(user.id, true)
    void adminService.setUserStatus(user.id, nextStatus).then(() => {
      void auditLogger?.append({ actorId: null, eventType: 'user_updated', entityType: 'user', entityId: user.id, payload: { action: 'status_changed', from: previousStatus, status: nextStatus } }).catch(() => {})
      showToast(successMessage)
      onUsersChanged()
    }).catch(() => {
      setUsers((current) => current.map((item) => item.id === user.id ? { ...item, status: previousStatus } : item))
      showToast('เปลี่ยนสถานะผู้ใช้ไม่สำเร็จ ระบบคืนสถานะเดิมแล้ว')
    }).finally(() => markPending(user.id, false))
  }

  const deletePendingRequest = (user: UserRecord) => {
    if (pendingUserIds.has(user.id)) return
    setUsers((current) => current.filter((item) => item.id !== user.id))
    markPending(user.id, true)
    void adminService.deletePendingUser(user.id).then(() => {
      void auditLogger?.append({ actorId: null, eventType: 'user_updated', entityType: 'user', entityId: user.id, payload: { action: 'registration_request_deleted', username: user.username } }).catch(() => {})
      showToast(\`ลบคำขอ ${'${user.username}'} แล้ว · Username นี้สมัครใหม่ได้\`)
      onUsersChanged()
    }).catch((error) => {
      setUsers((current) => current.some((item) => item.id === user.id) ? current : [...current, user])
      showToast(error instanceof Error && error.message ? error.message : 'ลบคำขอไม่สำเร็จ ระบบคืนรายการแล้ว')
    }).finally(() => markPending(user.id, false))
  }

  const runConfirmedAction = () => {
    const action = confirmAction
    if (!action) return
    setConfirmAction(null)
    if (action.kind === 'deactivate') {
      changeStatus(action.user, 'inactive', \`ปิดใช้งาน ${'${action.user.username}'} แล้ว · ย้ายไปถังขยะ\`)
    } else {
      deletePendingRequest(action.user)
    }
  }

  const closeForm = () => { setEditing(null); setCreating(false) }
  const saveUser = async (draft: UserFormDraft) => {
    try {
      const saved = await adminService.saveUser(editing ? { ...draft, id: editing.id } : draft)
      setUsers((current) => editing ? current.map((user) => user.id === editing.id ? saved : user) : [...current, saved])
      void auditLogger?.append({ actorId: null, eventType: editing ? 'user_updated' : 'user_created', entityType: 'user', entityId: saved.id, payload: { username: saved.username, status: saved.status } }).catch(() => {})
      showToast(\`${'${editing ? \'บันทึกข้อมูล\' : \'เพิ่มผู้ใช้\'}'} ${'${saved.username}'} แล้ว\`)
      onUsersChanged()
      closeForm()
    } catch (error) {
      showToast(error instanceof Error && error.message ? error.message : 'บันทึกข้อมูลผู้ใช้ไม่สำเร็จ')
    }
  }

  const emptyCopy = view === 'active'
    ? ['ยังไม่มีผู้ใช้งานที่เปิดใช้งาน', 'บัญชีที่ได้รับอนุมัติจะแสดงในรายการนี้']
    : view === 'pending'
      ? ['ไม่มีคำขอรออนุมัติ', 'คำขอลงทะเบียนใหม่จะแสดงในส่วนนี้']
      : ['ถังขยะว่าง', 'บัญชีที่ปิดใช้งานจะถูกแยกมาเก็บที่นี่']

  return <div className="page admin-page"><PageTitle eyebrow="จัดการบัญชี" title="ผู้ใช้งาน" description="แยกบัญชีที่ใช้งาน คำขอรออนุมัติ และบัญชีที่ปิดใช้งานออกจากกัน" action={pendingCount ? <span className="pending-count"><Clock3 size={18} />รออนุมัติ {pendingCount} บัญชี</span> : undefined} />
    <div className="user-state-tabs" role="tablist" aria-label="สถานะผู้ใช้งาน">
      <button type="button" role="tab" aria-selected={view === 'active'} className={view === 'active' ? 'active' : ''} onClick={() => setView('active')}>ใช้งานอยู่ <span>{activeCount}</span></button>
      <button type="button" role="tab" aria-selected={view === 'pending'} className={view === 'pending' ? 'active' : ''} onClick={() => setView('pending')}>รออนุมัติ <span>{pendingCount}</span></button>
      <button type="button" role="tab" aria-selected={view === 'trash'} className={view === 'trash' ? 'active' : ''} onClick={() => setView('trash')}>ถังขยะ <span>{trashCount}</span></button>
    </div>
    <div className="management-toolbar"><label className="search-field"><Search size={20} /><input aria-label="ค้นหาผู้ใช้งาน" placeholder="ค้นหาชื่อหรือ Username" value={query} onChange={(event) => setQuery(event.target.value)} /></label><span>{view === 'active' ? 'ใช้งานอยู่' : view === 'pending' ? 'รออนุมัติ' : 'ปิดใช้งาน'} {filtered.length} คน</span></div>
    {filtered.length ? <div className="management-list">{filtered.map((user) => <article className={view === 'pending' ? 'pending-user' : view === 'trash' ? 'trash-user' : ''} key={user.id} data-pending={pendingUserIds.has(user.id) ? 'true' : undefined}>
      <div className="table-user"><span className="avatar">{user.name.slice(0,2)}</span><div><strong>{user.name}</strong><small>{user.username} · อายุ {calculateAge(user.dateOfBirth)} ปี · {calculateGeneration(user.dateOfBirth)} · {user.occupation}</small></div></div>
      <div className="record-meta"><span>ตรวจล่าสุด</span><strong>{user.lastExam}</strong></div>
      <span className={view === 'pending' ? 'status-pill attention' : view === 'trash' ? 'status-pill muted' : 'status-pill success'}>{view === 'pending' ? 'รออนุมัติ' : view === 'trash' ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}</span>
      <div className="row-actions">
        {view === 'pending' ? <><button className="button button-primary button-small approve-user-button" type="button" disabled={pendingUserIds.has(user.id)} onClick={() => changeStatus(user, 'active', \`อนุมัติ ${'${user.username}'} แล้ว\`)}><Check size={17} />อนุมัติ</button><button className="button button-danger-outline button-small" type="button" disabled={pendingUserIds.has(user.id)} onClick={() => setConfirmAction({ kind: 'delete-request', user })}>ลบคำขอ</button></> : null}
        {view === 'active' ? <><button className="button button-secondary button-small" type="button" onClick={() => { setCreating(false); setEditing(user) }}>แก้ไข</button><button className="button button-ghost button-small" type="button" onClick={() => setHistoryUser(user)}>ดูประวัติ</button><button className="button button-danger-outline button-small" type="button" disabled={pendingUserIds.has(user.id)} onClick={() => setConfirmAction({ kind: 'deactivate', user })}>ปิดใช้งาน</button></> : null}
        {view === 'trash' ? <><button className="button button-secondary button-small" type="button" disabled={pendingUserIds.has(user.id)} onClick={() => changeStatus(user, 'active', \`คืนสถานะ ${'${user.username}'} แล้ว\`)}><RotateCcw size={16} />คืนสถานะ</button><button className="button button-ghost button-small" type="button" onClick={() => setHistoryUser(user)}>ดูประวัติ</button></> : null}
      </div>
    </article>)}</div> : <div className="empty-state user-list-empty"><Users size={30} /><h2>{emptyCopy[0]}</h2><p>{emptyCopy[1]}</p></div>}
    {creating || editing ? <UserFormModal user={editing} onClose={closeForm} onSave={saveUser} /> : null}
    {historyUser ? <UserHistoryModal user={historyUser} diseaseRecords={diseaseRecords} adminService={adminService} onClose={() => setHistoryUser(null)} /> : null}
    {confirmAction ? <UserActionConfirmModal action={confirmAction} onCancel={() => setConfirmAction(null)} onConfirm={runConfirmedAction} /> : null}
  </div>
}

function UserActionConfirmModal({ action, onCancel, onConfirm }: { action: { kind: 'deactivate' | 'delete-request'; user: UserRecord }; onCancel: () => void; onConfirm: () => void }) {
  const deleting = action.kind === 'delete-request'
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}><section className="detail-modal user-action-confirm" role="alertdialog" aria-modal="true" aria-labelledby="user-action-title" aria-describedby="user-action-description"><header><div><span className="eyebrow">ยืนยันการทำรายการ</span><h2 id="user-action-title">{deleting ? 'ลบคำขอลงทะเบียน?' : 'ปิดใช้งานบัญชี?'}</h2></div><button className="icon-button" type="button" aria-label="ยกเลิก" onClick={onCancel}><X size={21} /></button></header><div className="confirm-user"><span className="avatar">{action.user.name.slice(0,2)}</span><div><strong>{action.user.name}</strong><small>{action.user.username}</small></div></div><div id="user-action-description" className={deleting ? 'confirmation-note danger' : 'confirmation-note'}>{deleting ? <><strong>คำขอนี้จะถูกลบออกจากระบบ</strong><p>Profile และบัญชี Supabase Auth จะถูกลบ ทำให้ Username <b>{action.user.username}</b> สามารถใช้สมัครใหม่ได้ การทำรายการนี้ใช้ได้เฉพาะบัญชีที่ยังรออนุมัติและไม่มีประวัติการตรวจ</p></> : <><strong>บัญชีจะถูกย้ายไปถังขยะ</strong><p>User จะเข้าสู่ระบบไม่ได้ และจะไม่แสดงใน Dashboard หรือรายการผู้ใช้งานปกติ ข้อมูลและประวัติเดิมยังคงเก็บไว้และสามารถคืนสถานะภายหลังได้</p></>}</div><div className="confirm-actions"><button className="button button-secondary" type="button" onClick={onCancel}>ยกเลิก</button><button className="button button-danger" type="button" onClick={onConfirm}>{deleting ? 'ยืนยันลบคำขอ' : 'ยืนยันปิดใช้งาน'}</button></div></section></div>
}
`
  source = source.slice(0, start) + block + source.slice(end)
  writeFileSync(path, source)
}

// 6) Final UI layer for status tabs, trash, and destructive confirmation.
{
  const path = 'src/legacy65925.css'
  let source = readFileSync(path, 'utf8')
  const marker = '/* Admin user lifecycle */'
  if (!source.includes(marker)) source += `\n\n${marker}\n.user-state-tabs {\n  display: flex;\n  gap: 8px;\n  margin: -6px 0 18px;\n  padding: 5px;\n  width: fit-content;\n  max-width: 100%;\n  overflow-x: auto;\n  border: 1px solid var(--line);\n  border-radius: 14px;\n  background: #fff;\n}\n.user-state-tabs button {\n  min-height: 42px;\n  padding: 8px 13px;\n  border: 0;\n  border-radius: 10px;\n  color: var(--muted);\n  background: transparent;\n  font-weight: 700;\n  white-space: nowrap;\n}\n.user-state-tabs button span {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  min-width: 23px;\n  height: 23px;\n  margin-left: 6px;\n  padding: 0 6px;\n  border-radius: 999px;\n  color: #52647a;\n  background: #edf2f7;\n  font-size: 12px;\n}\n.user-state-tabs button.active { color: #174bb8; background: #eaf2ff; }\n.user-state-tabs button.active span { color: #174bb8; background: #d7e7ff; }\n.management-list > article.trash-user { border-style: dashed; background: #fafbfd; }\n.button-danger-outline { color: #b4232f; border: 1px solid #efb5bb; background: #fff; }\n.button-danger-outline:hover { border-color: #d92d3a; background: #fff5f6; }\n.button-danger { color: #fff; background: #c73535; }\n.button-danger:hover { background: #a9252e; }\n.user-action-confirm { width: min(92vw, 520px); }\n.confirm-user { display: flex; align-items: center; gap: 12px; padding: 4px 0 16px; }\n.confirm-user > div { display: flex; flex-direction: column; }\n.confirm-user small { color: var(--muted); }\n.confirmation-note { padding: 15px 16px; border: 1px solid #d8e5f5; border-radius: 13px; color: #465b73; background: #f4f8fd; }\n.confirmation-note.danger { border-color: #efc5c9; color: #7f2630; background: #fff5f6; }\n.confirmation-note strong { display: block; margin-bottom: 5px; color: var(--ink); }\n.confirmation-note.danger strong { color: #9f1f2a; }\n.confirmation-note p { margin: 0; line-height: 1.65; }\n.confirm-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 20px; }\n.user-list-empty { margin-top: 14px; }\n@media (max-width: 600px) {\n  .user-state-tabs { width: 100%; }\n  .user-state-tabs button { flex: 1 0 auto; }\n  .confirm-actions { grid-template-columns: 1fr; }\n  .confirm-actions .button { width: 100%; min-height: 52px; }\n}\n`
  writeFileSync(path, source)
}

// 7) Adapter coverage for DELETE.
{
  const path = 'tests/http_adapters.test.ts'
  let source = readFileSync(path, 'utf8')
  source = replaceRequired(source,
    "await admin.setUserStatus('u1', 'inactive')\nawait admin.resetUserPin('u1')",
    "await admin.setUserStatus('u1', 'inactive')\nawait admin.deletePendingUser('u1')\nassert.equal(calls.at(-1)?.init.method, 'DELETE')\nawait admin.resetUserPin('u1')",
    'HTTP admin delete test')
  writeFileSync(path, source)
}

console.log('Admin user lifecycle patch applied')
