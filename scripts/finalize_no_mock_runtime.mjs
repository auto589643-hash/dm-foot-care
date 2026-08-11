import fs from 'node:fs'

const path = 'src/App.tsx'
let s = fs.readFileSync(path, 'utf8')

function exact(from, to, label) {
  if (!s.includes(from)) throw new Error(`Missing target: ${label}`)
  s = s.replace(from, to)
}

function regex(pattern, to, label) {
  if (!pattern.test(s)) throw new Error(`Missing target: ${label}`)
  pattern.lastIndex = 0
  s = s.replace(pattern, to)
}

// History thumbnails are now always real signed URLs or absent.
s = s.replaceAll("thumbnail && thumbnail !== 'demo'", 'thumbnail')
s = s.replaceAll("!thumbnail || thumbnail === 'demo'", '!thumbnail')

// Never synthesize placeholder photo payloads. Missing photos become a clear error.
exact(
  "function ExaminationFlow({ profile, diseaseRecords, integrations, stage, setStage, onHome, onCompleted }:",
  "function requireCapturedPhotos(photos: Partial<Record<FootPosition, string>>): Record<FootPosition, string> {\n  const entries = examinationPositions.map((position) => {\n    const photo = photos[position]\n    if (!photo) throw new Error(`ยังไม่มีภาพ ${position}`)\n    return [position, photo] as const\n  })\n  return Object.fromEntries(entries) as Record<FootPosition, string>\n}\n\nfunction ExaminationFlow({ profile, diseaseRecords, integrations, stage, setStage, onHome, onCompleted }:",
  'captured photo guard',
)
s = s.replaceAll("Object.fromEntries(examinationPositions.map((position) => [position, photos[position] ?? 'captured'])) as Record<FootPosition, string>", 'requireCapturedPhotos(photos)')

// Patient home recommendation card must come from published backend content.
exact(
  "return <PatientHome profile={profile} examinations={patientExaminations} onStart={() => { setExamStage('intro'); setPage('exam') }} onResume={() => { const draft = readExaminationDraft(); if (draft) { setExamStage(draft.stage); setPage('exam') } }} onHistory={() => setPage('history')} onKnowledge={() => setPage('knowledge')} />",
  "return <PatientHome profile={profile} examinations={patientExaminations} articles={patientKnowledge} onStart={() => { setExamStage('intro'); setPage('exam') }} onResume={() => { const draft = readExaminationDraft(); if (draft) { setExamStage(draft.stage); setPage('exam') } }} onHistory={() => setPage('history')} onKnowledge={() => setPage('knowledge')} />",
  'patient home articles prop',
)
exact(
  "function PatientHome({ profile, examinations: patientExaminations, onStart, onResume, onHistory, onKnowledge }: { profile: Profile; examinations: Examination[]; onStart: () => void; onResume: () => void; onHistory: () => void; onKnowledge: () => void }) {",
  "function PatientHome({ profile, examinations: patientExaminations, articles, onStart, onResume, onHistory, onKnowledge }: { profile: Profile; examinations: Examination[]; articles: KnowledgeArticle[]; onStart: () => void; onResume: () => void; onHistory: () => void; onKnowledge: () => void }) {",
  'patient home signature',
)
exact(
  "  const homeTrend = buildHomeTrend(patientExaminations)",
  "  const homeTrend = buildHomeTrend(patientExaminations)\n  const featuredArticle = articles[0]",
  'featured article',
)
regex(
  /      <section className="knowledge-callout reveal">[\s\S]*?      <\/section>\n      <ClinicalDisclaimer \/>/,
  `      <section className="knowledge-callout reveal">
        <div className="article-icon"><HeartPulse size={26} /></div>
        <div><span className="eyebrow">แนะนำสำหรับคุณ</span><h2>{featuredArticle?.title ?? 'คลังความรู้ดูแลเท้า'}</h2><p>{featuredArticle?.summary ?? 'เมื่อผู้ดูแลเผยแพร่บทความ คำแนะนำจะปรากฏในส่วนนี้'}</p></div>
        <button className="button button-secondary" type="button" onClick={onKnowledge}>{featuredArticle ? 'อ่านคำแนะนำ' : 'เปิดคลังความรู้'} <ArrowRight size={18} /></button>
      </section>
      <ClinicalDisclaimer />`,
  'patient knowledge callout',
)

