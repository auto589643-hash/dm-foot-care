from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, found {count}')
    return text.replace(old, new, 1)


def regex_once(text: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 regex match, found {count}')
    return updated


# 1) Dashboard data contract: expose complete, newest-first confirmed history.
types_path = Path('src/types.ts')
types = types_path.read_text()
types = replace_once(
    types,
    "  recentExaminations: AdminDashboardRecentExam[]\n}",
    "  recentExaminations: AdminDashboardRecentExam[]\n  allExaminations?: AdminDashboardRecentExam[]\n}",
    'dashboard type',
)
types_path.write_text(types)

dashboard_path = Path('backend/api/v1/admin/dashboard.mjs')
dashboard = dashboard_path.read_text()
dashboard = regex_once(
    dashboard,
    r"    const recentExaminations = confirmed\.slice\(0, 5\)\.map\(\(exam\) => \{.*?\n    \}\)\n\n    const usersWithHistory",
    """    const orderedConfirmed = [...confirmed].sort((left, right) => {
      const rightTime = new Date(timestamp(right) || 0).getTime()
      const leftTime = new Date(timestamp(left) || 0).getTime()
      return rightTime - leftTime
    })
    const allExaminations = orderedConfirmed.map((exam) => {
      const user = userById.get(exam.user_id)
      const examFindings = findingsByExam.get(exam.id) || []
      const severe = examFindings.some((finding) => finding.severity_label_snapshot === 'รุนแรง')
      return {
        examinationId: exam.id,
        userId: exam.user_id,
        username: user?.username || '—',
        name: user?.display_name || user?.username || 'ไม่พบชื่อผู้ใช้',
        displayDate: thaiDate(timestamp(exam)),
        findings: [...new Set(examFindings.map((finding) => finding.disease_name_snapshot))],
        status: severe ? 'danger' : examFindings.length ? 'attention' : 'success',
      }
    })
    const recentExaminations = allExaminations.slice(0, 5)

    const usersWithHistory""",
    'dashboard complete history',
)
dashboard = replace_once(dashboard, '    const latestExam = confirmed[0]', '    const latestExam = orderedConfirmed[0]', 'dashboard latest exam')
dashboard = replace_once(dashboard, '      recentExaminations,\n    })', '      recentExaminations,\n      allExaminations,\n    })', 'dashboard response')
dashboard_path.write_text(dashboard)

bootstrap_path = Path('backend/api/v1/admin/bootstrap.mjs')
bootstrap = bootstrap_path.read_text()
bootstrap = regex_once(
    bootstrap,
    r"  const recentExaminations = confirmed\.slice\(0, 5\)\.map\(\(exam\) => \{.*?\n  \}\)\n  const usersWithHistory",
    """  const orderedConfirmed = [...confirmed].sort((left, right) => {
    const rightTime = new Date(timestamp(right) || 0).getTime()
    const leftTime = new Date(timestamp(left) || 0).getTime()
    return rightTime - leftTime
  })
  const allExaminations = orderedConfirmed.map((exam) => {
    const user = userById.get(exam.user_id); const examFindings = findingsByExam.get(exam.id) || []; const severe = examFindings.some((finding) => finding.severity_label_snapshot === 'รุนแรง')
    return { examinationId: exam.id, userId: exam.user_id, username: user?.username || '—', name: user?.display_name || user?.username || 'ไม่พบชื่อผู้ใช้', displayDate: thaiDate(timestamp(exam)), findings: [...new Set(examFindings.map((finding) => finding.disease_name_snapshot))], status: severe ? 'danger' : examFindings.length ? 'attention' : 'success' }
  })
  const recentExaminations = allExaminations.slice(0, 5)
  const usersWithHistory""",
    'bootstrap complete history',
)
bootstrap = replace_once(bootstrap, '  const latestExam = confirmed[0]', '  const latestExam = orderedConfirmed[0]', 'bootstrap latest exam')
bootstrap = replace_once(bootstrap, 'followups: followups.slice(0, 8), recentExaminations }', 'followups: followups.slice(0, 8), recentExaminations, allExaminations }', 'bootstrap response')
bootstrap_path.write_text(bootstrap)

# 2) Admin dashboard: turn the existing CTA into a true all-history view.
app_path = Path('src/App.tsx')
app = app_path.read_text()
doctor_home = """function DoctorHome({ onNavigate, users, diseaseRecords, adminService, dashboard }: { onNavigate: (page: Page) => void; users: UserRecord[]; diseaseRecords: Disease[]; adminService: AdminService; dashboard: AdminDashboard | null }) {
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  if (!dashboard) return <div className=\"page admin-page admin-dashboard-page\"><PageTitle eyebrow=\"Admin workspace\" title=\"ภาพรวมการดูแล\" description=\"กำลังโหลดข้อมูลจากระบบ\" /><div className=\"empty-state\"><Clock3 size={32} /><h2>กำลังเตรียมข้อมูลภาพรวม</h2><p>ตัวเลขทั้งหมดจะคำนวณจากข้อมูลจริงในระบบ</p></div></div>
  const maxActivity = Math.max(1, ...dashboard.activityLast7Days.map((day) => day.count))
  const allExaminations = dashboard.allExaminations ?? dashboard.recentExaminations
  const openUser = (userId: string) => setSelectedUser(users.find((user) => user.id === userId) ?? null)
  return <div className=\"page admin-page admin-dashboard-page\"><PageTitle eyebrow=\"Admin workspace\" title=\"ภาพรวมการดูแล\" description=\"ภาพรวมจากข้อมูลผู้ใช้งานและผลตรวจจริง\" action={<button className=\"button button-primary\" type=\"button\" onClick={() => onNavigate('users')}><Plus size={18} />เพิ่มผู้ใช้งาน</button>} /><div className=\"admin-stat-grid\"><AdminStat icon={Users} label=\"ผู้ใช้งาน Active\" value={String(dashboard.activeUsers)} note={`จากทั้งหมด ${dashboard.totalUsers} คน`} tone=\"blue\" /><AdminStat icon={ClipboardCheck} label=\"มีประวัติการตรวจ\" value={String(dashboard.usersWithHistory)} note=\"คำนวณจากผลตรวจที่ยืนยันแล้ว\" tone=\"teal\" /><AdminStat icon={AlertTriangle} label=\"ควรติดตาม\" value={String(dashboard.followupCount)} note={`มีระดับรุนแรง ${dashboard.severeCount} คน`} tone=\"amber\" /><AdminStat icon={Activity} label=\"ตรวจล่าสุด\" value={dashboard.latestExam?.displayDate ?? '—'} note={dashboard.latestExam?.username ?? 'ยังไม่มีข้อมูล'} tone=\"blue\" /></div><div className=\"admin-grid\"><section className=\"admin-panel\"><div className=\"section-heading\"><div><span className=\"eyebrow\">ต้องตรวจสอบ</span><h2>ผู้ใช้ที่ควรติดตาม</h2></div><button className=\"text-link\" type=\"button\" onClick={() => onNavigate('users')}>ดูทั้งหมด</button></div><div className=\"followup-list\">{dashboard.followups.length ? dashboard.followups.map((item) => <FollowupRow key={item.userId} initials={item.name.slice(0,2)} name={item.name} code={item.username} issue={item.issue} time={item.time} severe={item.severe} onClick={() => openUser(item.userId)} />) : <div className=\"calendar-empty\"><CircleCheck size={22} /><p>ยังไม่มีผู้ใช้ที่เข้าเกณฑ์ติดตาม</p></div>}</div></section><section className=\"admin-panel\"><div className=\"section-heading\"><div><span className=\"eyebrow\">7 วันที่ผ่านมา</span><h2>กิจกรรมการตรวจ</h2></div><span className=\"status-pill success\"><TrendingUp size={15} />{dashboard.completedLast7Days} ครั้ง</span></div><div className=\"activity-chart\">{dashboard.activityLast7Days.map((day) => <div key={day.key}><span style={{ height: `${Math.max(8, (day.count / maxActivity) * 100)}%`, opacity: day.count ? 1 : .25 }} /><small>{day.label}</small></div>)}</div><div className=\"chart-legend\"><span><i />การตรวจที่ยืนยันแล้ว</span><strong>เฉลี่ย {dashboard.averagePerDay} ครั้ง/วัน</strong></div></section></div><section className=\"admin-panel recent-panel\"><div className=\"section-heading\"><div><span className=\"eyebrow\">กิจกรรมล่าสุด</span><h2>การตรวจล่าสุด</h2></div><button className=\"text-link\" type=\"button\" onClick={() => setHistoryOpen(true)}><History size={17} />ดูประวัติทั้งหมด</button></div><AdminTable rows={dashboard.recentExaminations} onSelect={(row) => openUser(row.userId)} /></section>{historyOpen ? <AdminAllHistoryModal rows={allExaminations} onClose={() => setHistoryOpen(false)} onSelect={(row) => { setHistoryOpen(false); openUser(row.userId) }} /> : null}{selectedUser ? <UserHistoryModal user={selectedUser} diseaseRecords={diseaseRecords} adminService={adminService} onClose={() => setSelectedUser(null)} /> : null}</div>
}

function AdminAllHistoryModal({ rows, onClose, onSelect }: { rows: AdminDashboardRecentExam[]; onClose: () => void; onSelect: (row: AdminDashboardRecentExam) => void }) {
  return <div className=\"modal-backdrop admin-history-backdrop\" role=\"presentation\" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className=\"detail-modal admin-history-modal\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"admin-history-title\"><header><div><span className=\"eyebrow\">ผลตรวจที่ยืนยันแล้ว</span><h2 id=\"admin-history-title\">ประวัติการตรวจทั้งหมด</h2></div><button className=\"icon-button\" type=\"button\" aria-label=\"ปิด\" onClick={onClose}><X size={21} /></button></header><div className=\"admin-history-summary\"><History size={20} /><div><strong>{rows.length} รายการ</strong><span>เรียงจากใหม่ไปเก่า</span></div></div>{rows.length ? <div className=\"admin-history-list\">{rows.map((row) => <button className=\"admin-history-row\" type=\"button\" key={row.examinationId} onClick={() => onSelect(row)}><span className=\"avatar\">{row.name.slice(0,2)}</span><span className=\"admin-history-copy\"><strong>{row.name}</strong><small>{row.username} · {row.displayDate}</small><span>{row.findings.length ? row.findings.join(', ') : 'ไม่พบภาวะผิดปกติ'}</span></span><span className={`status-pill ${row.status}`}>{row.status === 'danger' ? 'ควรตรวจสอบ' : row.status === 'attention' ? 'ติดตาม' : 'ปกติ'}</span><ChevronRight size={18} /></button>)}</div> : <div className=\"empty-state\"><ClipboardCheck size={30} /><h2>ยังไม่มีผลตรวจ</h2><p>เมื่อมีผลตรวจที่ยืนยันแล้ว รายการจะเรียงจากล่าสุดไว้ด้านบน</p></div>}</section></div>
}
"""
app = regex_once(
    app,
    r"function DoctorHome\(\{ onNavigate, users, diseaseRecords, adminService, dashboard \}.*?(?=\nfunction FollowupRow)",
    doctor_home,
    'doctor dashboard and all-history modal',
)

# 3) Do not falsely fail camera permission while iOS still waits for consent.
app = replace_once(
    app,
    """    const timeoutId = window.setTimeout(() => {
      if (cameraRequestRef.current === requestId) {
        cameraRequestRef.current += 1
        setCameraState('denied')
      }
    }, 3000)""",
    """    const timeoutId = window.setTimeout(() => {
      if (cameraRequestRef.current === requestId) {
        setScanMessage('ยังรอสิทธิ์กล้อง หากมีหน้าต่างขออนุญาตให้กดอนุญาต')
      }
    }, 5000)""",
    'camera permission timeout',
)

# 4) Warning-quality images stop for review instead of auto-advancing.
app = replace_once(
    app,
    """    setScanState('capturing')
    setScanMessage(result.gate === 'warning' ? 'บันทึกภาพพร้อมธงตรวจทานแล้ว' : 'บันทึกภาพแล้ว')
    advanceTimerRef.current = window.setTimeout(() => onNext(), 950)""",
    """    setScanState('capturing')
    if (result.gate === 'warning') {
      captureInProgressRef.current = false
      setScanMessage('บันทึกภาพแล้ว กรุณาตรวจทานก่อนใช้ต่อ')
      return
    }
    setScanMessage('บันทึกภาพแล้ว')
    advanceTimerRef.current = window.setTimeout(() => onNext(), 950)""",
    'quality warning review gate',
)
app = replace_once(app, '<span><CircleCheck size={15} />ภาพชัดเจน</span>', '<span><CircleCheck size={15} />ภาพพร้อมตรวจ</span>', 'review quality wording')
app_path.write_text(app)

# 5) iOS/Safari zoom-out resilience and mobile all-history styling.
css_path = Path('src/accessibility-overrides.css')
css = css_path.read_text()
css += """

/* DMFC mobile visual-viewport fit + admin all-history view. */
@media (max-width: 900px) {
  body,
  #root,
  .app-shell {
    min-inline-size: 100vw;
    max-inline-size: none;
  }
  .app-column,
  .top-bar,
  .main-content {
    inline-size: 100vw;
    min-inline-size: 100vw;
    max-inline-size: 100vw;
  }
  .app-column {
    margin-inline: 0;
    overflow-x: clip;
  }
  .admin-dashboard-page {
    inline-size: 100%;
    max-inline-size: 100%;
    margin-inline: 0;
  }
}

.admin-history-backdrop { z-index: 150; }
.admin-history-modal {
  width: min(920px, calc(100vw - 28px));
  max-height: min(86dvh, 820px);
  overflow: auto;
}
.admin-history-summary {
  display: flex;
  align-items: center;
  gap: 11px;
  margin: 4px 0 16px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 12px;
  color: var(--blue);
  background: var(--blue-soft);
}
.admin-history-summary > div { display: grid; gap: 1px; }
.admin-history-summary strong { color: var(--ink); font-size: 15px; }
.admin-history-summary span { color: var(--muted); font-size: 13px; }
.admin-history-list { display: grid; gap: 10px; }
.admin-history-row {
  width: 100%;
  min-width: 0;
  min-height: 78px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 12px;
  padding: 11px 12px;
  border: 1px solid var(--line);
  border-radius: 13px;
  color: var(--ink);
  background: #fff;
  text-align: left;
}
.admin-history-row:hover { border-color: #b9cbe0; background: #f8fbff; }
.admin-history-copy { min-width: 0; display: grid; gap: 2px; }
.admin-history-copy strong,
.admin-history-copy small,
.admin-history-copy > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.admin-history-copy strong { white-space: nowrap; font-size: 15px; }
.admin-history-copy small { color: var(--muted); white-space: nowrap; font-size: 13px; }
.admin-history-copy > span { color: var(--muted); white-space: nowrap; font-size: 13px; }
.admin-history-row > svg { color: var(--helper); }
@media (max-width: 600px) {
  .admin-history-modal { width: calc(100vw - 18px); max-height: calc(100dvh - 18px); }
  .admin-history-row { grid-template-columns: auto minmax(0, 1fr) auto; gap: 9px; }
  .admin-history-row > .status-pill { grid-column: 2; justify-self: start; }
  .admin-history-row > svg { grid-column: 3; grid-row: 1 / span 2; }
}
"""
css_path.write_text(css)

# Regression contracts for this patch.
contract_path = Path('tests/feature_update_contract.test.ts')
contract = contract_path.read_text()
contract = replace_once(
    contract,
    "const liveCapture = read('src/services/liveCapture.ts')\n",
    "const liveCapture = read('src/services/liveCapture.ts')\nconst adminDashboard = read('backend/api/v1/admin/dashboard.mjs')\nconst adminBootstrap = read('backend/api/v1/admin/bootstrap.mjs')\n",
    'contract source setup',
)
contract = replace_once(
    contract,
    "assert.doesNotMatch(app, /stableFramesRef\\.current >= 4/)\n",
    """assert.doesNotMatch(app, /stableFramesRef\\.current >= 4/)
assert.match(types, /allExaminations\\?: AdminDashboardRecentExam\\[\\]/)
assert.match(adminDashboard, /const orderedConfirmed = \\[\.\.\.confirmed\\]\.sort/)
assert.match(adminDashboard, /allExaminations/)
assert.match(adminBootstrap, /allExaminations/)
assert.match(app, /ประวัติการตรวจทั้งหมด/)
assert.match(app, /เรียงจากใหม่ไปเก่า/)
assert.match(app, /ยังรอสิทธิ์กล้อง/)
assert.match(app, /กรุณาตรวจทานก่อนใช้ต่อ/)
assert.match(app, /ภาพพร้อมตรวจ/)
assert.doesNotMatch(app, /setCameraState\\('denied'\\)\\n      }\\n    }, 3000/)
assert.match(css, /DMFC mobile visual-viewport fit/)
assert.match(css, /min-inline-size: 100vw/)
""",
    'new UX contract assertions',
)
contract_path.write_text(contract)
