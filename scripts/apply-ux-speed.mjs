import fs from 'node:fs'

const appPath = 'src/App.tsx'
let source = fs.readFileSync(appPath, 'utf8')

function replaceOnce(label, search, replacement) {
  const index = source.indexOf(search)
  if (index < 0) throw new Error(`Missing replacement target: ${label}`)
  source = source.slice(0, index) + replacement + source.slice(index + search.length)
}

function replaceAllRequired(label, search, replacement, minimum = 1) {
  const count = source.split(search).length - 1
  if (count < minimum) throw new Error(`Missing replacement target: ${label} (found ${count})`)
  source = source.split(search).join(replacement)
}

function transformSection(label, startMarker, endMarker, transform) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  if (start < 0 || end < 0) throw new Error(`Missing section: ${label}`)
  const before = source.slice(0, start)
  const section = source.slice(start, end)
  const after = source.slice(end)
  source = before + transform(section) + after
}

// Neutral language: the product provides guidance, but does not present itself as a doctor.
replaceAllRequired('summary recommendation label', 'คำแนะนำจากแพทย์', 'คำแนะนำ')
replaceAllRequired('login care copy', 'คำแนะนำภายใต้การดูแลของแพทย์', 'คำแนะนำสำหรับการดูแลอย่างต่อเนื่อง')
replaceAllRequired('comparison guidance copy', 'ควรติดตามตามคำแนะนำของแพทย์', 'ควรติดตามตามคำแนะนำ')
replaceAllRequired('review ownership copy', 'เพื่อให้แพทย์ตรวจสอบย้อนหลังได้', 'เพื่อให้ผู้ดูแลตรวจสอบย้อนหลังได้')
replaceAllRequired('history ownership copy', 'ผลตรวจย้อนหลังสำหรับการติดตามโดยแพทย์', 'ผลตรวจย้อนหลังสำหรับการติดตาม')
replaceAllRequired('knowledge ownership copy', 'ความรู้จากทีมแพทย์', 'ความรู้สำหรับการดูแล')
replaceAllRequired('admin workspace label', 'Doctor workspace', 'Admin workspace')
replaceAllRequired('admin greeting', 'สวัสดี พญ. มาลี', 'ภาพรวมการดูแล')
replaceAllRequired('disease criteria owner', 'ตามเกณฑ์ที่แพทย์กำหนด', 'ตามเกณฑ์ที่ผู้ดูแลกำหนด')
replaceAllRequired('disease master owner', 'แพทย์เป็นผู้ควบคุมรายการทั้งหมด', 'ผู้ดูแลเป็นผู้ควบคุมรายการทั้งหมด')

// Larger vertical logo lockup on login.
replaceOnce(
  'desktop login brand lockup',
  '<div className="brand brand-on-blue"><BrandMark /><span>DM Foot Care</span></div>',
  '<div className="brand brand-on-blue login-brand-lockup"><BrandMark /><span>DM Foot Care</span></div>',
)
replaceOnce(
  'mobile login brand lockup',
  '<div className="mobile-login-brand brand"><BrandMark /><span>DM Foot Care</span></div>',
  '<div className="mobile-login-brand brand login-brand-lockup"><BrandMark /><span>DM Foot Care</span></div>',
)

// Branded, animated boot state instead of a mostly blank session-check panel.
replaceOnce(
  'boot state',
  '  if (restoring) return <main className="login-page"><section className="login-panel"><div className="login-form-wrap"><span className="eyebrow">DM Foot Care</span><h2>กำลังตรวจสอบ session</h2><p>กรุณารอสักครู่…</p></div></section></main>',
  '  if (restoring) return <main className="app-boot" aria-live="polite"><div className="boot-card"><BrandMark /><div className="boot-copy"><strong>DM Foot Care</strong><span>กำลังเตรียมข้อมูล…</span></div><div className="boot-progress"><span /></div></div></main>',
)

