import fs from 'node:fs'

function update(path, transform) {
  const before = fs.readFileSync(path, 'utf8')
  const after = transform(before)
  if (after === before) console.log(`unchanged ${path}`)
  else {
    fs.writeFileSync(path, after)
    console.log(`updated ${path}`)
  }
}

function exact(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`Missing target: ${label}`)
  return source.replace(from, to)
}

function regex(source, pattern, to, label) {
  if (!pattern.test(source)) throw new Error(`Missing regex target: ${label}`)
  pattern.lastIndex = 0
  return source.replace(pattern, to)
}

update('src/App.tsx', (input) => {
  let s = input
  s = s.replace('\n  Bell,', '')
  s = exact(s, "import { diseases, doctorProfile, examinations, footSteps, knowledgeArticles, patientProfile, userExaminations, users as seededUsers } from './data'", "import { footSteps } from './data'", 'data import')
  s = s.replace("\nimport { MockFootAssessmentProvider, toMockDiseaseMaster } from './services/mockAiProvider'", '')
  s = s.replace("\nimport { BrowserThumbnailService, InMemoryExaminationRepository, InMemoryOriginalImageArchive, photosToBlobs } from './services/mockPipelineAdapters'", '')
  s = exact(s,
    "import type { AdminService, AuthService, ExaminationRepository, FootAssessmentProvider, OriginalImageArchive, ThumbnailService } from './services/contracts'",
    "import type { AdminService, AuthService, ExaminationRepository, FootAssessmentProvider, KnowledgeLibraryService, OriginalImageArchive, ThumbnailService } from './services/contracts'",
    'contract imports')
  s = exact(s,
    "import type { Disease, DiseaseSeverityLevel, Examination, Finding, FootPosition, KnowledgeArticle, Page, Profile, Role, Severity, UserRecord } from './types'",
    "import type { AdminDashboard, AdminDashboardRecentExam, Disease, DiseaseSeverityLevel, Examination, Finding, FootPosition, KnowledgeArticle, Page, Profile, Role, Severity, UserRecord } from './types'",
    'type imports')

  s = regex(s, /const mockFindings: Finding\[\] = \[[\s\S]*?\n}\n\nfunction cloneFindings/, 'function cloneFindings', 'mock data blocks')
  s = exact(s, '  const integrations = runtimeState.integrations', '  const integrations = runtimeState.integrations!', 'required runtime')
  s = regex(s, /  const \[profile, setProfile\] = useState<Profile \| null>\(\(\) => \{[\s\S]*?\n  \}\)/, '  const [profile, setProfile] = useState<Profile | null>(null)', 'profile demo state')
  s = s.replace('  const [restoring, setRestoring] = useState(Boolean(integrations))', '  const [restoring, setRestoring] = useState(true)')
  s = s.replace('  const [patientExaminations, setPatientExaminations] = useState(examinations)', '  const [patientExaminations, setPatientExaminations] = useState<Examination[]>([])')
  s = s.replace('  const [patientKnowledge, setPatientKnowledge] = useState(knowledgeArticles)', '  const [patientKnowledge, setPatientKnowledge] = useState<KnowledgeArticle[]>([])')
  s = s.replace('  const [patientDiseases, setPatientDiseases] = useState(diseases)', '  const [patientDiseases, setPatientDiseases] = useState<Disease[]>([])')
  s = s.replace('      if (content.diseases.length) setPatientDiseases(content.diseases)', '      setPatientDiseases(content.diseases)')
  s = s.replace("    if (!integrations) window.localStorage.setItem('dmfc-demo-role', nextProfile.role)\n", '')
  s = regex(s, /    if \(integrations\) \{\n      void integrations\.auth\.signOut\(\)\.catch\(\(\) => \{\}\)\n      runtimeState\.setAccessToken\(null\)\n    \} else \{\n      window\.localStorage\.removeItem\('dmfc-demo-role'\)\n    \}/, "    void integrations.auth.signOut().catch(() => {})\n    runtimeState.setAccessToken(null)", 'logout demo branch')
  s = s.replace('    setPatientExaminations(examinations)', '    setPatientExaminations([])')
  s = s.replace('    setPatientKnowledge(knowledgeArticles)', '    setPatientKnowledge([])')
  s = s.replace('    setPatientDiseases(diseases)', '    setPatientDiseases([])')
  s = s.replace('<LoginScreen onLogin={login} authService={integrations?.auth} />', '<LoginScreen onLogin={login} authService={integrations.auth} />')
  s = s.replace('integrations={integrations}', 'integrations={integrations}')
  s = s.replace('adminService={integrations?.admin} auditLogger={integrations?.audit}', 'adminService={integrations.admin} auditLogger={integrations.audit}')

  const loginScreen = `function LoginScreen({ onLogin, authService }: { onLogin: (profile: Profile) => void; authService: AuthService }) {
  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [registration, setRegistration] = useState({ username: '', displayName: '', dateOfBirth: '', occupation: '', pin: '', confirmPin: '' })
  const [registrationComplete, setRegistrationComplete] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    const normalizedUsername = username.trim().toUpperCase()
    if (!normalizedUsername || pin.length !== 4) {
      setError('กรุณากรอกชื่อผู้ใช้และ PIN 4 หลักให้ครบ')
      return
    }
    setSubmitting(true)
    try {
      onLogin(await authService.signInWithUsername(normalizedUsername, pin))
    } catch {
      setError('เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบข้อมูลหรือลองใหม่อีกครั้ง')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    const normalizedUsername = registration.username.trim().toUpperCase()
    if (!normalizedUsername || !registration.displayName.trim() || !registration.dateOfBirth || !registration.occupation.trim()) {
      setError('กรุณากรอกข้อมูลลงทะเบียนให้ครบทุกช่อง')
      return
    }
    if (!/^\\d{4}$/.test(registration.pin) || registration.pin !== registration.confirmPin) {
      setError('กรุณากรอก PIN 4 หลักให้ตรงกันทั้งสองช่อง')
      return
    }
    setSubmitting(true)
    try {
      await authService.register({ username: normalizedUsername, displayName: registration.displayName.trim(), dateOfBirth: registration.dateOfBirth, occupation: registration.occupation.trim(), pin: registration.pin })
      setRegistrationComplete(true)
    } catch {
      setError('ลงทะเบียนไม่สำเร็จ กรุณาตรวจสอบ Username หรือลองใหม่อีกครั้ง')
    } finally {
      setSubmitting(false)
    }
  }

  const updateRegistration = (key: keyof typeof registration, value: string) => setRegistration((current) => ({ ...current, [key]: value }))

  return (
    <main className="login-page">
      <section className="login-shell">
        <aside className="login-visual"><div className="brand brand-on-blue"><BrandMark /><span>DM Foot Care</span></div><div className="login-visual-copy"><span className="eyebrow">ดูแลอย่างต่อเนื่อง</span><h1>ติดตามสุขภาพเท้า<br />ได้ง่ายในทุกครั้ง</h1><p>บันทึกภาพ ตรวจสอบ และติดตามผลย้อนหลังในระบบเดียว</p></div><FourFrameIllustration /></aside>
        <div className="mobile-login-brand brand login-brand-lockup"><BrandMark /><span>DM Foot Care</span></div>
        <div className="login-form-wrap">
          {mode === 'login' ? <><div className="login-heading"><span className="eyebrow">ยินดีต้อนรับ</span><h2>เข้าสู่ระบบ</h2><p>กรอกชื่อผู้ใช้และ PIN ของคุณ</p></div><form onSubmit={handleLogin} noValidate><label className="field-label" htmlFor="username">ชื่อผู้ใช้</label><div className="input-wrap"><UserRound size={20} /><input id="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="เช่น DM001" /></div><label className="field-label" htmlFor="pin">PIN 4 หลัก</label><div className="input-wrap"><ShieldCheck size={20} /><input id="pin" inputMode="numeric" autoComplete="current-password" maxLength={4} type="password" value={pin} onChange={(event) => setPin(event.target.value.replace(/\\D/g, ''))} placeholder="••••" /></div>{error ? <div className="form-error" role="alert"><AlertTriangle size={18} />{error}</div> : null}<button className={submitting ? 'button button-primary button-large action-pending' : 'button button-primary button-large'} type="submit" disabled={submitting}>{submitting ? 'กำลังเข้าสู่ระบบ…' : <>เข้าสู่ระบบ <ArrowRight size={20} /></>}</button></form><button className="login-mode-switch" type="button" onClick={() => { setMode('register'); setError('') }}>ยังไม่มีบัญชี? ลงทะเบียนใช้งาน</button><p className="login-support">มีปัญหาในการเข้าสู่ระบบ? ติดต่อผู้ดูแลระบบ</p></> : registrationComplete ? <div className="registration-success"><CircleCheck size={42} /><span className="eyebrow">ลงทะเบียนสำเร็จ</span><h2>รอ Admin อนุมัติบัญชี</h2><p>เมื่อบัญชีได้รับอนุมัติแล้ว คุณจะเข้าสู่ระบบด้วย Username และ PIN ที่ตั้งไว้ได้</p><button className="button button-primary button-large" type="button" onClick={() => { setUsername(registration.username.trim().toUpperCase()); setMode('login'); setRegistrationComplete(false); setError('') }}>กลับไปหน้าเข้าสู่ระบบ</button></div> : <><div className="login-heading"><span className="eyebrow">บัญชีใหม่</span><h2>ลงทะเบียนใช้งาน</h2><p>กรอกข้อมูลให้ครบ แล้วรอ Admin อนุมัติบัญชี</p></div><form className="registration-form" onSubmit={handleRegister} noValidate><label className="field-label" htmlFor="register-username">Username</label><input id="register-username" autoComplete="username" value={registration.username} onChange={(event) => updateRegistration('username', event.target.value)} placeholder="ใช้ A-Z, 0-9, _ หรือ -" /><label className="field-label" htmlFor="register-name">ชื่อ-นามสกุล</label><input id="register-name" autoComplete="name" value={registration.displayName} onChange={(event) => updateRegistration('displayName', event.target.value)} /><div className="registration-grid"><div><label className="field-label" htmlFor="register-dob">วันเดือนปีเกิด</label><input id="register-dob" type="date" value={registration.dateOfBirth} onChange={(event) => updateRegistration('dateOfBirth', event.target.value)} /></div><div><label className="field-label" htmlFor="register-occupation">อาชีพ</label><input id="register-occupation" value={registration.occupation} onChange={(event) => updateRegistration('occupation', event.target.value)} /></div></div><div className="registration-grid"><div><label className="field-label" htmlFor="register-pin">ตั้ง PIN 4 หลัก</label><input id="register-pin" type="password" inputMode="numeric" maxLength={4} autoComplete="new-password" value={registration.pin} onChange={(event) => updateRegistration('pin', event.target.value.replace(/\\D/g, '').slice(0, 4))} /></div><div><label className="field-label" htmlFor="register-confirm-pin">ยืนยัน PIN</label><input id="register-confirm-pin" type="password" inputMode="numeric" maxLength={4} autoComplete="new-password" value={registration.confirmPin} onChange={(event) => updateRegistration('confirmPin', event.target.value.replace(/\\D/g, '').slice(0, 4))} /></div></div>{error ? <div className="form-error" role="alert"><AlertTriangle size={18} />{error}</div> : null}<button className={submitting ? 'button button-primary button-large action-pending' : 'button button-primary button-large'} type="submit" disabled={submitting}>{submitting ? 'กำลังส่งข้อมูล…' : 'ส่งคำขอลงทะเบียน'}</button></form><button className="login-mode-switch" type="button" onClick={() => { setMode('login'); setError('') }}>มีบัญชีแล้ว? กลับไปเข้าสู่ระบบ</button></>}
        </div>
      </section>
    </main>
  )
}

function BrandMark`
  s = regex(s, /function LoginScreen[\s\S]*?\n}\n\nfunction BrandMark/, loginScreen, 'login screen')

  s = s.replace('<button className="icon-button notification-button" type="button" aria-label="การแจ้งเตือน"><Bell size={20} /><span /></button>\n', '')

  const patientPages = `function PatientPages({ profile, page, setPage, examStage, setExamStage, examinations: patientExaminations, knowledgeArticles: patientKnowledge, diseaseRecords: patientDiseases, integrations, onExamCompleted, showToast }: { profile: Profile; page: Page; setPage: (page: Page) => void; examStage: ExamStage; setExamStage: (stage: ExamStage) => void; examinations: Examination[]; knowledgeArticles: KnowledgeArticle[]; diseaseRecords: Disease[]; integrations: RuntimeIntegrations; onExamCompleted: (exam: Examination) => void; showToast: (text: string) => void }) {
  if (page === 'exam') return <ExaminationFlow profile={profile} diseaseRecords={patientDiseases} integrations={integrations} stage={examStage} setStage={setExamStage} onHome={() => setPage('home')} onCompleted={onExamCompleted} />
  if (page === 'history') return <HistoryPage examinations={patientExaminations} diseaseRecords={patientDiseases} />
  if (page === 'knowledge') return <KnowledgePage articles={patientKnowledge} diseaseRecords={patientDiseases} showToast={showToast} knowledgeService={integrations.knowledge} />
  return <PatientHome profile={profile} examinations={patientExaminations} onStart={() => { setExamStage('intro'); setPage('exam') }} onResume={() => { const draft = readExaminationDraft(); if (draft) { setExamStage(draft.stage); setPage('exam') } }} onHistory={() => setPage('history')} onKnowledge={() => setPage('knowledge')} />
}`
  s = regex(s, /function PatientPages[\s\S]*?\n}\n\nfunction PatientHome/, `${patientPages}\n\nfunction PatientHome`, 'patient pages')

  s = s.replace('  const latestSummary = latestFindings.length ? (latestSeverity === \'รุนแรง\' ? \'ควรพบแพทย์\' : \'ควรติดตาม\') : \'ยังไม่พบภาวะ\'', "  const latestSummary = latestFindings.length ? (latestSeverity === 'รุนแรง' ? 'ควรพบแพทย์' : 'ควรติดตาม') : 'ยังไม่พบภาวะ'\n  const homeTrend = buildHomeTrend(patientExaminations)")
  const oldProgress = `<section className="content-card progress-card reveal reveal-delay-3" aria-labelledby="progress-title">
          <div className="section-heading"><div><span className="eyebrow">แนวโน้ม 4 ครั้งล่าสุด</span><h2 id="progress-title">{patientExaminations.length ? 'ผิวแห้งดีขึ้น' : 'เริ่มติดตามผล'}</h2></div><span className="trend-icon good">{patientExaminations.length ? <TrendingDown size={20} /> : <Clock3 size={20} />}</span></div>
          <MiniTrend examinations={patientExaminations} />
          <p>{patientExaminations.length ? 'ระดับลดจากรุนแรงเป็นปานกลางเมื่อเทียบกับครั้งก่อน' : 'เมื่อมีผลตรวจ ระบบจะแสดงแนวโน้มการเปลี่ยนแปลงให้ที่นี่'}</p>
          <button className="card-link" type="button" onClick={onHistory}>ดูแนวโน้มโดยละเอียด <ChevronRight size={18} /></button>
        </section>`
  const newProgress = `<section className="content-card progress-card reveal reveal-delay-3" aria-labelledby="progress-title">
          <div className="section-heading"><div><span className="eyebrow">แนวโน้ม 4 ครั้งล่าสุด</span><h2 id="progress-title">{homeTrend?.title ?? 'เริ่มติดตามผล'}</h2></div><span className={homeTrend?.direction === 'better' ? 'trend-icon good' : 'trend-icon'}>{homeTrend?.direction === 'better' ? <TrendingDown size={20} /> : homeTrend?.direction === 'worse' ? <TrendingUp size={20} /> : <Clock3 size={20} />}</span></div>
          <MiniTrend examinations={patientExaminations} diseaseId={homeTrend?.diseaseId} />
          <p>{homeTrend?.description ?? 'เมื่อมีผลตรวจอย่างน้อย 2 ครั้ง ระบบจะแสดงแนวโน้มการเปลี่ยนแปลงให้ที่นี่'}</p>
          <button className="card-link" type="button" onClick={onHistory}>ดูแนวโน้มโดยละเอียด <ChevronRight size={18} /></button>
        </section>`
  s = exact(s, oldProgress, newProgress, 'patient home trend card')

  const miniTrend = `function buildHomeTrend(patientExaminations: Examination[]) {
  const latest = patientExaminations.find((exam) => exam.findings.length > 0)
  const tracked = latest?.findings[0]
  if (!latest || !tracked) return null
  const records = patientExaminations.map((exam) => exam.findings.find((finding) => finding.diseaseId === tracked.diseaseId)).filter((finding): finding is Finding => Boolean(finding))
  const previous = records[1]
  if (!previous) return { diseaseId: tracked.diseaseId, title: tracked.name, description: 'มีข้อมูลครั้งแรกแล้ว รอผลครั้งถัดไปเพื่อเปรียบเทียบแนวโน้ม', direction: 'same' as const }
  const delta = severityRank[tracked.severity] - severityRank[previous.severity]
  const direction = delta < 0 ? 'better' as const : delta > 0 ? 'worse' as const : 'same' as const
  const title = direction === 'better' ? \\`${'${tracked.name}'} ดีขึ้น\\` : direction === 'worse' ? \\`${'${tracked.name}'} ควรติดตาม\\` : \\`${'${tracked.name}'} คงที่\\`
  const description = \\`ระดับ${'${previous.severity}'} → ${'${tracked.severity}'} เมื่อเทียบกับผลครั้งก่อน\\`
  return { diseaseId: tracked.diseaseId, title, description, direction }
}

function MiniTrend({ examinations: patientExaminations, diseaseId }: { examinations: Examination[]; diseaseId?: string }) {
  const records = patientExaminations.slice(0, 4).reverse()
  return <div className="mini-trend" aria-label="แนวโน้มระดับความรุนแรงจากผลตรวจจริง">{records.length ? records.map((exam) => { const finding = diseaseId ? exam.findings.find((item) => item.diseaseId === diseaseId) : undefined; const value = finding ? severityRank[finding.severity] : 0; return <div className="trend-column" key={exam.id}><span style={{ height: \\`${'${Math.max(18, value * 24)}'}px\\`, opacity: value ? 1 : .25 }} /><small>{exam.displayDate.split(' ')[0]}</small></div> }) : [0,1,2,3].map((index) => <div className="trend-column" key={index}><span style={{ height: '18px', opacity: .2 }} /><small>—</small></div>)}</div>
}`
  s = regex(s, /function MiniTrend[\s\S]*?\n}\n\nfunction ClinicalDisclaimer/, `${miniTrend}\n\nfunction ClinicalDisclaimer`, 'mini trend')

  s = s.replace("const comparisonFinding = findings.find((finding) => finding.comparison !== 'คงที่')", "const comparisonFinding = findings.find((finding) => ['ดีขึ้น', 'แย่ลง', 'ควรติดตาม'].includes(finding.comparison))")
  s = s.replace('function ExaminationDetail({ exam, diseaseRecords = diseases, onClose }: { exam: Examination; diseaseRecords?: Disease[]; onClose: () => void })', 'function ExaminationDetail({ exam, diseaseRecords = [], onClose }: { exam: Examination; diseaseRecords?: Disease[]; onClose: () => void })')

  const knowledgeBlock = `function KnowledgePage({ articles, diseaseRecords, showToast, knowledgeService }: { articles: KnowledgeArticle[]; diseaseRecords: Disease[]; showToast: (text: string) => void; knowledgeService: KnowledgeLibraryService }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('ทั้งหมด')
  const [diseaseFilter, setDiseaseFilter] = useState('ทั้งหมด')
  const [severityFilter, setSeverityFilter] = useState('ทั้งหมด')
  const [selected, setSelected] = useState<KnowledgeArticle | null>(null)
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set())
  const [savingId, setSavingId] = useState<string | null>(null)
  useEffect(() => { let cancelled = false; void knowledgeService.listSavedArticleIds().then((ids) => { if (!cancelled) setSavedIds(new Set(ids)) }).catch(() => { if (!cancelled) showToast('โหลดรายการที่บันทึกไว้ไม่สำเร็จ') }); return () => { cancelled = true } }, [knowledgeService, showToast])
  const categories = ['ทั้งหมด', ...new Set(articles.map((article) => article.category))]
  const diseaseOptions = ['ทั้งหมด', ...diseaseRecords.map((disease) => disease.id)]
  const severityOptions = ['ทั้งหมด', 'ทุกระดับ', 'เล็กน้อย', 'ปานกลาง', 'รุนแรง'] as const
  const filtered = useMemo(() => articles.filter((article) => (category === 'ทั้งหมด' || article.category === category) && (diseaseFilter === 'ทั้งหมด' || article.diseaseId === diseaseFilter) && (severityFilter === 'ทั้งหมด' || article.severity === severityFilter) && \\`${'${article.title} ${article.summary} ${article.diseaseId ?? \'\'}'}\\`.toLowerCase().includes(query.toLowerCase())), [articles, query, category, diseaseFilter, severityFilter])
  const toggleSaved = async (article: KnowledgeArticle) => {
    const wasSaved = savedIds.has(article.id); const nextSaved = !wasSaved
    setSavedIds((current) => { const next = new Set(current); if (nextSaved) next.add(article.id); else next.delete(article.id); return next })
    setSavingId(article.id)
    try { await knowledgeService.setSaved(article.id, nextSaved); showToast(nextSaved ? 'บันทึกไว้อ่านภายหลังแล้ว' : 'นำออกจากรายการที่บันทึกแล้ว') }
    catch { setSavedIds((current) => { const next = new Set(current); if (wasSaved) next.add(article.id); else next.delete(article.id); return next }); showToast('บันทึกรายการไม่สำเร็จ ระบบคืนสถานะเดิมแล้ว') }
    finally { setSavingId(null) }
  }
  return <div className="page knowledge-page"><PageTitle eyebrow="ความรู้สำหรับการดูแล" title="คลังความรู้ดูแลเท้า" description="คำแนะนำที่อ่านง่ายและผ่านการจัดทำโดยทีมดูแล" /><div className="knowledge-tools"><label className="search-field"><Search size={20} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหา เช่น ผิวแห้ง หนังด้าน" aria-label="ค้นหาคลังความรู้" /></label><div className="category-chips" aria-label="กรองตามหมวดหมู่">{categories.map((item) => <button className={category === item ? 'active' : ''} type="button" key={item} onClick={() => setCategory(item)}>{item}</button>)}</div><div className="knowledge-filter-row"><label><span>ภาวะ</span><select aria-label="กรองตามภาวะ" value={diseaseFilter} onChange={(event) => setDiseaseFilter(event.target.value)}>{diseaseOptions.map((id) => <option value={id} key={id}>{id === 'ทั้งหมด' ? id : \\`${'${id} · ${diseaseRecords.find((disease) => disease.id === id)?.name ?? id}'}\\`}</option>)}</select></label><label><span>ระดับความรุนแรง</span><select aria-label="กรองตามระดับความรุนแรง" value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)}>{severityOptions.map((severity) => <option value={severity} key={severity}>{severity}</option>)}</select></label></div></div>{filtered.length ? <div className="article-grid">{filtered.map((article, index) => <article className={\\`article-card tone-${'${article.tone}'}\\`} key={article.id}><div className="article-visual">{article.image ? <img src={article.image} alt="" /> : <HeartPulse size={30} />}<span>{index + 1}</span></div><div className="article-body"><div><span className="category-label">{article.category}</span><span>{article.severity} · {article.readTime}</span></div><h2>{article.title}</h2><p>{article.summary}</p><button className="card-link" type="button" onClick={() => setSelected(article)}>อ่านคำแนะนำ <ChevronRight size={18} /></button></div></article>)}</div> : <div className="empty-state"><Search size={32} /><h2>ยังไม่พบหัวข้อนี้</h2><p>ลองค้นด้วยคำที่สั้นลง หรือเลือก “ทั้งหมด” เพื่อดูคำแนะนำที่มี</p><button className="button button-secondary" type="button" onClick={() => { setQuery(''); setCategory('ทั้งหมด'); setDiseaseFilter('ทั้งหมด'); setSeverityFilter('ทั้งหมด') }}>ดูบทความทั้งหมด</button></div>}{selected ? <ArticleModal article={selected} saved={savedIds.has(selected.id)} saving={savingId === selected.id} onClose={() => setSelected(null)} onSaved={() => void toggleSaved(selected)} /> : null}</div>
}

function ArticleModal({ article, saved, saving, onClose, onSaved }: { article: KnowledgeArticle; saved: boolean; saving: boolean; onClose: () => void; onSaved: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><article className="detail-modal article-modal" role="dialog" aria-modal="true" aria-labelledby="article-title"><header><div><span className="eyebrow">{article.category} · {article.severity} · {article.readTime}</span><h2 id="article-title">{article.title}</h2></div><button className="icon-button" type="button" aria-label="ปิด" onClick={onClose}><X size={21} /></button></header><div className={\\`article-hero tone-${'${article.tone}'}\\`}>{article.image ? <img src={article.image} alt="" /> : <HeartPulse size={44} />}</div><p className="article-intro">{article.summary}</p><h3>ทำตามขั้นตอนนี้</h3><ol className="care-steps">{article.care.map((step, index) => <li key={step}><span>{index + 1}</span>{step}</li>)}</ol>{article.treatment ? <section className="article-guidance"><h3>การรักษา</h3><p>{article.treatment}</p></section> : null}{article.recommendation ? <section className="article-guidance"><h3>คำแนะนำเพิ่มเติม</h3><p>{article.recommendation}</p></section> : null}<div className="review-explainer"><Info size={19} /><p>คำแนะนำทั่วไปอาจไม่เหมาะกับทุกคน หากมีอาการผิดปกติควรปรึกษาแพทย์</p></div><button className={saving ? 'button button-primary action-pending' : 'button button-primary'} type="button" disabled={saving} onClick={onSaved}>{saving ? 'กำลังบันทึก…' : saved ? 'นำออกจากรายการที่บันทึก' : 'บันทึกไว้อ่านภายหลัง'}</button></article></div>
}`
  s = regex(s, /function KnowledgePage[\s\S]*?\n}\n\nfunction DoctorPages/, `${knowledgeBlock}\n\nfunction DoctorPages`, 'knowledge patient UI')

  const doctorBlock = `function DoctorPages({ page, setPage, showToast, adminService, auditLogger }: { page: Page; setPage: (page: Page) => void; showToast: (text: string) => void; adminService: AdminService; auditLogger?: AuditLogger }) {
  const [userRecords, setUserRecords] = useState<UserRecord[]>([])
  const [diseaseRecords, setDiseaseRecords] = useState<Disease[]>([])
  const [knowledgeRecords, setKnowledgeRecords] = useState<KnowledgeArticle[]>([])
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null)
  useEffect(() => {
    let cancelled = false
    const requests = [
      adminService.listUsers().then((records) => { if (!cancelled) setUserRecords(records) }),
      adminService.listDiseases().then((records) => { if (!cancelled) setDiseaseRecords(records) }),
      adminService.listKnowledge().then((records) => { if (!cancelled) setKnowledgeRecords(records) }),
      adminService.getDashboard().then((record) => { if (!cancelled) setDashboard(record) }),
    ]
    void Promise.allSettled(requests).then((results) => { if (!cancelled && results.some((result) => result.status === 'rejected')) showToast('โหลดข้อมูลบางส่วนไม่สำเร็จ กรุณาลองใหม่') })
    return () => { cancelled = true }
  }, [adminService, showToast])
  if (page === 'users') return <UserManagement users={userRecords} diseaseRecords={diseaseRecords} setUsers={setUserRecords} showToast={showToast} adminService={adminService} auditLogger={auditLogger} />
  if (page === 'diseases') return <DiseaseManagement diseases={diseaseRecords} setDiseases={setDiseaseRecords} showToast={showToast} adminService={adminService} auditLogger={auditLogger} />
  if (page === 'admin-knowledge') return <KnowledgeManagement articles={knowledgeRecords} diseaseRecords={diseaseRecords} setArticles={setKnowledgeRecords} showToast={showToast} adminService={adminService} />
  return <DoctorHome onNavigate={setPage} users={userRecords} diseaseRecords={diseaseRecords} adminService={adminService} dashboard={dashboard} />
}

function DoctorHome({ onNavigate, users, diseaseRecords, adminService, dashboard }: { onNavigate: (page: Page) => void; users: UserRecord[]; diseaseRecords: Disease[]; adminService: AdminService; dashboard: AdminDashboard | null }) {
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null)
  if (!dashboard) return <div className="page admin-page"><PageTitle eyebrow="Admin workspace" title="ภาพรวมการดูแล" description="กำลังโหลดข้อมูลจากระบบ" /><div className="empty-state"><Clock3 size={32} /><h2>กำลังเตรียมข้อมูลภาพรวม</h2><p>ตัวเลขทั้งหมดจะคำนวณจากข้อมูลจริงในระบบ</p></div></div>
  const maxActivity = Math.max(1, ...dashboard.activityLast7Days.map((day) => day.count))
  const openUser = (userId: string) => setSelectedUser(users.find((user) => user.id === userId) ?? null)
  return <div className="page admin-page"><PageTitle eyebrow="Admin workspace" title="ภาพรวมการดูแล" description="ภาพรวมจากข้อมูลผู้ใช้งานและผลตรวจจริง" action={<button className="button button-primary" type="button" onClick={() => onNavigate('users')}><Plus size={18} />เพิ่มผู้ใช้งาน</button>} /><div className="admin-stat-grid"><AdminStat icon={Users} label="ผู้ใช้งาน Active" value={String(dashboard.activeUsers)} note={\\`จากทั้งหมด ${'${dashboard.totalUsers}'} คน\\`} tone="blue" /><AdminStat icon={ClipboardCheck} label="มีประวัติการตรวจ" value={String(dashboard.usersWithHistory)} note="คำนวณจากผลตรวจที่ยืนยันแล้ว" tone="teal" /><AdminStat icon={AlertTriangle} label="ควรติดตาม" value={String(dashboard.followupCount)} note={\\`มีระดับรุนแรง ${'${dashboard.severeCount}'} คน\\`} tone="amber" /><AdminStat icon={Activity} label="ตรวจล่าสุด" value={dashboard.latestExam?.displayDate ?? '—'} note={dashboard.latestExam?.username ?? 'ยังไม่มีข้อมูล'} tone="blue" /></div><div className="admin-grid"><section className="admin-panel"><div className="section-heading"><div><span className="eyebrow">ต้องตรวจสอบ</span><h2>ผู้ใช้ที่ควรติดตาม</h2></div><button className="text-link" type="button" onClick={() => onNavigate('users')}>ดูทั้งหมด</button></div><div className="followup-list">{dashboard.followups.length ? dashboard.followups.map((item) => <FollowupRow key={item.userId} initials={item.name.slice(0,2)} name={item.name} code={item.username} issue={item.issue} time={item.time} severe={item.severe} onClick={() => openUser(item.userId)} />) : <div className="calendar-empty"><CircleCheck size={22} /><p>ยังไม่มีผู้ใช้ที่เข้าเกณฑ์ติดตาม</p></div>}</div></section><section className="admin-panel"><div className="section-heading"><div><span className="eyebrow">7 วันที่ผ่านมา</span><h2>กิจกรรมการตรวจ</h2></div><span className="status-pill success"><TrendingUp size={15} />{dashboard.completedLast7Days} ครั้ง</span></div><div className="activity-chart">{dashboard.activityLast7Days.map((day) => <div key={day.key}><span style={{ height: \\`${'${Math.max(8, (day.count / maxActivity) * 100)}'}%\\`, opacity: day.count ? 1 : .25 }} /><small>{day.label}</small></div>)}</div><div className="chart-legend"><span><i />การตรวจที่ยืนยันแล้ว</span><strong>เฉลี่ย {dashboard.averagePerDay} ครั้ง/วัน</strong></div></section></div><section className="admin-panel recent-panel"><div className="section-heading"><div><span className="eyebrow">กิจกรรมล่าสุด</span><h2>การตรวจล่าสุด</h2></div><button className="text-link" type="button" onClick={() => onNavigate('users')}>ดูประวัติทั้งหมด</button></div><AdminTable rows={dashboard.recentExaminations} onSelect={(row) => openUser(row.userId)} /></section>{selectedUser ? <UserHistoryModal user={selectedUser} diseaseRecords={diseaseRecords} adminService={adminService} onClose={() => setSelectedUser(null)} /> : null}</div>
}`
  s = regex(s, /function DoctorPages[\s\S]*?\n}\n\nfunction AdminStat/, `${doctorBlock}\n\nfunction AdminStat`, 'doctor dashboard')

  const tableBlock = `function FollowupRow({ initials, name, code, issue, time, severe, onClick }: { initials: string; name: string; code: string; issue: string; time: string; severe?: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick}><span className="avatar">{initials}</span><div><strong>{name}</strong><small>{code} · {time}</small></div><span className={severe ? 'status-pill danger' : 'status-pill attention'}>{issue}</span><ChevronRight size={18} /></button>
}

function AdminTable({ rows, onSelect }: { rows: AdminDashboardRecentExam[]; onSelect: (row: AdminDashboardRecentExam) => void }) {
  if (!rows.length) return <div className="empty-state"><ClipboardCheck size={30} /><h2>ยังไม่มีผลตรวจ</h2><p>เมื่อมีผลตรวจที่ยืนยันแล้ว รายการล่าสุดจะแสดงที่นี่</p></div>
  return <div className="table-wrap"><table><thead><tr><th>ผู้ใช้งาน</th><th>วันที่ตรวจ</th><th>ผลที่พบ</th><th>สถานะ</th><th><span className="visually-hidden">การทำงาน</span></th></tr></thead><tbody>{rows.map((row) => <tr key={row.examinationId}><td><div className="table-user"><span className="avatar">{row.name.slice(0,2)}</span><div><strong>{row.name}</strong><small>{row.username}</small></div></div></td><td>{row.displayDate}</td><td>{row.findings.length ? row.findings.join(', ') : 'ไม่พบภาวะที่ยืนยัน'}</td><td><span className={\\`status-pill ${'${row.status}'}\\`}>{row.status === 'danger' ? 'ควรตรวจสอบ' : row.status === 'attention' ? 'ติดตาม' : 'ปกติ'}</span></td><td><button className="icon-button" type="button" aria-label={\\`ดู ${'${row.name}'}\\`} onClick={() => onSelect(row)}><Eye size={18} /></button></td></tr>)}</tbody></table></div>
}`
  s = regex(s, /function FollowupRow[\s\S]*?\n}\n\ntype UserFormDraft/, `${tableBlock}\n\ntype UserFormDraft`, 'admin table')

  const userHistory = `function UserHistoryModal({ user, diseaseRecords, adminService, onClose }: { user: UserRecord; diseaseRecords: Disease[]; adminService: AdminService; onClose: () => void }) {
  const [selected, setSelected] = useState<Examination | null>(null)
  const [history, setHistory] = useState<Examination[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { let cancelled = false; setLoading(true); void adminService.listUserExaminations(user.id).then((records) => { if (!cancelled) setHistory(records) }).catch(() => { if (!cancelled) setHistory([]) }).finally(() => { if (!cancelled) setLoading(false) }); return () => { cancelled = true } }, [adminService, user.id])
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="detail-modal user-history-modal" role="dialog" aria-modal="true" aria-labelledby="user-history-title"><header><div><span className="eyebrow">ประวัติผู้ใช้งาน · {user.username}</span><h2 id="user-history-title">{user.name}</h2><p>ผลตรวจย้อนหลังจากฐานข้อมูลสำหรับการติดตาม</p></div><button className="icon-button" type="button" aria-label="ปิด" onClick={onClose}><X size={21} /></button></header>{loading ? <div className="empty-state user-history-empty"><Clock3 size={32} /><h2>กำลังโหลดประวัติ</h2><p>กรุณารอสักครู่…</p></div> : history.length ? <div className="user-history-list">{history.map((exam) => <button className="user-history-card" type="button" key={exam.id} onClick={() => setSelected(exam)}><span className="user-history-date"><strong>{exam.displayDate.split(' ')[0]}</strong><small>{exam.displayDate.split(' ').slice(1).join(' ')}</small><small>{exam.time} น.</small></span><span className="user-history-summary"><strong>พบ {exam.findings.length} รายการ</strong><small>{exam.findings.map((finding) => \\`${'${finding.name} · ${finding.severity}'}\\`).join(' / ') || 'ไม่พบภาวะที่ยืนยัน'}</small></span><ChevronRight size={19} /></button>)}</div> : <div className="empty-state user-history-empty"><ClipboardCheck size={32} /><h2>ยังไม่มีประวัติการตรวจ</h2><p>เมื่อผู้ใช้งานส่งผลตรวจแล้ว รายการจะแสดงในส่วนนี้</p></div>}<button className="button button-primary" type="button" onClick={onClose}>ปิดประวัติ</button></section>{selected ? <ExaminationDetail exam={selected} diseaseRecords={diseaseRecords} onClose={() => setSelected(null)} /> : null}</div>
}`
  s = regex(s, /function UserHistoryModal[\s\S]*?\n}\n\nfunction UserFormModal/, `${userHistory}\n\nfunction UserFormModal`, 'user history')

  s = s.replace(/function DiseaseManagement\(\{ diseases: diseaseRecords, setDiseases, showToast, adminService, auditLogger \}: \{ diseases: typeof diseases; setDiseases: React\.Dispatch<React\.SetStateAction<typeof diseases>>;/, 'function DiseaseManagement({ diseases: diseaseRecords, setDiseases, showToast, adminService, auditLogger }: { diseases: Disease[]; setDiseases: React.Dispatch<React.SetStateAction<Disease[]>>;')
  s = s.replace('รูปจะถูกเก็บเป็น preview ใน prototype; production จะอัปโหลดไป storage ที่กำหนด', 'เมื่อบันทึก ระบบจะอัปโหลดรูปไปยังพื้นที่จัดเก็บส่วนตัวของ DM Foot Care')
  s = s.replaceAll("photo && photo !== 'demo'", 'photo')
  s = s.replaceAll("!photo || photo === 'demo'", '!photo')
  s = s.replaceAll("photo === 'demo' || !photo", '!photo')
  s = s.replace("useState<QualityState>(photo === 'demo' ? 'passed' : 'idle')", "useState<QualityState>('idle')")
  s = regex(s, /  const \[qualityResult, setQualityResult\] = useState<QualityResult \| null>\(photo === 'demo'[\s\S]*?\)\n/, "  const [qualityResult, setQualityResult] = useState<QualityResult | null>(null)\n", 'demo quality state')
  s = regex(s, /\n  const useDemoPhoto = \(\) => \{[\s\S]*?\n  \}\n/, '\n', 'demo photo helper')
  s = s.replace(/\n\s*<button className="text-button demo-photo-button"[\s\S]*?<\/button>/, '')
  s = s.replace(/\n\s*\{photo === 'demo' \? <div className="demo-foot-photo"><FourFrameIllustration \/><\/div> : null\}/, '')

  s = s.replace("function ExaminationFlow({ profile, diseaseRecords, integrations, stage, setStage, onHome, onCompleted }: { profile: Profile; diseaseRecords: Disease[]; integrations: RuntimeIntegrations | null;", "function ExaminationFlow({ profile, diseaseRecords, integrations, stage, setStage, onHome, onCompleted }: { profile: Profile; diseaseRecords: Disease[]; integrations: RuntimeIntegrations;")
  s = s.replace('useState(() => cloneFindings(mockFindings))', 'useState<Finding[]>([])')
  s = s.replace("const examinationIdRef = useRef(integrations ? '' : 'EX-DEMO-1')", "const examinationIdRef = useRef('')")
  s = s.replace('useRef<OriginalImageArchive>(integrations?.archive ?? new InMemoryOriginalImageArchive())', 'useRef<OriginalImageArchive>(integrations.archive)')
  s = s.replace('useRef<ExaminationRepository>(integrations?.repository ?? new InMemoryExaminationRepository())', 'useRef<ExaminationRepository>(integrations.repository)')
  s = s.replace('useRef<ThumbnailService>(integrations?.thumbnails ?? new BrowserThumbnailService())', 'useRef<ThumbnailService>(integrations.thumbnails)')
  s = regex(s, /\n    if \(!integrations\) \{\n      examinationIdRef\.current = `EX-DEMO-\$\{Date\.now\(\)\}`\n      return true\n    \}/, '', 'demo examination draft')
  s = s.replace('const provider: FootAssessmentProvider = integrations?.provider ?? new MockFootAssessmentProvider(toMockDiseaseMaster(diseaseRecords))', 'const provider: FootAssessmentProvider = integrations.provider')
  s = s.replaceAll('integrations?.audit', 'integrations.audit')
  s = regex(s, /  const reset = \(\) => \{[\s\S]*?setStage\('intro'\)\n  \}/, `  const reset = () => {
    clearExaminationDraft(); setDraftHint(null); setStep(0); setPhotos({}); setThumbnails({}); setCompletedExam(null); setAiFindings([]); setConfirmedFindings([]); setAnalysisError(''); setFinalizeError(''); setAnalysisAttempt(0); setIsFinalizing(false); thumbnailJobRef.current = null; draftJobRef.current = null; examinationIdRef.current = ''; archiveRef.current = integrations.archive; repositoryRef.current = integrations.repository; thumbnailServiceRef.current = integrations.thumbnails; setStage('intro')
  }`, 'exam reset')

  if (s.includes('MockFootAssessmentProvider') || s.includes('InMemoryExaminationRepository') || s.includes('demoAccounts') || s.includes('ใช้ภาพตัวอย่างสำหรับทดลอง')) throw new Error('Mock runtime references remain in App.tsx')
  return s
})