// Calendar opens on latest real examination month, otherwise the current month.
exact(
  "  const [cursor, setCursor] = useState({ year: 2026, month: 7 })\n  const [selectedDay, setSelectedDay] = useState(8)",
  "  const initialCalendarDate = useMemo(() => { const raw = patientExaminations[0]?.date; const parsed = raw ? new Date(`${raw}T00:00:00`) : new Date(); return Number.isNaN(parsed.getTime()) ? new Date() : parsed }, [patientExaminations])\n  const [cursor, setCursor] = useState(() => ({ year: initialCalendarDate.getFullYear(), month: initialCalendarDate.getMonth() }))\n  const [selectedDay, setSelectedDay] = useState(() => initialCalendarDate.getDate())",
  'calendar defaults',
)

// Trend comparison icon reflects the actual direction.
exact(
  '<section className="comparison-card"><div className="comparison-icon"><TrendingDown size={24} /></div><div><span className="eyebrow">เทียบกับครั้งก่อน</span><h2>{comparisonFinding.name} {comparisonFinding.comparison}</h2>',
  '<section className="comparison-card"><div className="comparison-icon">{comparisonFinding.comparison === \'ดีขึ้น\' ? <TrendingDown size={24} /> : <TrendingUp size={24} />}</div><div><span className="eyebrow">เทียบกับครั้งก่อน</span><h2>{comparisonFinding.name} {comparisonFinding.comparison}</h2>',
  'comparison icon',
)

// New user form starts empty rather than carrying a fake DOB.
exact(
  ": { username: '', name: '', dateOfBirth: '1960-01-01', age: 0, occupation: '', pinConfigured: false, status: 'active', pin: '' })",
  ": { username: '', name: '', dateOfBirth: '', age: 0, occupation: '', pinConfigured: false, status: 'active', pin: '' })",
  'new user date',
)