// Give async primary actions visible motion immediately.
replaceAllRequired(
  'login/register pending buttons',
  '<button className="button button-primary button-large" type="submit" disabled={submitting}>',
  '<button className={submitting ? \'button button-primary button-large action-pending\' : \'button button-primary button-large\'} type="submit" disabled={submitting}>',
  2,
)
replaceOnce(
  'finalize pending button',
  '<button className="button button-primary button-large" type="button" disabled={isSubmitting} onClick={onSubmit}>',
  '<button className={isSubmitting ? \'button button-primary button-large action-pending\' : \'button button-primary button-large\'} type="button" disabled={isSubmitting} onClick={onSubmit}>',
)

// Analysis: enter the processing screen first, while backend draft setup runs in parallel.
replaceOnce(
  'draft job ref',
  "  const examinationIdRef = useRef(integrations ? '' : 'EX-DEMO-1')",
  "  const examinationIdRef = useRef(integrations ? '' : 'EX-DEMO-1')\n  const draftJobRef = useRef<Promise<boolean> | null>(null)",
)

replaceOnce(
  'draft setup and immediate analysis transition',
`  const ensureExaminationDraft = async (): Promise<boolean> => {
    if (examinationIdRef.current) return true
    if (!integrations) {
      examinationIdRef.current = \`EX-DEMO-\${Date.now()}\`
      return true
    }
    try {
      const draft = await repositoryRef.current.createDraft(profile.id)
      examinationIdRef.current = draft.id
      void integrations?.audit.append({ actorId: profile.id, eventType: 'examination_created', entityType: 'examination', entityId: draft.id, payload: { status: draft.status } }).catch(() => {})
      return true
    } catch {
      setAnalysisError('เริ่มรายการตรวจไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อแล้วลองใหม่')
      return false
    }
  }

  const beginAnalysis = async () => {
    setAnalysisError('')
    if (!(await ensureExaminationDraft())) return
    setProcessStep(0)
    setStage('processing')
  }`,
`  const ensureExaminationDraft = async (): Promise<boolean> => {
    if (examinationIdRef.current) return true
    if (!integrations) {
      examinationIdRef.current = \`EX-DEMO-\${Date.now()}\`
      return true
    }
    if (draftJobRef.current) return draftJobRef.current
    const job = repositoryRef.current.createDraft(profile.id).then((draft) => {
      examinationIdRef.current = draft.id
      void integrations.audit.append({ actorId: profile.id, eventType: 'examination_created', entityType: 'examination', entityId: draft.id, payload: { status: draft.status } }).catch(() => {})
      return true
    }).catch(() => {
      setAnalysisError('เริ่มรายการตรวจไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อแล้วลองใหม่')
      return false
    }).finally(() => {
      draftJobRef.current = null
    })
    draftJobRef.current = job
    return job
  }

  const beginAnalysis = () => {
    setAnalysisError('')
    setProcessStep(0)
    setStage('processing')
  }`,
)

replaceOnce(
  'parallel draft and image preparation',
  '    void photosToBlobs(capturedPhotos).then((images) => {',
  "    void Promise.all([ensureExaminationDraft(), photosToBlobs(capturedPhotos)]).then(([draftReady, images]) => {\n      if (!draftReady) throw new Error('Could not initialize examination draft')",
)
replaceOnce(
  'faster processing transition',
  "      window.setTimeout(() => { if (!cancelled) setStage('human-review') }, 450)",
  "      window.setTimeout(() => { if (!cancelled) setStage('human-review') }, 120)",
)
replaceOnce(
  'prewarm draft during photo review',
  "onNext={() => step === 3 ? setStage('review') : setStep((value) => value + 1)}",
  "onNext={() => { if (step === 3) { setStage('review'); void ensureExaminationDraft() } else { setStep((value) => value + 1) } }}",
)
replaceOnce(
  'reset draft job',
  "setIsFinalizing(false); thumbnailJobRef.current = null; examinationIdRef.current = integrations ? '' : `EX-DEMO-${Date.now()}`;",
  "setIsFinalizing(false); thumbnailJobRef.current = null; draftJobRef.current = null; examinationIdRef.current = integrations ? '' : `EX-DEMO-${Date.now()}`;",
)