update('src/services/httpAdapters.ts', (input) => {
  let s = input
  const knowledgeClass = `export class HttpKnowledgeLibraryService implements KnowledgeLibraryService {
  private readonly client: BackendHttpClient
  constructor(client: BackendHttpClient) { this.client = client }
  async listPublished(): Promise<{ articles: import('../types.ts').KnowledgeArticle[]; diseases: import('../types.ts').Disease[] }> {
    const response = await this.client.get<{ articles?: import('../types.ts').KnowledgeArticle[]; diseases?: import('../types.ts').Disease[] } | import('../types.ts').KnowledgeArticle[]>('/v1/knowledge')
    if (Array.isArray(response)) return { articles: response, diseases: [] }
    return { articles: response.articles ?? [], diseases: normalizeDiseaseList(response.diseases) }
  }
  async listSavedArticleIds(): Promise<string[]> {
    const response = await this.client.get<{ articleIds?: string[] }>('/v1/knowledge/saved')
    return Array.isArray(response.articleIds) ? response.articleIds : []
  }
  async setSaved(articleId: string, saved: boolean): Promise<void> {
    await this.client.postJson('/v1/knowledge/saved', { articleId, saved })
  }
}`
  s = regex(s, /export class HttpKnowledgeLibraryService[\s\S]*?\n}\n\nexport class HttpAdminService/, `${knowledgeClass}\n\nexport class HttpAdminService`, 'knowledge adapter')
  s = exact(s, "  constructor(client: BackendHttpClient) {\n    this.client = client\n  }\n\n  async listUsers()", "  constructor(client: BackendHttpClient) {\n    this.client = client\n  }\n\n  async getDashboard(): Promise<import('../types.ts').AdminDashboard> {\n    return this.client.get('/v1/admin/dashboard')\n  }\n\n  async listUsers()", 'admin dashboard adapter')
  return s
})