// Admin User management must always write through the real AdminService.
regex(
  /    if \(adminService\) \{\n      setPendingUserIds[\s\S]*?\n    \}\n  }\n  const closeForm/,
  `    setPendingUserIds((current) => new Set(current).add(id))
    void adminService.setUserStatus(id, nextStatus).then(() => {
      void auditLogger?.append({ actorId: null, eventType: 'user_updated', entityType: 'user', entityId: id, payload: { action: 'status_changed', status: nextStatus } }).catch(() => {})
      showToast(\`${'${previousStatus === \'pending\' ? \'อนุมัติ\' : nextStatus === \'active\' ? \'เปิด\' : \'ปิด\'}'}ใช้งาน ${'${user.username}'} แล้ว\`)
    }).catch(() => {
      setUsers((current) => current.map((item) => item.id === id ? { ...item, status: previousStatus } : item))
      showToast('เปลี่ยนสถานะผู้ใช้ไม่สำเร็จ ระบบคืนสถานะเดิมแล้ว')
    }).finally(() => {
      setPendingUserIds((current) => { const next = new Set(current); next.delete(id); return next })
    })
  }
  const closeForm`,
  'user toggle fallback',
)
regex(
  /  const saveUser = async \(draft: UserFormDraft\) => \{\n    if \(adminService\) \{[\s\S]*?\n    closeForm\(\)\n  \}/,
  `  const saveUser = async (draft: UserFormDraft) => {
    try {
      const saved = await adminService.saveUser(editing ? { ...draft, id: editing.id } : draft)
      setUsers((current) => editing ? current.map((user) => user.id === editing.id ? saved : user) : [...current, saved])
      void auditLogger?.append({ actorId: null, eventType: editing ? 'user_updated' : 'user_created', entityType: 'user', entityId: saved.id, payload: { username: saved.username, status: saved.status } }).catch(() => {})
      showToast(\`${'${editing ? \'บันทึกข้อมูล\' : \'เพิ่มผู้ใช้\'}'} ${'${saved.username}'} แล้ว\`)
      closeForm()
    } catch {
      showToast('บันทึกข้อมูลผู้ใช้ไม่สำเร็จ')
    }
  }`,
  'user save fallback',
)

// Disease management is backend-only; remove local ID generation/fallback.
s = s.replace('adminService?: AdminService; auditLogger?: AuditLogger }) {', 'adminService: AdminService; auditLogger?: AuditLogger }) {')
regex(
  /    if \(adminService\) \{\n      setPendingDiseaseIds[\s\S]*?\n      return\n    \}\n    void auditLogger[\s\S]*?\n  }\n  const openCreate/,
  `    setPendingDiseaseIds((current) => new Set(current).add(id))
    void adminService.setDiseaseActive(id, nextActive).then(() => {
      showToast(\`${'${previousActive ? \'ปิด\' : \'เปิด\'}'}ใช้งาน ${'${disease.name}'} แล้ว\`)
    }).catch(() => {
      setDiseases((current) => current.map((item) => item.id === id ? { ...item, active: previousActive } : item))
      showToast('เปลี่ยนสถานะ Disease ไม่สำเร็จ ระบบคืนสถานะเดิมแล้ว')
    }).finally(() => {
      setPendingDiseaseIds((current) => { const next = new Set(current); next.delete(id); return next })
    })
  }
  const openCreate`,
  'disease toggle fallback',
)
regex(
  /  const saveDisease = async \(draft: Omit<Disease, 'id'>\) => \{\n    if \(adminService\) \{[\s\S]*?\n    closeForm\(\)\n  \}/,
  `  const saveDisease = async (draft: Omit<Disease, 'id'>) => {
    try {
      const saved = await adminService.saveDisease(editing ? { ...draft, id: editing.id } : draft)
      setDiseases((current) => editing ? current.map((item) => item.id === editing.id ? saved : item) : [...current, saved])
      showToast(\`${'${editing ? \'บันทึกเกณฑ์\' : \'เพิ่ม\'}'} ${'${saved.name}'} แล้ว\`)
      closeForm()
    } catch {
      showToast('บันทึก Disease Master ไม่สำเร็จ')
    }
  }`,
  'disease save fallback',
)

// Knowledge management is backend-only and must not show invented readership metrics.
s = s.replace('adminService?: AdminService }) {', 'adminService: AdminService }) {')
regex(
  /  const saveArticle = async \(draft: Omit<KnowledgeArticle, 'id'>\) => \{\n    if \(adminService\) \{[\s\S]*?\n    closeForm\(\)\n  \}/,
  `  const saveArticle = async (draft: Omit<KnowledgeArticle, 'id'>) => {
    try {
      const saved = await adminService.saveKnowledge(editing ? { ...draft, id: editing.id } : draft)
      setArticles((current) => editing ? current.map((article) => article.id === editing.id ? saved : article) : [...current, saved])
      showToast(\`${'${editing ? \'บันทึกบทความ\' : \'สร้างบทความ\'}'} “${'${saved.title}'}” แล้ว\`)
      closeForm()
    } catch {
      showToast('บันทึกบทความไม่สำเร็จ')
    }
  }`,
  'knowledge save fallback',
)
s = s.replace('<AdminStat icon={Eye} label="เปิดอ่านเดือนนี้" value="86" note="เพิ่มขึ้น 18%" tone="teal" />', '')
s = s.replace("readTime: 'อ่าน 3 นาที', tone: 'blue'", "readTime: '', tone: 'blue'")
s = s.replace('รูปจะถูกเก็บเป็น preview ใน prototype; production จะอัปโหลดไป storage ที่กำหนด', 'เมื่อบันทึก ระบบจะอัปโหลดรูปไปยังพื้นที่จัดเก็บส่วนตัวของ DM Foot Care')

// Final static runtime checks.
const forbidden = [
  "'demo'", 'demoAccounts', 'dmfc-demo-role', 'MockFootAssessmentProvider', 'InMemoryExaminationRepository',
  'ใช้ภาพตัวอย่างสำหรับทดลอง', 'preview ใน prototype', 'value="86"', 'เพิ่มขึ้น 18%',
  "dateOfBirth: '1960-01-01'", 'const nextId = `USR-', 'const nextId = `D', 'const nextId = `K',
  "photos[position] ?? 'captured'",
]
for (const needle of forbidden) if (s.includes(needle)) throw new Error(`Forbidden runtime fallback remains: ${needle}`)

fs.writeFileSync(path, s)
console.log('Final no-mock runtime cleanup applied')