// Progress keeps moving toward 94% while the real backend work is still in flight.
replaceOnce(
  'continuous analysis progress',
  '  const analysisProgress = Math.min(92, 18 + current * 25)',
`  const targetProgress = Math.min(92, 18 + current * 25)
  const [analysisProgress, setAnalysisProgress] = useState(targetProgress)
  useEffect(() => {
    setAnalysisProgress((value) => Math.max(value, targetProgress))
    if (error || !online) return
    const timer = window.setInterval(() => {
      setAnalysisProgress((value) => Math.min(94, value + (value < 70 ? 3 : value < 88 ? 2 : 1)))
    }, 480)
    return () => window.clearInterval(timer)
  }, [error, online, targetProgress])`,
)

// Admin workspace loads each dataset as soon as it is ready instead of waiting for the slowest request.
replaceOnce(
  'independent admin data loading',
`    void Promise.all([adminService.listUsers(), adminService.listDiseases(), adminService.listKnowledge()]).then(([users, diseaseList, articles]) => {
      if (cancelled) return
      setUserRecords(users)
      setDiseaseRecords(diseaseList)
      setKnowledgeRecords(articles)
    }).catch(() => {
      if (!cancelled) showToast('โหลดข้อมูล Doctor workspace ไม่สำเร็จ กรุณาลองใหม่')
    })`,
`    const requests = [
      adminService.listUsers().then((records) => { if (!cancelled) setUserRecords(records) }),
      adminService.listDiseases().then((records) => { if (!cancelled) setDiseaseRecords(records) }),
      adminService.listKnowledge().then((records) => { if (!cancelled) setKnowledgeRecords(records) }),
    ]
    void Promise.allSettled(requests).then((results) => {
      if (!cancelled && results.some((result) => result.status === 'rejected')) showToast('โหลดข้อมูล Admin workspace บางส่วนไม่สำเร็จ กรุณาลองใหม่')
    })`,
)

// Optimistic user status: update immediately, rollback if backend rejects it.
replaceOnce(
  'pending user state',
  "  const [historyUser, setHistoryUser] = useState<UserRecord | null>(null)",
  "  const [historyUser, setHistoryUser] = useState<UserRecord | null>(null)\n  const [pendingUserIds, setPendingUserIds] = useState<Set<string>>(() => new Set())",
)
replaceOnce(
  'optimistic user toggle',
`  const toggle = (id: string) => {
    const user = users.find((item) => item.id === id)
    if (!user) return
    const nextStatus = user.status === 'active' ? 'inactive' : 'active'
    if (adminService) {
      void adminService.setUserStatus(id, nextStatus).then(() => {
        setUsers((current) => current.map((item) => item.id === id ? { ...item, status: nextStatus } : item))
        void auditLogger?.append({ actorId: null, eventType: 'user_updated', entityType: 'user', entityId: id, payload: { action: 'status_changed', status: nextStatus } }).catch(() => {})
        showToast(\`\${user.status === 'pending' ? 'อนุมัติ' : nextStatus === 'active' ? 'เปิด' : 'ปิด'}ใช้งาน \${user.username} แล้ว\`)
      }).catch(() => showToast('เปลี่ยนสถานะผู้ใช้ไม่สำเร็จ'))
      return
    }
    setUsers((current) => current.map((item) => item.id === id ? { ...item, status: nextStatus } : item))
  }`,
`  const toggle = (id: string) => {
    if (pendingUserIds.has(id)) return
    const user = users.find((item) => item.id === id)
    if (!user) return
    const previousStatus = user.status
    const nextStatus = user.status === 'active' ? 'inactive' : 'active'
    setUsers((current) => current.map((item) => item.id === id ? { ...item, status: nextStatus } : item))
    if (adminService) {
      setPendingUserIds((current) => new Set(current).add(id))
      void adminService.setUserStatus(id, nextStatus).then(() => {
        void auditLogger?.append({ actorId: null, eventType: 'user_updated', entityType: 'user', entityId: id, payload: { action: 'status_changed', status: nextStatus } }).catch(() => {})
        showToast(\`\${previousStatus === 'pending' ? 'อนุมัติ' : nextStatus === 'active' ? 'เปิด' : 'ปิด'}ใช้งาน \${user.username} แล้ว\`)
      }).catch(() => {
        setUsers((current) => current.map((item) => item.id === id ? { ...item, status: previousStatus } : item))
        showToast('เปลี่ยนสถานะผู้ใช้ไม่สำเร็จ ระบบคืนสถานะเดิมแล้ว')
      }).finally(() => {
        setPendingUserIds((current) => { const next = new Set(current); next.delete(id); return next })
      })
    }
  }`,
)
replaceAllRequired(
  'pending user article',
  "<article className={user.status === 'pending' ? 'pending-user' : ''} key={user.id}>",
  "<article className={user.status === 'pending' ? 'pending-user' : ''} key={user.id} data-pending={pendingUserIds.has(user.id) ? 'true' : undefined}>",
)
replaceAllRequired(
  'pending approve button',
  '<button className="button button-primary button-small approve-user-button" type="button" onClick={() => toggle(user.id)}>',
  '<button className="button button-primary button-small approve-user-button" type="button" disabled={pendingUserIds.has(user.id)} onClick={() => toggle(user.id)}>',
)