update('backend/api/v1/knowledge.mjs', (input) => input.replace("select=disease_id,label,rank,criteria", "select=id,disease_id,label,rank,criteria"))

update('README.md', (input) => {
  let s = input
  s = s.replace('Functional frontend prototype สำหรับระบบติดตามสุขภาพเท้าแบบ mobile-first ตามเอกสาร Requirement ในโฟลเดอร์นี้', 'DM Foot Care ระบบติดตามสุขภาพเท้าแบบ mobile-first ที่เชื่อม Supabase, Google Drive, Gemini และ Vercel API สำหรับการใช้งานจริงในโครงการนำร่อง')
  s = s.replace(/\nบัญชีทดลอง:[\s\S]*?\n## สิ่งที่ทดลองได้/, '\n## ความสามารถหลัก')
  s = s.replace(/- Session demo[^\n]*\n/g, '')
  s = s.replace(/## ขอบเขตสำคัญ[\s\S]*?## ตรวจสอบคุณภาพ/, `## ขอบเขตสำคัญ\n\nBrowser runtime ไม่มี silent mock/demo fallback หาก Backend มีปัญหา ระบบจะแสดงสถานะว่างหรือข้อผิดพลาดแทนการใส่ข้อมูลตัวอย่าง ผู้ใช้งาน Production ต้องผ่าน Backend API และข้อมูลจริงเท่านั้น\n\n## ตรวจสอบคุณภาพ`)
  return s
})

console.log('Production hardening codemod complete')