// Optimistic Disease toggle: visual state moves immediately and rolls back on failure.
replaceOnce(
  'pending disease state',
  "  const [creating, setCreating] = useState(false)\n  const filtered = diseaseRecords.filter",
  "  const [creating, setCreating] = useState(false)\n  const [pendingDiseaseIds, setPendingDiseaseIds] = useState<Set<string>>(() => new Set())\n  const filtered = diseaseRecords.filter",
)
replaceOnce(
  'optimistic disease toggle',
`  const toggle = (id: string) => {
    const disease = diseaseRecords.find((item) => item.id === id)
    if (!disease) return
    if (adminService) {
      void adminService.setDiseaseActive(id, !disease.active).then(() => {
        setDiseases((current) => current.map((item) => item.id === id ? { ...item, active: !item.active } : item))
        void auditLogger?.append({ actorId: null, eventType: 'disease_master_updated', entityType: 'disease', entityId: id, payload: { action: 'status_changed', active: !disease.active } }).catch(() => {})
        showToast(\`\${disease.active ? 'ปิด' : 'เปิด'}ใช้งาน \${disease.name} แล้ว\`)
      }).catch(() => showToast('เปลี่ยนสถานะ Disease ไม่สำเร็จ'))
      return
    }
    setDiseases((current) => current.map((item) => item.id === id ? { ...item, active: !item.active } : item))
  }`,
`  const toggle = (id: string) => {
    if (pendingDiseaseIds.has(id)) return
    const disease = diseaseRecords.find((item) => item.id === id)
    if (!disease) return
    const previousActive = disease.active
    const nextActive = !previousActive
    setDiseases((current) => current.map((item) => item.id === id ? { ...item, active: nextActive } : item))
    if (adminService) {
      setPendingDiseaseIds((current) => new Set(current).add(id))
      void adminService.setDiseaseActive(id, nextActive).then(() => {
        showToast(\`\${previousActive ? 'ปิด' : 'เปิด'}ใช้งาน \${disease.name} แล้ว\`)
      }).catch(() => {
        setDiseases((current) => current.map((item) => item.id === id ? { ...item, active: previousActive } : item))
        showToast('เปลี่ยนสถานะ Disease ไม่สำเร็จ ระบบคืนสถานะเดิมแล้ว')
      }).finally(() => {
        setPendingDiseaseIds((current) => { const next = new Set(current); next.delete(id); return next })
      })
      return
    }
    void auditLogger?.append({ actorId: null, eventType: 'disease_master_updated', entityType: 'disease', entityId: id, payload: { action: 'status_changed', active: nextActive } }).catch(() => {})
  }`,
)
replaceAllRequired(
  'pending disease article',
  "<article className={disease.active ? '' : 'inactive'} key={disease.id}>",
  "<article className={disease.active ? '' : 'inactive'} key={disease.id} data-pending={pendingDiseaseIds.has(disease.id) ? 'true' : undefined}>",
)
replaceOnce(
  'disease toggle click without premature toast',
  "onClick={() => { toggle(disease.id); showToast(`${disease.active ? 'ปิด' : 'เปิด'}ใช้งาน ${disease.name} แล้ว`) }}",
  "disabled={pendingDiseaseIds.has(disease.id)} onClick={() => toggle(disease.id)}",
)

// Save buttons: provide visible pending state for commands that must wait for backend confirmation.
transformSection('user form', 'function UserFormModal', 'function DiseaseManagement', (section) => {
  let next = section
  next = next.replace(
    '  const update = <K extends keyof typeof draft>',
    '  const [isSaving, setIsSaving] = useState(false)\n  const update = <K extends keyof typeof draft>',
  )
  const submitPattern = /  const submit = \(event: React\.FormEvent\) => \{[\s\S]*?\n  \}\n  return/
  if (!submitPattern.test(next)) throw new Error('Missing user form submit')
  next = next.replace(submitPattern, `  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!draft.username.trim() || !draft.name.trim() || !draft.dateOfBirth || !draft.occupation.trim()) return
    const validPin = draft.pin === '' ? Boolean(user?.pinConfigured) : /^\\d{4}$/.test(draft.pin)
    if (!validPin) return
    const safeDraft: Omit<UserRecord, 'id' | 'lastExam'> = { username: draft.username.trim().toUpperCase(), name: draft.name.trim(), dateOfBirth: draft.dateOfBirth, age: calculateAge(draft.dateOfBirth), occupation: draft.occupation.trim(), pinConfigured: Boolean(draft.pin || draft.pinConfigured), status: draft.status }
    setIsSaving(true)
    try {
      await onSave({ ...safeDraft, ...(draft.pin ? { pin: draft.pin } : {}) })
    } finally {
      setIsSaving(false)
    }
  }
  return`)
  next = next.replace('<button className="button button-secondary" type="button" onClick={onClose}>ยกเลิก</button>', '<button className="button button-secondary" type="button" disabled={isSaving} onClick={onClose}>ยกเลิก</button>')
  next = next.replace('<button className="button button-primary" type="submit">บันทึกข้อมูล</button>', '<button className={isSaving ? \'button button-primary action-pending\' : \'button button-primary\'} type="submit" disabled={isSaving}>{isSaving ? \'กำลังบันทึก…\' : \'บันทึกข้อมูล\'}</button>')
  return next
})

transformSection('disease form', 'function DiseaseFormModal', 'function KnowledgeManagement', (section) => {
  let next = section
  next = next.replace(
    '  const update = <K extends keyof typeof draft>',
    '  const [isSaving, setIsSaving] = useState(false)\n  const update = <K extends keyof typeof draft>',
  )
  const submitPattern = /  const submit = \(event: React\.FormEvent\) => \{[\s\S]*?\n  \}\n  const readReferenceImage/
  if (!submitPattern.test(next)) throw new Error('Missing disease form submit')
  next = next.replace(submitPattern, `  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const levels = (draft.severityLevels ?? getDiseaseSeverityLevels()).map((level) => ({ ...level, criteria: level.criteria.trim() }))
    if (!draft.name.trim() || !draft.category.trim() || !draft.description.trim() || !draft.criteria.trim() || levels.some((level) => !level.criteria) || !draft.care.trim() || !draft.recommendation.trim()) return
    setIsSaving(true)
    try {
      await onSave({ ...draft, name: draft.name.trim(), category: draft.category.trim(), description: draft.description.trim(), criteria: draft.criteria.trim(), severityCriteria: serializeSeverityLevels(levels), severityLevels: levels, care: draft.care.trim(), recommendation: draft.recommendation.trim() })
    } finally {
      setIsSaving(false)
    }
  }
  const readReferenceImage`)
  next = next.replace('<button className="button button-secondary" type="button" onClick={onClose}>ยกเลิก</button>', '<button className="button button-secondary" type="button" disabled={isSaving} onClick={onClose}>ยกเลิก</button>')
  next = next.replace('<button className="button button-primary" type="submit">บันทึกเกณฑ์</button>', '<button className={isSaving ? \'button button-primary action-pending\' : \'button button-primary\'} type="submit" disabled={isSaving}>{isSaving ? \'กำลังบันทึก…\' : \'บันทึกเกณฑ์\'}</button>')
  return next
})

fs.writeFileSync(appPath, source)
console.log('Applied UX speed and optimistic interaction updates to src/App.tsx')
