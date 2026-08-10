import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bell,
  BookOpen,
  CalendarDays,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  ClipboardCheck,
  Clock3,
  Eye,
  FileCheck2,
  Footprints,
  HeartPulse,
  History,
  Home,
  Image as ImageIcon,
  Info,
  LayoutDashboard,
  Library,
  List,
  LogOut,
  MoreHorizontal,
  Plus,
  RotateCcw,
  ScanLine,
  Search,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  TrendingDown,
  TrendingUp,
  Type,
  UserRound,
  VideoOff,
  SwitchCamera,
  Users,
  WifiOff,
  X,
} from 'lucide-react'
import { diseases, doctorProfile, examinations, footSteps, knowledgeArticles, patientProfile, userExaminations, users as seededUsers } from './data'
import { clearExaminationDraft, readExaminationDraft, saveExaminationDraft } from './services/draftStorage'
import type { AuditLogger } from './services/auditLog'
import { examinationPositions, runAnalysisWorkflow } from './services/analysisWorkflow'
import { finalizeExamination } from './services/finalizeWorkflow'
import { MockFootAssessmentProvider, toMockDiseaseMaster } from './services/mockAiProvider'
import { BrowserThumbnailService, InMemoryExaminationRepository, InMemoryOriginalImageArchive, photosToBlobs } from './services/mockPipelineAdapters'
import { calculateAge, calculateGeneration, withDerivedProfile } from './services/profileMetrics'
import { evaluateImageQuality, type ImageQualityResult } from './services/imageQuality'
import { createRuntimeIntegrationState, type RuntimeIntegrations } from './services/runtimeIntegrations'
import { createAnalysisImages } from './services/thumbnailService'
import type { AdminService, AuthService, ExaminationRepository, FootAssessmentProvider, OriginalImageArchive, ThumbnailService } from './services/contracts'
import type { Disease, DiseaseSeverityLevel, Examination, Finding, FootPosition, KnowledgeArticle, Page, Profile, Role, Severity, UserRecord } from './types'

type ExamStage = 'intro' | 'capture' | 'review' | 'processing' | 'human-review' | 'summary'
type HistoryView = 'list' | 'calendar' | 'insight'

const severityRank: Record<Severity, number> = { เล็กน้อย: 1, ปานกลาง: 2, รุนแรง: 3 }
const severityOrder: readonly Severity[] = ['เล็กน้อย', 'ปานกลาง', 'รุนแรง']

function getDiseaseSeverityLevels(disease?: Pick<Disease, 'severityLevels' | 'severityCriteria'>): DiseaseSeverityLevel[] {
  if (disease?.severityLevels?.length) {
    return [...disease.severityLevels].sort((left, right) => left.rank - right.rank)
  }
  const parsed = new Map<Severity, string>()
  for (const segment of (disease?.severityCriteria ?? '').split('·')) {
    const separator = segment.indexOf(':')
    if (separator < 0) continue
    const label = segment.slice(0, separator).trim() as Severity
    if (label in severityRank) parsed.set(label, segment.slice(separator + 1).trim())
  }
  return severityOrder.map((label, index) => ({ label, rank: index + 1, criteria: parsed.get(label) ?? '' }))
}

function serializeSeverityLevels(levels: readonly DiseaseSeverityLevel[]): string {
  return levels.filter((level) => level.criteria.trim()).map((level) => `${level.label}: ${level.criteria.trim()}`).join(' · ')
}

const patientNav: { page: Page; label: string; icon: typeof Home }[] = [
  { page: 'home', label: 'หน้าหลัก', icon: Home },
  { page: 'exam', label: 'ตรวจเท้า', icon: ScanLine },
  { page: 'history', label: 'ประวัติ', icon: History },
  { page: 'knowledge', label: 'คลังความรู้', icon: BookOpen },
]

const doctorNav: { page: Page; label: string; icon: typeof Home }[] = [
  { page: 'admin-home', label: 'ภาพรวม', icon: LayoutDashboard },
  { page: 'users', label: 'ผู้ใช้งาน', icon: Users },
  { page: 'diseases', label: 'รายการภาวะ', icon: Stethoscope },
  { page: 'admin-knowledge', label: 'คลังความรู้', icon: Library },
]

const mockFindings: Finding[] = [
  { diseaseId: 'D001', name: 'ผิวแห้ง', detected: true, severity: 'ปานกลาง', confidence: 91, comparison: 'ดีขึ้น' },
  { diseaseId: 'D002', name: 'หนังด้าน', detected: true, severity: 'เล็กน้อย', confidence: 86, comparison: 'คงที่' },
  { diseaseId: 'D003', name: 'แผลที่เท้า', detected: false, severity: 'เล็กน้อย', confidence: 94, comparison: 'คงที่' },
]

const demoAccounts: Record<string, { pin: string; role: Role }> = {
  DM001: { pin: '1234', role: 'user' },
  ADMIN: { pin: '1234', role: 'admin' },
}

function cloneFindings(findings: Finding[]): Finding[] {
  return findings.map((finding) => ({ ...finding }))
}

function formatThaiDate(date: Date): string {
  return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
}

function formatThaiShortDate(date: Date): string {
  return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}

function formatExamTime(date: Date): string {
  return new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
}

function App() {
  const runtimeState = useMemo(() => createRuntimeIntegrationState({ VITE_DMFC_API_BASE_URL: import.meta.env.VITE_DMFC_API_BASE_URL }), [])
  const integrations = runtimeState.integrations
  const [profile, setProfile] = useState<Profile | null>(() => {
    if (integrations) return null
    const savedRole = window.localStorage.getItem('dmfc-demo-role') as Role | null
    return savedRole === 'admin' ? withDerivedProfile(doctorProfile) : savedRole === 'user' ? withDerivedProfile(patientProfile) : null
  })
  const [page, setPage] = useState<Page>(profile?.role === 'admin' ? 'admin-home' : 'home')
  const [restoring, setRestoring] = useState(Boolean(integrations))
  const [profileOpen, setProfileOpen] = useState(false)
  const [profileDialog, setProfileDialog] = useState<'profile' | 'accessibility' | null>(null)
  const [toast, setToast] = useState('')
  const [examStage, setExamStage] = useState<ExamStage>('intro')
  const [patientExaminations, setPatientExaminations] = useState(examinations)
  const [patientKnowledge, setPatientKnowledge] = useState(knowledgeArticles)
  const [patientDiseases, setPatientDiseases] = useState(diseases)

  const loadPatientExaminations = useCallback(async () => {
    if (!integrations?.repository.listForCurrentUser) return
    try {
      setPatientExaminations(await integrations.repository.listForCurrentUser())
    } catch {
      // Keep the authenticated shell usable; the backend can expose a retry UI later.
    }
  }, [integrations])

  const loadPatientKnowledge = useCallback(async () => {
    if (!integrations?.knowledge) return
    try {
      const content = await integrations.knowledge.listPublished()
      setPatientKnowledge(content.articles)
      if (content.diseases.length) setPatientDiseases(content.diseases)
    } catch {
      // Keep the patient shell usable with the last known content if the API is unavailable.
    }
  }, [integrations])

  useEffect(() => {
    if (!integrations) return
    let cancelled = false
    void integrations.auth.restoreSession().then((restored) => {
      if (cancelled || !restored) return
      const nextProfile = withDerivedProfile(restored)
      setProfile(nextProfile)
      setPage(nextProfile.role === 'admin' ? 'admin-home' : 'home')
      if (nextProfile.role === 'user') {
        void loadPatientExaminations()
        void loadPatientKnowledge()
      }
    }).catch(() => {
      // Keep the login screen actionable when the backend is temporarily unavailable.
    }).finally(() => {
      if (!cancelled) setRestoring(false)
    })
    return () => { cancelled = true }
  }, [integrations, loadPatientExaminations, loadPatientKnowledge])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(''), 3200)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const login = (authenticatedProfile: Profile) => {
    const nextProfile = withDerivedProfile(authenticatedProfile)
    if (!integrations) window.localStorage.setItem('dmfc-demo-role', nextProfile.role)
    setProfile(nextProfile)
    setPage(nextProfile.role === 'admin' ? 'admin-home' : 'home')
    void integrations?.audit.append({ actorId: nextProfile.id, eventType: 'login', entityType: 'session', entityId: nextProfile.id, payload: { role: nextProfile.role } }).catch(() => {})
    if (nextProfile.role === 'user') {
      void loadPatientExaminations()
      void loadPatientKnowledge()
    }
  }

  const logout = () => {
    if (integrations && profile) {
      void integrations.audit.append({ actorId: profile.id, eventType: 'logout', entityType: 'session', entityId: profile.id, payload: { role: profile.role } }).catch(() => {})
    }
    if (integrations) {
      void integrations.auth.signOut().catch(() => {})
      runtimeState.setAccessToken(null)
    } else {
      window.localStorage.removeItem('dmfc-demo-role')
    }
    setProfile(null)
    setPatientExaminations(examinations)
    setPatientKnowledge(knowledgeArticles)
    setPatientDiseases(diseases)
    setProfileOpen(false)
    setProfileDialog(null)
    setExamStage('intro')
  }

  const goTo = (nextPage: Page) => {
    setPage(nextPage)
    setProfileOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (restoring) return <main className="app-boot" aria-live="polite"><div className="boot-card"><BrandMark /><div className="boot-copy"><strong>DM Foot Care</strong><span>กำลังเตรียมข้อมูล…</span></div><div className="boot-progress"><span /></div></div></main>
  if (!profile) return <LoginScreen onLogin={login} authService={integrations?.auth} />

  const navItems = profile.role === 'admin' ? doctorNav : patientNav

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">ข้ามไปยังเนื้อหาหลัก</a>
      <DesktopRail profile={profile} page={page} navItems={navItems} onNavigate={goTo} onLogout={logout} />
      <div className="app-column">
        <TopBar
          profile={profile}
          open={profileOpen}
          onToggle={() => setProfileOpen((value) => !value)}
          onLogout={logout}
          onProfile={() => { setProfileDialog('profile'); setProfileOpen(false) }}
          onAccessibility={() => { setProfileDialog('accessibility'); setProfileOpen(false) }}
        />
        <main id="main-content" className="main-content">
          {profile.role === 'user' ? (
              <PatientPages
              profile={profile}
              page={page}
              setPage={goTo}
              examStage={examStage}
              setExamStage={setExamStage}
              examinations={patientExaminations}
              knowledgeArticles={patientKnowledge}
              diseaseRecords={patientDiseases}
              integrations={integrations}
              onExamCompleted={(exam) => setPatientExaminations((current) => [exam, ...current.filter((item) => item.id !== exam.id)])}
              showToast={setToast}
            />
          ) : (
            <DoctorPages page={page} setPage={goTo} showToast={setToast} adminService={integrations?.admin} auditLogger={integrations?.audit} />
          )}
        </main>
        {page !== 'exam' ? <MobileNav page={page} items={navItems} onNavigate={goTo} /> : null}
      </div>
      {toast ? <div className="toast" role="status"><CircleCheck size={19} />{toast}</div> : null}
      {profileDialog ? <ProfileDialog profile={profile} mode={profileDialog} onClose={() => setProfileDialog(null)} /> : null}
    </div>
  )
}

function LoginScreen({ onLogin, authService }: { onLogin: (profile: Profile) => void; authService?: AuthService }) {
  const [username, setUsername] = useState(authService ? '' : 'DM001')
  const [pin, setPin] = useState(authService ? '' : '1234')
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [registration, setRegistration] = useState({ username: '', displayName: '', dateOfBirth: '', occupation: '', pin: '', confirmPin: '' })
  const [registrationComplete, setRegistrationComplete] = useState(false)
  const [showDemo, setShowDemo] = useState(false)
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
    if (authService) {
      try {
        onLogin(await authService.signInWithUsername(normalizedUsername, pin))
      } catch {
        setError('เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบข้อมูลหรือลองใหม่อีกครั้ง')
      } finally {
        setSubmitting(false)
      }
      return
    }
    const account = demoAccounts[normalizedUsername]
    if (!account || account.pin !== pin) {
      setSubmitting(false)
      setError('ชื่อผู้ใช้หรือ PIN ไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง')
      return
    }
    window.setTimeout(() => {
      onLogin(withDerivedProfile(account.role === 'admin' ? doctorProfile : patientProfile))
      setSubmitting(false)
    }, 550)
  }

  const fillDemo = (role: Role) => {
    setUsername(role === 'admin' ? 'ADMIN' : 'DM001')
    setPin('1234')
    setShowDemo(false)
    setError('')
  }

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    if (!authService) return
    const normalizedUsername = registration.username.trim().toUpperCase()
    if (!normalizedUsername || !registration.displayName.trim() || !registration.dateOfBirth || !registration.occupation.trim()) {
      setError('กรุณากรอกข้อมูลลงทะเบียนให้ครบทุกช่อง')
      return
    }
    if (!/^\d{4}$/.test(registration.pin) || registration.pin !== registration.confirmPin) {
      setError('กรุณากรอก PIN 4 หลักให้ตรงกันทั้งสองช่อง')
      return
    }
    setSubmitting(true)
    try {
      await authService.register({
        username: normalizedUsername,
        displayName: registration.displayName.trim(),
        dateOfBirth: registration.dateOfBirth,
        occupation: registration.occupation.trim(),
        pin: registration.pin,
      })
      setRegistrationComplete(true)
    } catch (registerError) {
      setError(registerError instanceof Error ? registerError.message : 'ลงทะเบียนไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setSubmitting(false)
    }
  }

  const updateRegistration = (key: keyof typeof registration, value: string) => setRegistration((current) => ({ ...current, [key]: value }))

  return (
    <main className="login-page">
      <section className="login-visual" aria-label="DM Foot Care">
        <div className="brand brand-on-blue login-brand-lockup"><BrandMark /><span>DM Foot Care</span></div>
        <div className="login-message">
          <span className="eyebrow eyebrow-light">ดูแลอย่างต่อเนื่อง</span>
          <h1>ทุกก้าว เริ่มจาก<br />การใส่ใจเท้า</h1>
          <p>ติดตามสุขภาพเท้าอย่างเป็นขั้นตอน พร้อมคำแนะนำสำหรับการดูแลอย่างต่อเนื่อง</p>
        </div>
        <FourFrameIllustration />
        <div className="clinical-note"><ShieldCheck size={18} /><span>ข้อมูลและรูปภาพจัดเก็บแบบเป็นส่วนตัว</span></div>
      </section>

      <section className="login-panel">
        <div className="mobile-login-brand brand login-brand-lockup"><BrandMark /><span>DM Foot Care</span></div>
        <div className="login-form-wrap">
          {mode === 'login' ? <><div className="login-heading">
            <span className="eyebrow">ยินดีต้อนรับ</span>
            <h2>เข้าสู่ระบบ</h2>
            <p>กรอกชื่อผู้ใช้และ PIN ของคุณ</p>
          </div>
          <form onSubmit={handleLogin} noValidate>
            <label className="field-label" htmlFor="username">ชื่อผู้ใช้</label>
            <div className="input-wrap"><UserRound size={20} /><input id="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="เช่น DM001" /></div>
            <label className="field-label" htmlFor="pin">PIN 4 หลัก</label>
            <div className="input-wrap"><ShieldCheck size={20} /><input id="pin" inputMode="numeric" autoComplete="current-password" maxLength={4} type="password" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))} placeholder="••••" /></div>
            {error ? <div className="form-error" role="alert"><AlertTriangle size={18} />{error}</div> : null}
            <button className={submitting ? 'button button-primary button-large action-pending' : 'button button-primary button-large'} type="submit" disabled={submitting}>{submitting ? 'กำลังเข้าสู่ระบบ…' : <>เข้าสู่ระบบ <ArrowRight size={20} /></>}</button>
          </form>
          {authService ? <button className="login-mode-switch" type="button" onClick={() => { setMode('register'); setError('') }}>ยังไม่มีบัญชี? ลงทะเบียนใช้งาน</button> : null}
          {!authService ? <div className="demo-access">
            <button className="text-button" type="button" aria-expanded={showDemo} onClick={() => setShowDemo((value) => !value)}>บัญชีสำหรับทดลองใช้ <ChevronDown size={16} /></button>
            {showDemo ? (
              <div className="demo-options">
                <button type="button" onClick={() => fillDemo('user')}><UserRound size={18} /><span><strong>User</strong><small>DM001 / 1234</small></span></button>
                <button type="button" onClick={() => fillDemo('admin')}><Stethoscope size={18} /><span><strong>Admin</strong><small>ADMIN / 1234</small></span></button>
              </div>
            ) : null}
          </div> : null}
          <p className="login-support">มีปัญหาในการเข้าสู่ระบบ? ติดต่อผู้ดูแลระบบ</p></> : registrationComplete ? <div className="registration-success"><CircleCheck size={42} /><span className="eyebrow">ลงทะเบียนสำเร็จ</span><h2>รอ Admin อนุมัติบัญชี</h2><p>เมื่อบัญชีได้รับอนุมัติแล้ว คุณจะเข้าสู่ระบบด้วย Username และ PIN ที่ตั้งไว้ได้</p><button className="button button-primary button-large" type="button" onClick={() => { setUsername(registration.username.trim().toUpperCase()); setMode('login'); setRegistrationComplete(false); setError('') }}>กลับไปหน้าเข้าสู่ระบบ</button></div> : <><div className="login-heading"><span className="eyebrow">บัญชีใหม่</span><h2>ลงทะเบียนใช้งาน</h2><p>กรอกข้อมูลให้ครบ แล้วรอ Admin อนุมัติบัญชี</p></div><form className="registration-form" onSubmit={handleRegister} noValidate><label className="field-label" htmlFor="register-username">Username</label><input id="register-username" autoComplete="username" value={registration.username} onChange={(event) => updateRegistration('username', event.target.value)} placeholder="ใช้ A-Z, 0-9, _ หรือ -" /><label className="field-label" htmlFor="register-name">ชื่อ-นามสกุล</label><input id="register-name" autoComplete="name" value={registration.displayName} onChange={(event) => updateRegistration('displayName', event.target.value)} /><div className="registration-grid"><div><label className="field-label" htmlFor="register-dob">วันเดือนปีเกิด</label><input id="register-dob" type="date" value={registration.dateOfBirth} onChange={(event) => updateRegistration('dateOfBirth', event.target.value)} /></div><div><label className="field-label" htmlFor="register-occupation">อาชีพ</label><input id="register-occupation" value={registration.occupation} onChange={(event) => updateRegistration('occupation', event.target.value)} /></div></div><div className="registration-grid"><div><label className="field-label" htmlFor="register-pin">ตั้ง PIN 4 หลัก</label><input id="register-pin" type="password" inputMode="numeric" maxLength={4} autoComplete="new-password" value={registration.pin} onChange={(event) => updateRegistration('pin', event.target.value.replace(/\D/g, '').slice(0, 4))} /></div><div><label className="field-label" htmlFor="register-confirm-pin">ยืนยัน PIN</label><input id="register-confirm-pin" type="password" inputMode="numeric" maxLength={4} autoComplete="new-password" value={registration.confirmPin} onChange={(event) => updateRegistration('confirmPin', event.target.value.replace(/\D/g, '').slice(0, 4))} /></div></div>{error ? <div className="form-error" role="alert"><AlertTriangle size={18} />{error}</div> : null}<button className={submitting ? 'button button-primary button-large action-pending' : 'button button-primary button-large'} type="submit" disabled={submitting}>{submitting ? 'กำลังส่งข้อมูล…' : 'ส่งคำขอลงทะเบียน'}</button></form><button className="login-mode-switch" type="button" onClick={() => { setMode('login'); setError('') }}>มีบัญชีแล้ว? กลับไปเข้าสู่ระบบ</button></>}
        </div>
      </section>
    </main>
  )
}

function BrandMark() {
  return <span className="brand-mark" aria-hidden="true"><Footprints size={20} /></span>
}

function FourFrameIllustration() {
  return (
    <div className="four-frame-art" aria-hidden="true">
      <div className="frame-cross frame-cross-v" /><div className="frame-cross frame-cross-h" />
      <div className="foot-shape foot-left"><span /><span /><span /><span /><span /></div>
      <div className="foot-shape foot-right"><span /><span /><span /><span /><span /></div>
      <span className="scan-corner top-left" /><span className="scan-corner top-right" /><span className="scan-corner bottom-left" /><span className="scan-corner bottom-right" />
    </div>
  )
}

function DesktopRail({ profile, page, navItems, onNavigate, onLogout }: { profile: Profile; page: Page; navItems: typeof patientNav; onNavigate: (page: Page) => void; onLogout: () => void }) {
  return (
    <aside className="desktop-rail">
      <div className="brand"><BrandMark /><span>DM Foot Care</span></div>
      <nav aria-label="เมนูหลัก">
        {navItems.map((item) => <NavButton key={item.page} item={item} active={page === item.page} onNavigate={onNavigate} />)}
      </nav>
      <div className="rail-user">
        <Avatar profile={profile} />
        <div><strong>{profile.displayName}</strong><small>{profile.role === 'admin' ? 'Admin' : profile.username}</small></div>
        <button className="icon-button" type="button" aria-label="ออกจากระบบ" onClick={onLogout}><LogOut size={18} /></button>
      </div>
    </aside>
  )
}

function MobileNav({ page, items, onNavigate }: { page: Page; items: typeof patientNav; onNavigate: (page: Page) => void }) {
  return (
    <nav className="mobile-nav" aria-label="เมนูหลัก">
      {items.map((item) => <NavButton key={item.page} item={item} active={page === item.page} onNavigate={onNavigate} />)}
    </nav>
  )
}

function NavButton({ item, active, onNavigate }: { item: (typeof patientNav)[number]; active: boolean; onNavigate: (page: Page) => void }) {
  const Icon = item.icon
  return <button className={active ? 'nav-item active' : 'nav-item'} type="button" aria-current={active ? 'page' : undefined} onClick={() => onNavigate(item.page)}><Icon size={21} /><span>{item.label}</span></button>
}

function TopBar({ profile, open, onToggle, onLogout, onProfile, onAccessibility }: { profile: Profile; open: boolean; onToggle: () => void; onLogout: () => void; onProfile: () => void; onAccessibility: () => void }) {
  return (
    <header className="top-bar">
      <div className="mobile-brand brand"><BrandMark /><span>DM Foot Care</span></div>
      <div className="desktop-page-context"><span className="secure-dot" /> ระบบติดตามสุขภาพเท้าแบบส่วนตัว</div>
      <div className="top-actions">
        <button className="icon-button notification-button" type="button" aria-label="การแจ้งเตือน"><Bell size={20} /><span /></button>
        <div className="profile-control" onKeyDown={(event) => { if (event.key === 'Escape' && open) onToggle() }}>
          <button className="profile-button" type="button" aria-expanded={open} aria-haspopup="menu" aria-controls="profile-menu" onClick={onToggle}><Avatar profile={profile} /><span>{profile.displayName}</span><ChevronDown size={16} /></button>
          {open ? (
            <div className="profile-menu" id="profile-menu" role="menu">
              <div><strong>{profile.displayName}</strong><span>{profile.username} · {profile.role === 'admin' ? 'Admin' : 'User'}</span></div>
              <button role="menuitem" type="button" onClick={onProfile}><UserRound size={18} />ข้อมูลของฉัน</button>
              <button role="menuitem" type="button" onClick={onAccessibility}><Info size={18} />การช่วยเหลือการใช้งาน</button>
              <button role="menuitem" type="button" onClick={onLogout}><LogOut size={18} />ออกจากระบบ</button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  )
}

function ProfileDialog({ profile, mode, onClose }: { profile: Profile; mode: 'profile' | 'accessibility'; onClose: () => void }) {
  const isProfile = mode === 'profile'
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="detail-modal profile-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-dialog-title"><header><div><span className="eyebrow">{isProfile ? 'ข้อมูลส่วนตัว' : 'การช่วยเหลือการใช้งาน'}</span><h2 id="profile-dialog-title">{isProfile ? 'ข้อมูลของฉัน' : 'ใช้งานได้ง่ายสำหรับทุกคน'}</h2><p>{isProfile ? 'ข้อมูลที่ใช้ระบุบัญชีในโครงการ DM Foot Care' : 'คำแนะนำสำหรับการใช้งานบนโทรศัพท์และคอมพิวเตอร์'}</p></div><button className="icon-button" type="button" aria-label="ปิด" onClick={onClose}><X size={21} /></button></header>{isProfile ? <div className="profile-dialog-content"><div className="profile-dialog-identity"><Avatar profile={profile} /><div><strong>{profile.displayName}</strong><span>{profile.username} · {profile.role === 'admin' ? 'Admin' : 'User'}</span></div></div><dl className="profile-facts-list"><div><dt>วันเกิด</dt><dd>{profile.dateOfBirth}</dd></div><div><dt>อายุ</dt><dd>{profile.age} ปี</dd></div><div><dt>อาชีพ</dt><dd>{profile.occupation}</dd></div></dl><div className="privacy-note"><ShieldCheck size={20} /><span>ข้อมูลและรูปภาพใช้ภายในโครงการ และไม่เผยแพร่สู่สาธารณะ</span></div></div> : <ul className="accessibility-list"><li><span><Type size={19} /></span><div><strong>อ่านข้อความได้ง่าย</strong><p>ใช้ภาษาไทยสั้น กระชับ และมีหัวข้อบอกขั้นตอนชัดเจน</p></div></li><li><span><ScanLine size={19} /></span><div><strong>ปุ่มใหญ่ กดง่าย</strong><p>ปุ่มหลักและจุดกดสำคัญออกแบบให้เหมาะกับหน้าจอสัมผัส</p></div></li><li><span><Info size={19} /></span><div><strong>ถ้าเจอปัญหา</strong><p>อ่านข้อความแจ้งเตือนและทำตามวิธีแก้ หากยังไม่สำเร็จให้ติดต่อเจ้าหน้าที่โครงการ</p></div></li></ul>}<button className="button button-primary button-large" type="button" onClick={onClose}>ปิด</button></section></div>
}

function Avatar({ profile }: { profile: Profile }) {
  return <span className={profile.role === 'admin' ? 'avatar doctor' : 'avatar'} aria-hidden="true">{profile.role === 'admin' ? 'AD' : profile.displayName.slice(0, 2)}</span>
}

function PatientPages({ profile, page, setPage, examStage, setExamStage, examinations: patientExaminations, knowledgeArticles: patientKnowledge, diseaseRecords: patientDiseases, integrations, onExamCompleted, showToast }: { profile: Profile; page: Page; setPage: (page: Page) => void; examStage: ExamStage; setExamStage: (stage: ExamStage) => void; examinations: Examination[]; knowledgeArticles: KnowledgeArticle[]; diseaseRecords: Disease[]; integrations: RuntimeIntegrations | null; onExamCompleted: (exam: Examination) => void; showToast: (text: string) => void }) {
  if (page === 'exam') return <ExaminationFlow profile={profile} diseaseRecords={patientDiseases} integrations={integrations} stage={examStage} setStage={setExamStage} onHome={() => setPage('home')} onCompleted={onExamCompleted} />
  if (page === 'history') return <HistoryPage examinations={patientExaminations} diseaseRecords={patientDiseases} />
  if (page === 'knowledge') return <KnowledgePage articles={patientKnowledge} diseaseRecords={patientDiseases} showToast={showToast} />
  return <PatientHome profile={profile} examinations={patientExaminations} onStart={() => { setExamStage('intro'); setPage('exam') }} onResume={() => { const draft = readExaminationDraft(); if (draft) { setExamStage(draft.stage); setPage('exam') } }} onHistory={() => setPage('history')} onKnowledge={() => setPage('knowledge')} />
}

function PatientHome({ profile, examinations: patientExaminations, onStart, onResume, onHistory, onKnowledge }: { profile: Profile; examinations: Examination[]; onStart: () => void; onResume: () => void; onHistory: () => void; onKnowledge: () => void }) {
  const latest = patientExaminations[0]
  const hasDraft = Boolean(readExaminationDraft())
  const latestFindings = latest?.findings ?? []
  const latestSeverity = latestFindings.length ? latestFindings.reduce((highest, finding) => severityRank[finding.severity] > severityRank[highest] ? finding.severity : highest, latestFindings[0].severity) : null
  const latestSummary = latestFindings.length ? (latestSeverity === 'รุนแรง' ? 'ควรพบแพทย์' : 'ควรติดตาม') : 'ยังไม่พบภาวะ'
  return (
    <div className="page patient-home">
      <section className="welcome-row reveal">
        <div><span className="eyebrow">วันนี้ · {formatThaiDate(new Date())}</span><h1>สวัสดี คุณ{profile.displayName.split(' ')[0]}</h1><p>วันนี้สุขภาพเท้าของคุณเป็นอย่างไรบ้าง</p></div>
        <div className="profile-facts"><span><b>{profile.age}</b> ปี</span><span>{profile.generation}</span><span>{profile.occupation}</span></div>
      </section>

      {hasDraft ? <section className="resume-banner reveal" role="status"><span className="resume-icon"><Clock3 size={21} /></span><div><span className="eyebrow">ตรวจที่ยังทำไม่เสร็จ</span><h2>คุณถ่ายภาพไว้บางส่วนแล้ว</h2><p>ทำต่อจากขั้นตอนเดิมได้เลย ระบบจะไม่ให้คุณเริ่มใหม่ทั้งหมด</p></div><button className="button button-secondary" type="button" onClick={onResume}>ทำต่อจากเดิม <ArrowRight size={18} /></button></section> : null}

      <section className="scan-hero reveal reveal-delay-1">
        <div className="scan-copy">
          <span className="hero-kicker"><span className="pulse-dot" />ถึงเวลาตรวจเท้าประจำสัปดาห์</span>
          <h2>ใช้เวลาเพียงไม่กี่นาที<br />เพื่อดูแลทุกก้าวของคุณ</h2>
          <p>ถ่ายภาพเท้า 4 มุมตามคำแนะนำ ระบบจะช่วยประเมินและสรุปการเปลี่ยนแปลงให้</p>
          <button className="button button-primary button-hero" type="button" onClick={onStart}><ScanLine size={22} />เริ่มตรวจเท้า<ArrowRight size={20} /></button>
          <small><ShieldCheck size={15} /> รูปภาพต้นฉบับไม่เผยแพร่สู่สาธารณะ</small>
        </div>
        <div className="scan-visual"><FourFrameIllustration /><div className="scan-caption"><span>ภาพที่ต้องถ่าย</span><strong>4 มุม</strong></div></div>
      </section>

      <div className="home-grid">
        <section className="content-card latest-card reveal reveal-delay-2" aria-labelledby="latest-title">
          <div className="section-heading"><div><span className="eyebrow">ผลล่าสุด</span><h2 id="latest-title">{latest?.displayDate ?? 'ยังไม่มีผลตรวจ'}</h2></div><span className={latestFindings.length ? 'status-pill attention' : 'status-pill success'}>{latestFindings.length ? <Info size={15} /> : <CircleCheck size={15} />}{latestSummary}</span></div>
          <div className="latest-summary"><div className="result-count"><strong>{latestFindings.length}</strong><span>ภาวะที่พบ</span></div><div className="finding-list compact">{latestFindings.length ? latestFindings.map((finding) => <FindingRow key={finding.diseaseId} finding={finding} />) : <p className="muted-copy">ยังไม่มีรายการที่ยืนยันจากการตรวจครั้งล่าสุด</p>}</div></div>
          <button className="card-link" type="button" onClick={onHistory}>ดูผลการตรวจทั้งหมด <ChevronRight size={18} /></button>
        </section>

        <section className="content-card progress-card reveal reveal-delay-3" aria-labelledby="progress-title">
          <div className="section-heading"><div><span className="eyebrow">แนวโน้ม 4 ครั้งล่าสุด</span><h2 id="progress-title">{patientExaminations.length ? 'ผิวแห้งดีขึ้น' : 'เริ่มติดตามผล'}</h2></div><span className="trend-icon good">{patientExaminations.length ? <TrendingDown size={20} /> : <Clock3 size={20} />}</span></div>
          <MiniTrend examinations={patientExaminations} />
          <p>{patientExaminations.length ? 'ระดับลดจากรุนแรงเป็นปานกลางเมื่อเทียบกับครั้งก่อน' : 'เมื่อมีผลตรวจ ระบบจะแสดงแนวโน้มการเปลี่ยนแปลงให้ที่นี่'}</p>
          <button className="card-link" type="button" onClick={onHistory}>ดูแนวโน้มโดยละเอียด <ChevronRight size={18} /></button>
        </section>
      </div>

      <section className="timeline-section reveal reveal-delay-3">
        <div className="section-heading"><div><span className="eyebrow">การตรวจที่ผ่านมา</span><h2>ติดตามอย่างต่อเนื่อง</h2></div><button className="text-link" type="button" onClick={onHistory}>ดูทั้งหมด</button></div>
        <div className="timeline-row">
          {patientExaminations.slice(0, 4).map((exam, index) => (
            <button className={index === 0 ? 'timeline-item current' : 'timeline-item'} type="button" key={exam.id} onClick={onHistory}>
              <span className="timeline-dot">{index === 0 ? <Check size={14} /> : null}</span><strong>{exam.displayDate.split(' ')[0]}</strong><small>{exam.displayDate.split(' ').slice(1).join(' ')}</small><em>{exam.findings.length} รายการ</em>
            </button>
          ))}
        </div>
      </section>

      <section className="knowledge-callout reveal">
        <div className="article-icon"><HeartPulse size={26} /></div>
        <div><span className="eyebrow">แนะนำสำหรับคุณ</span><h2>คำแนะนำสำหรับการดูแลเท้า</h2><p>ทาครีมหลังล้างและซับเท้าให้แห้ง หลีกเลี่ยงการทาระหว่างซอกนิ้วเพื่อลดความอับชื้น</p></div>
        <button className="button button-secondary" type="button" onClick={onKnowledge}>อ่านคำแนะนำ <ArrowRight size={18} /></button>
      </section>
      <ClinicalDisclaimer />
    </div>
  )
}

function FindingRow({ finding }: { finding: Finding }) {
  return <div className="finding-row"><span className={`severity-dot severity-${severityRank[finding.severity]}`} /><div><strong>{finding.name}</strong><small>{finding.comparison}</small></div><span className={`severity-label severity-${severityRank[finding.severity]}`}>{finding.severity}</span></div>
}

function MiniTrend({ examinations: patientExaminations }: { examinations: Examination[] }) {
  return (
    <div className="mini-trend" aria-label="แนวโน้มผิวแห้งดีขึ้นจากระดับรุนแรงเป็นปานกลาง">
      {[1, 2, 3, 2].map((value, index) => { const exam = patientExaminations[Math.min(Math.max(patientExaminations.length - 1, 0), 3 - index)]; return <div className="trend-column" key={index}><span style={{ height: `${24 + value * 16}px`, opacity: exam ? 1 : .35 }} /><small>{exam?.displayDate.split(' ')[0] ?? '—'}</small></div> })}
    </div>
  )
}

function ClinicalDisclaimer() {
  return <div className="disclaimer"><Info size={18} /><p><strong>ผลประเมินนี้เป็นเครื่องมือช่วยติดตาม</strong> ไม่ใช่การวินิจฉัยโรค หากมีแผล บวม แดง ร้อน หรือปวดผิดปกติ กรุณาติดต่อแพทย์</p></div>
}

function ExaminationFlow({ profile, diseaseRecords, integrations, stage, setStage, onHome, onCompleted }: { profile: Profile; diseaseRecords: Disease[]; integrations: RuntimeIntegrations | null; stage: ExamStage; setStage: (stage: ExamStage) => void; onHome: () => void; onCompleted: (exam: Examination) => void }) {
  const [draftHint, setDraftHint] = useState(() => readExaminationDraft())
  const [step, setStep] = useState(() => draftHint?.step ?? 0)
  const [photos, setPhotos] = useState<Partial<Record<FootPosition, string>>>(() => draftHint?.photos ?? {})
  const [aiFindings, setAiFindings] = useState(() => cloneFindings(mockFindings))
  const [confirmedFindings, setConfirmedFindings] = useState(() => cloneFindings(mockFindings))
  const [thumbnails, setThumbnails] = useState<Partial<Record<FootPosition, string>>>({})
  const [completedExam, setCompletedExam] = useState<Examination | null>(null)
  const [isFinalizing, setIsFinalizing] = useState(false)
  const examinationIdRef = useRef(integrations ? '' : 'EX-DEMO-1')
  const draftJobRef = useRef<Promise<boolean> | null>(null)
  const archiveRef = useRef<OriginalImageArchive>(integrations?.archive ?? new InMemoryOriginalImageArchive())
  const repositoryRef = useRef<ExaminationRepository>(integrations?.repository ?? new InMemoryExaminationRepository())
  const thumbnailServiceRef = useRef<ThumbnailService>(integrations?.thumbnails ?? new BrowserThumbnailService())
  const thumbnailJobRef = useRef<Promise<Record<FootPosition, string>> | null>(null)
  const [processStep, setProcessStep] = useState(0)
  const [analysisError, setAnalysisError] = useState('')
  const [analysisAttempt, setAnalysisAttempt] = useState(0)
  const [finalizeError, setFinalizeError] = useState('')

  const ensureExaminationDraft = async (): Promise<boolean> => {
    if (examinationIdRef.current) return true
    if (!integrations) {
      examinationIdRef.current = `EX-DEMO-${Date.now()}`
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
    void ensureExaminationDraft()
  }

  useLayoutEffect(() => {
    window.scrollTo(0, 0)
    const frame = window.requestAnimationFrame(() => window.scrollTo(0, 0))
    const timeout = window.setTimeout(() => window.scrollTo(0, 0), 80)
    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timeout)
    }
  }, [stage])

  useEffect(() => {
    if (stage === 'capture' || stage === 'review') saveExaminationDraft({ stage, step, photos })
    if (stage === 'summary') clearExaminationDraft()
  }, [stage, step, photos])

  useEffect(() => {
    if (stage !== 'processing') return
    let cancelled = false
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return () => { cancelled = true }
    }
    const progressTimers = [
      window.setTimeout(() => setProcessStep(1), 650),
      window.setTimeout(() => setProcessStep(2), 1400),
      window.setTimeout(() => setProcessStep(3), 2300),
    ]
    const provider: FootAssessmentProvider = integrations?.provider ?? new MockFootAssessmentProvider(toMockDiseaseMaster(diseaseRecords))
    const capturedPhotos = Object.fromEntries(examinationPositions.map((position) => [position, photos[position] ?? 'captured'])) as Record<FootPosition, string>
    const draftReadyJob = examinationIdRef.current ? Promise.resolve(true) : (draftJobRef.current ?? Promise.resolve(false))
    void Promise.all([draftReadyJob, photosToBlobs(capturedPhotos)]).then(([draftReady, images]) => {
      if (!draftReady) throw new Error('Could not initialize examination draft')
      if (!thumbnailJobRef.current) {
        const thumbnailJob = thumbnailServiceRef.current.generateAndStore(examinationIdRef.current, images)
        thumbnailJobRef.current = thumbnailJob
        void thumbnailJob.then((prepared) => setThumbnails(prepared)).catch((error) => {
          thumbnailJobRef.current = null
          console.warn('Thumbnail preparation will be retried after review', error)
        })
      }

      return runAnalysisWorkflow({
        examinationId: examinationIdRef.current,
        username: profile.username,
        images,
        analysisImages: createAnalysisImages(capturedPhotos),
        diseaseMasterVersion: '1',
        examinedAt: new Date().toISOString(),
        archive: archiveRef.current,
        provider,
        repository: repositoryRef.current,
        idempotencyKey: `${examinationIdRef.current}:attempt-${analysisAttempt}`,
        auditLogger: integrations?.audit,
        actorId: profile.id,
      })
    }).then((analysis) => {
      if (cancelled) return
      setAiFindings(analysis.findings)
      setConfirmedFindings(cloneFindings(analysis.findings))
      setProcessStep(3)
      window.setTimeout(() => { if (!cancelled) setStage('human-review') }, 120)
    }).catch((error) => {
      if (cancelled) return
      console.error('Foot analysis workflow failed', error)
      progressTimers.forEach(window.clearTimeout)
      setAnalysisError('ระบบวิเคราะห์ผลไม่สำเร็จชั่วคราว สามารถลองใหม่ได้โดยไม่ต้องถ่ายภาพซ้ำ')
    })
    return () => { cancelled = true; progressTimers.forEach(window.clearTimeout) }
  }, [analysisAttempt, diseaseRecords, integrations, photos, profile.id, profile.username, stage, setStage])

  const finalize = async () => {
    setIsFinalizing(true)
    setFinalizeError('')
    const capturedPhotos = Object.fromEntries(examinationPositions.map((position) => [position, photos[position] ?? 'captured'])) as Record<FootPosition, string>
    const reviewChangedCount = confirmedFindings.reduce((count, finding) => {
      const aiFinding = aiFindings.find((item) => item.diseaseId === finding.diseaseId)
      return count + (aiFinding && (aiFinding.detected !== finding.detected || aiFinding.severity !== finding.severity) ? 1 : 0)
    }, 0)
    try {
      const images = await photosToBlobs(capturedPhotos)
      let preparedThumbnails = Object.keys(thumbnails).length === examinationPositions.length
        ? thumbnails as Record<FootPosition, string>
        : undefined
      if (!preparedThumbnails && thumbnailJobRef.current) {
        try {
          preparedThumbnails = await thumbnailJobRef.current
        } catch {
          // Finalization retries thumbnail generation below.
        }
      }
      const nextThumbnails = await finalizeExamination({
        examinationId: examinationIdRef.current,
        images,
        thumbnailService: thumbnailServiceRef.current,
        repository: repositoryRef.current,
        confirmedFindings: confirmedFindings.filter((finding) => finding.detected),
        confirmedBy: profile.id,
        auditLogger: integrations?.audit,
        actorId: profile.id,
        reviewChangedCount,
        precomputedThumbnails: preparedThumbnails,
      })
      setThumbnails(nextThumbnails)
      const completedAt = new Date()
      const completed: Examination = { id: examinationIdRef.current || `EX${String(Date.now()).slice(-6)}`, date: completedAt.toISOString().slice(0, 10), displayDate: formatThaiShortDate(completedAt), time: formatExamTime(completedAt), status: 'complete', findings: cloneFindings(confirmedFindings.filter((finding) => finding.detected)), thumbnails: nextThumbnails }
      setCompletedExam(completed)
      onCompleted(completed)
      setStage('summary')
    } catch {
      setFinalizeError('บันทึกผลและเตรียมภาพสรุปไม่สำเร็จ กรุณาลองอีกครั้งโดยไม่ต้องถ่ายภาพใหม่')
    } finally {
      setIsFinalizing(false)
    }
  }

  const reset = () => {
    clearExaminationDraft(); setDraftHint(null); setStep(0); setPhotos({}); setThumbnails({}); setCompletedExam(null); setAiFindings(cloneFindings(mockFindings)); setConfirmedFindings(cloneFindings(mockFindings)); setAnalysisError(''); setFinalizeError(''); setAnalysisAttempt(0); setIsFinalizing(false); thumbnailJobRef.current = null; draftJobRef.current = null; examinationIdRef.current = integrations ? '' : `EX-DEMO-${Date.now()}`; archiveRef.current = integrations?.archive ?? new InMemoryOriginalImageArchive(); repositoryRef.current = integrations?.repository ?? new InMemoryExaminationRepository(); thumbnailServiceRef.current = integrations?.thumbnails ?? new BrowserThumbnailService(); setStage('intro')
  }

  if (stage === 'intro') return <ExamIntro hasDraft={Boolean(draftHint)} onResume={() => { if (draftHint) { setStep(draftHint.step); setPhotos(draftHint.photos); setStage(draftHint.stage) } }} onStart={() => { clearExaminationDraft(); setDraftHint(null); setStep(0); setPhotos({}); setStage('capture') }} onBack={onHome} />
  if (stage === 'capture') return <CaptureStep step={step} photos={photos} setPhotos={setPhotos} onNext={() => { if (step === 3) { setStage('review'); void ensureExaminationDraft() } else { setStep((value) => value + 1) } }} onBack={() => step === 0 ? setStage('intro') : setStep((value) => value - 1)} />
  if (stage === 'review') return <PhotoReview photos={photos} onRetake={(index) => { setStep(index); setStage('capture') }} onEvaluate={() => void beginAnalysis()} onBack={() => { setStep(3); setStage('capture') }} />
  if (stage === 'processing') return <ProcessingScreen key={analysisAttempt} current={processStep} error={analysisError} onRetry={() => { setAnalysisError(''); setProcessStep(0); setAnalysisAttempt((value) => value + 1) }} />
  if (stage === 'human-review') return <HumanReview photos={photos} diseaseRecords={diseaseRecords} aiFindings={aiFindings} confirmedFindings={confirmedFindings} setConfirmedFindings={setConfirmedFindings} submitError={finalizeError} onSubmit={() => void finalize()} isSubmitting={isFinalizing} onBack={() => setStage('review')} />
  return completedExam ? <SummaryReport examination={completedExam} photos={thumbnails} diseaseRecords={diseaseRecords} onHome={onHome} onRestart={reset} /> : null
}

function ExamIntro({ hasDraft, onResume, onStart, onBack }: { hasDraft: boolean; onResume: () => void; onStart: () => void; onBack: () => void }) {
  return (
    <div className="page narrow-page exam-intro">
      <PageBack onClick={onBack}>กลับหน้าหลัก</PageBack>
      <div className="exam-intro-visual"><FourFrameIllustration /><span className="camera-badge"><Camera size={22} /></span></div>
      <span className="eyebrow">การตรวจเท้า</span>
      <h1>เตรียมถ่ายภาพเท้า 4 มุม</h1>
      <p className="page-lead">ใช้พื้นที่สว่าง วางโทรศัพท์ให้นิ่ง และทำตามกรอบทีละขั้น</p>
      <ol className="prep-list">
        <li><span>1</span><div><strong>ทำความสะอาดและเช็ดเท้าให้แห้ง</strong><p>นำถุงเท้าและสิ่งปิดบังออกให้เรียบร้อย</p></div></li>
        <li><span>2</span><div><strong>เลือกบริเวณที่มีแสงเพียงพอ</strong><p>หลีกเลี่ยงเงามืดและแสงสะท้อนโดยตรง</p></div></li>
        <li><span>3</span><div><strong>เตรียมถ่ายทั้งหมด 4 ภาพ</strong><p>หลังเท้าและฝ่าเท้า ทั้งข้างซ้ายและขวา</p></div></li>
      </ol>
      <div className="privacy-note"><ShieldCheck size={20} /><span>รูปภาพใช้เพื่อการประเมินภายใต้โครงการนี้เท่านั้น</span></div>
      {hasDraft ? <div className="draft-resume" role="status"><Clock3 size={20} /><div><strong>มีการตรวจที่ยังทำไม่เสร็จ</strong><p>ระบบจำภาพที่ถ่ายไว้บนอุปกรณ์นี้ให้แล้ว</p><div><button className="button button-primary button-small" type="button" onClick={onResume}>ทำต่อจากเดิม</button><button className="button button-ghost button-small" type="button" onClick={onStart}>เริ่มใหม่</button></div></div></div> : null}
      <button className="button button-primary button-large" type="button" onClick={onStart}><Camera size={21} />เปิดกล้องและเริ่มถ่าย</button>
    </div>
  )
}

type CameraState = 'checking' | 'ready' | 'denied' | 'unsupported'
type QualityState = 'idle' | 'checking' | 'passed' | 'retry'
type QualityResult = ImageQualityResult

async function inspectImageQuality(dataUrl: string): Promise<QualityResult> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 32
      canvas.height = 32
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) {
        resolve(evaluateImageQuality({ width: image.naturalWidth, height: image.naturalHeight }))
        return
      }
      context.drawImage(image, 0, 0, 32, 32)
      const pixels = context.getImageData(0, 0, 32, 32).data
      const luminances: number[] = []
      for (let index = 0; index < pixels.length; index += 4) luminances.push((pixels[index] * 0.299) + (pixels[index + 1] * 0.587) + (pixels[index + 2] * 0.114))
      const mean = luminances.reduce((sum, value) => sum + value, 0) / luminances.length
      const variance = luminances.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / luminances.length
      resolve(evaluateImageQuality({ width: image.naturalWidth, height: image.naturalHeight, meanLuminance: mean, luminanceVariance: variance }))
    }
    image.onerror = () => resolve({ passed: false, message: 'อ่านภาพไม่สำเร็จ ลองเลือกไฟล์หรือถ่ายภาพใหม่', checks: [{ label: 'อ่านภาพได้', passed: false }] })
    image.src = dataUrl
  })
}

function CaptureStep({ step, photos, setPhotos, onNext, onBack }: { step: number; photos: Partial<Record<FootPosition, string>>; setPhotos: React.Dispatch<React.SetStateAction<Partial<Record<FootPosition, string>>>>; onNext: () => void; onBack: () => void }) {
  const current = footSteps[step]
  const position = current.id as FootPosition
  const photo = photos[position]
  const inputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const cameraRequestRef = useRef(0)
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')
  const [cameraState, setCameraState] = useState<CameraState>('checking')
  const [qualityState, setQualityState] = useState<QualityState>(photo === 'demo' ? 'passed' : 'idle')
  const [qualityResult, setQualityResult] = useState<QualityResult | null>(photo === 'demo' ? { passed: true, message: 'ภาพตัวอย่างพร้อมใช้สำหรับทดลอง flow', checks: [{ label: 'ภาพตัวอย่าง', passed: true }] } : null)

  const startCamera = useCallback(async () => {
    const requestId = cameraRequestRef.current + 1
    cameraRequestRef.current = requestId
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState('unsupported')
      return
    }
    setCameraState('checking')
    const timeoutId = window.setTimeout(() => {
      if (cameraRequestRef.current === requestId) {
        cameraRequestRef.current += 1
        setCameraState('denied')
      }
    }, 3000)
    try {
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false })
      window.clearTimeout(timeoutId)
      if (cameraRequestRef.current !== requestId) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream
      setCameraState('ready')
    } catch (error) {
      window.clearTimeout(timeoutId)
      if (cameraRequestRef.current !== requestId) return
      const denied = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError')
      setCameraState(denied ? 'denied' : 'unsupported')
    }
  }, [facingMode])

  useEffect(() => {
    const timer = window.setTimeout(() => void startCamera(), 0)
    return () => {
      window.clearTimeout(timer)
      cameraRequestRef.current += 1
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [startCamera, position])

  useEffect(() => {
    if (videoRef.current && streamRef.current) videoRef.current.srcObject = streamRef.current
  }, [cameraState, photo])

  const clearPhoto = () => {
    setPhotos((value) => ({ ...value, [position]: undefined }))
    setQualityState('idle')
    setQualityResult(null)
    window.setTimeout(() => void startCamera(), 0)
  }

  const switchCamera = () => {
    setFacingMode((currentMode) => currentMode === 'environment' ? 'user' : 'environment')
  }

  const setPhotoAndInspect = async (dataUrl: string, nextQualityResult?: QualityResult) => {
    setPhotos((value) => ({ ...value, [position]: dataUrl }))
    setQualityState('checking')
    const result = nextQualityResult ?? await inspectImageQuality(dataUrl)
    setQualityResult(result)
    setQualityState(result.passed ? 'passed' : 'retry')
  }

  const readPhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => { void setPhotoAndInspect(String(reader.result)) }
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  const capturePhoto = async () => {
    const video = videoRef.current
    if (!video || cameraState !== 'ready' || video.videoWidth === 0) {
      return
    }
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
    // A camera frame is already a rendered copy, so high-quality JPEG keeps
    // clinical detail while avoiding multi-megabyte PNG uploads on mobile.
    await setPhotoAndInspect(canvas.toDataURL('image/jpeg', 0.9))
  }

  const useDemoPhoto = () => {
    void setPhotoAndInspect('demo', { passed: true, message: 'ภาพตัวอย่างพร้อมใช้สำหรับทดลอง flow', checks: [{ label: 'ภาพตัวอย่าง', passed: true }] })
  }

  const permissionMessage = cameraState === 'denied' ? 'ไม่สามารถเปิดกล้องได้ กรุณาอนุญาตให้เว็บไซต์เข้าถึงกล้อง แล้วลองอีกครั้ง' : 'อุปกรณ์นี้ไม่รองรับกล้องบนเว็บ สามารถเลือกภาพจากเครื่องแทนได้'

  return (
    <div className="capture-page">
      <header className="capture-header"><button className="icon-button" type="button" aria-label="ย้อนกลับ" onClick={onBack}><ArrowLeft size={22} /></button><div><strong>{current.label}</strong><span>{step + 1} จาก 4</span></div><button className="text-button" type="button" onClick={() => { setPhotos({}); clearPhoto() }}>เริ่มใหม่</button></header>
      <div className="step-segments" aria-label={`ขั้นตอน ${step + 1} จาก 4`}>{footSteps.map((item, index) => <span key={item.id} className={index <= step ? 'complete' : ''} />)}</div>
      <div className={photo ? 'camera-viewport has-photo' : 'camera-viewport'} style={photo && photo !== 'demo' ? { backgroundImage: `url(${photo})` } : undefined}>
        {!photo && cameraState === 'ready' ? <video ref={videoRef} className="camera-preview" autoPlay playsInline muted aria-label={`ภาพตัวอย่างกล้องสำหรับ${current.label}`} /> : null}
        {photo === 'demo' ? <div className="demo-foot-photo"><FourFrameIllustration /></div> : null}
        {!photo ? <><div className="camera-grid" /><div className="foot-guide"><div className={`single-foot ${position.includes('right') ? 'right' : ''}`} /></div><div className="camera-instruction"><strong>วางเท้าให้อยู่ภายในกรอบ</strong><span>ให้เห็นเท้าครบและภาพไม่สั่น</span></div></> : null}
        <span className="viewfinder-corner vc-1" /><span className="viewfinder-corner vc-2" /><span className="viewfinder-corner vc-3" /><span className="viewfinder-corner vc-4" />
      </div>
      <div className="capture-controls">
        {!photo ? (
          <>
            <p><Sparkles size={18} />{current.hint}</p>
            {cameraState === 'denied' || cameraState === 'unsupported' ? <div className="camera-permission-error" role="alert"><VideoOff size={20} /><div><strong>{permissionMessage}</strong><small>คุณยังเลือกภาพจากเครื่องแทนได้</small><button type="button" onClick={() => void startCamera()}>ลองเปิดกล้องอีกครั้ง</button></div></div> : null}
            <input ref={inputRef} className="visually-hidden" type="file" accept="image/*" onChange={readPhoto} />
            <div className="camera-actions">
              <button className="camera-action-button" type="button" onClick={() => inputRef.current?.click()}><ImageIcon size={22} /><span>อัปโหลดรูป</span></button>
              <button className="camera-shutter" type="button" aria-label="ถ่ายภาพ" disabled={cameraState !== 'ready'} onClick={() => void capturePhoto()}><span><Camera size={30} /></span></button>
              <button className="camera-action-button" type="button" disabled={cameraState !== 'ready'} onClick={switchCamera}><SwitchCamera size={22} /><span>กลับกล้อง</span></button>
            </div>
            <button className="text-button demo-photo-button" type="button" onClick={useDemoPhoto}><ImageIcon size={17} />ใช้ภาพตัวอย่างสำหรับทดลอง</button>
          </>
        ) : (
          <div className={qualityState === 'retry' ? 'quality-result failed' : 'quality-result'}>
            <div className="quality-heading"><span>{qualityState === 'passed' ? <CircleCheck size={21} /> : qualityState === 'retry' ? <AlertTriangle size={21} /> : <Clock3 size={21} />}</span><div><strong>{qualityState === 'passed' ? 'ภาพนี้อยู่ในเกณฑ์เบื้องต้น' : qualityState === 'retry' ? 'แนะนำให้ถ่ายภาพใหม่' : 'กำลังตรวจสอบภาพ…'}</strong><small>{qualityResult?.message ?? 'ระบบกำลังเช็กแสง ความละเอียด และความชัด'}</small></div></div>
            {qualityResult ? <div className="quality-checks">{qualityResult.checks.map((check) => <span className={check.passed ? '' : 'failed'} key={check.label}>{check.passed ? <Check size={15} /> : <X size={15} />}{check.label}</span>)}</div> : null}
            <button className="button button-primary button-large" type="button" disabled={qualityState !== 'passed'} onClick={onNext}>{step === 3 ? 'ตรวจดูภาพทั้งหมด' : 'ใช้ภาพนี้และถ่ายภาพต่อไป'}<ArrowRight size={20} /></button>
            <button className="button button-ghost" type="button" onClick={clearPhoto}><RotateCcw size={18} />ถ่ายใหม่</button>
          </div>
        )}
      </div>
    </div>
  )
}

function PhotoReview({ photos, onRetake, onEvaluate, onBack }: { photos: Partial<Record<FootPosition, string>>; onRetake: (index: number) => void; onEvaluate: () => void; onBack: () => void }) {
  return (
    <div className="page narrow-page review-page">
      <PageBack onClick={onBack}>กลับไปถ่ายภาพ</PageBack>
      <span className="eyebrow">ตรวจดูภาพ</span><h1>ภาพเท้าครบทั้ง 4 มุม</h1><p className="page-lead">ตรวจให้แน่ใจว่าภาพชัดและเห็นเท้าครบ หากต้องการแก้ไขสามารถถ่ายใหม่เฉพาะภาพได้</p>
      <div className="photo-review-grid">
        {footSteps.map((item, index) => {
          const photo = photos[item.id]
          return <div className="photo-card" key={item.id}><div className="photo-preview" style={photo && photo !== 'demo' ? { backgroundImage: `url(${photo})` } : undefined}>{photo === 'demo' || !photo ? <div className="mini-foot-art"><Footprints size={42} /></div> : null}<span><CircleCheck size={15} />ภาพชัดเจน</span></div><div><strong>{item.label}</strong><button type="button" onClick={() => onRetake(index)}><RotateCcw size={16} />ถ่ายใหม่</button></div></div>
        })}
      </div>
      <div className="review-notice"><ShieldCheck size={19} /><p>เมื่อกดประเมินผล รูปต้นฉบับจะถูกส่งไปวิเคราะห์แบบส่วนตัวและไม่เผยแพร่สู่สาธารณะ</p></div>
      <button className="button button-primary button-large" type="button" onClick={onEvaluate}><Sparkles size={21} />ประเมินผล</button>
    </div>
  )
}

function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine)
  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline) }
  }, [])
  return online
}

function ProcessingScreen({ current, error, onRetry }: { current: number; error: string; onRetry: () => void }) {
  const online = useOnlineStatus()
  const [recoveryReady, setRecoveryReady] = useState(false)
  useEffect(() => {
    const handleOnline = () => setRecoveryReady(true)
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [])
  const targetProgress = Math.min(92, 18 + current * 25)
  const [driftProgress, setDriftProgress] = useState(18)
  const analysisProgress = Math.max(targetProgress, driftProgress)
  useEffect(() => {
    if (error || !online) return
    const timer = window.setInterval(() => {
      setDriftProgress((value) => {
        const currentProgress = Math.max(value, targetProgress)
        return Math.min(94, currentProgress + (currentProgress < 70 ? 3 : currentProgress < 88 ? 2 : 1))
      })
    }, 480)
    return () => window.clearInterval(timer)
  }, [error, online, targetProgress])
  return (
    <div className="processing-screen">
      <div className="processing-visual"><div className="processing-ring"><Footprints size={42} /></div><span className="orbit-dot" /></div>
      <span className="eyebrow">กรุณารอสักครู่</span><h1>กำลังประเมินผล</h1><p>ระบบกำลังตรวจภาพเท้าทั้ง 4 มุม</p>
      <div className="progress-panel">
        <div className="progress-meta"><span>ความคืบหน้า</span><strong>{analysisProgress}%</strong></div>
        <div className="progress-track"><span style={{ width: `${analysisProgress}%` }} /></div>
        <ol><li className="current"><span><Sparkles size={16} /></span><div><strong>กำลังวิเคราะห์ภาพ</strong><small>กำลังดำเนินการ…</small></div></li></ol>
      </div>
      {!online ? <div className="processing-error offline-error" role="alert"><WifiOff size={21} /><div><strong>ไม่มีอินเทอร์เน็ตชั่วคราว</strong><p>เชื่อมต่ออินเทอร์เน็ตก่อน ระบบจะไม่ส่งภาพซ้ำจนกว่าคุณจะพร้อม</p><button className="button button-secondary button-small" type="button" disabled>รอการเชื่อมต่อ…</button></div></div> : recoveryReady ? <div className="processing-error offline-error" role="alert"><WifiOff size={21} /><div><strong>เชื่อมต่อกลับมาแล้ว</strong><p>ภาพยังอยู่บนอุปกรณ์และยังไม่ได้ส่งซ้ำ กดเพื่อประเมินต่อ</p><button className="button button-secondary button-small" type="button" onClick={() => { setRecoveryReady(false); onRetry() }}>ลองประเมินอีกครั้ง</button></div></div> : error ? <div className="processing-error" role="alert"><AlertTriangle size={21} /><div><strong>ยังประเมินผลไม่สำเร็จ</strong><p>{error}</p><button className="button button-secondary button-small" type="button" onClick={onRetry}>ลองประเมินอีกครั้ง</button></div></div> : null}
      <div className="stay-note"><Info size={18} />กรุณาอย่าปิดหน้านี้ระหว่างดำเนินการ</div>
    </div>
  )
}

function HumanReview({ photos, diseaseRecords, aiFindings, confirmedFindings, setConfirmedFindings, submitError, onSubmit, isSubmitting, onBack }: { photos: Partial<Record<FootPosition, string>>; diseaseRecords: Disease[]; aiFindings: Finding[]; confirmedFindings: Finding[]; setConfirmedFindings: React.Dispatch<React.SetStateAction<Finding[]>>; submitError?: string; onSubmit: () => void; isSubmitting?: boolean; onBack: () => void }) {
  const [selectedPhoto, setSelectedPhoto] = useState<FootPosition | null>(null)
  const detectedCount = confirmedFindings.filter((finding) => finding.detected).length
  const updateFinding = (id: string, patch: Partial<Finding>) => setConfirmedFindings((current) => current.map((finding) => finding.diseaseId === id ? { ...finding, ...patch } : finding))
  return (
    <div className="page narrow-page human-review-page">
      <PageBack onClick={onBack}>กลับไปดูภาพ</PageBack>
      <div className="review-title-row"><div><span className="eyebrow">ตรวจทานผล</span><h1>AI แนะนำ {detectedCount} รายการ</h1></div><span className="ai-badge"><Sparkles size={16} />ผลช่วยประเมิน</span></div>
      <p className="page-lead">ตรวจความถูกต้อง เลือกหรือยกเลิกรายการ และปรับระดับก่อนส่งผลตรวจ</p>
      <div className="review-image-strip">{footSteps.map((item, index) => { const photo = photos[item.id]; return <button type="button" key={item.id} aria-label={`ดู${item.label}`} onClick={() => setSelectedPhoto(item.id)} style={photo && photo !== 'demo' ? { backgroundImage: `url(${photo})`, backgroundPosition: 'center', backgroundSize: 'cover' } : undefined}>{!photo || photo === 'demo' ? <Footprints size={24} /> : null}<span>{index + 1}</span></button> })}</div>
      <div className="checklist-heading"><h2>รายการที่ตรวจ</h2><span>{detectedCount} จาก {confirmedFindings.length} รายการ</span></div>
      <div className="condition-checklist">
        {confirmedFindings.map((finding) => (
          <article className={finding.detected ? 'condition-item selected' : 'condition-item'} key={finding.diseaseId}>
            <label className="condition-check"><input type="checkbox" checked={finding.detected} onChange={(event) => updateFinding(finding.diseaseId, { detected: event.target.checked })} /><span className="custom-checkbox"><Check size={16} /></span><span><strong>{finding.name}</strong><small>AI แนะนำ: {aiFindings.find((item) => item.diseaseId === finding.diseaseId)?.detected ? 'พบ' : 'ไม่พบ'} · มั่นใจ {aiFindings.find((item) => item.diseaseId === finding.diseaseId)?.confidence ?? 0}%</small></span></label>
            {finding.detected ? <label className="severity-select">ระดับ<select value={finding.severity} onChange={(event) => updateFinding(finding.diseaseId, { severity: event.target.value as Severity })}>{getDiseaseSeverityLevels(diseaseRecords.find((disease) => disease.id === finding.diseaseId)).map((level) => <option value={level.label} key={level.label}>{level.label}</option>)}</select><ChevronDown size={16} /></label> : <span className="not-found-label">ไม่พบ</span>}
          </article>
        ))}
      </div>
      <div className="review-explainer"><Info size={19} /><p>ผล AI ต้นฉบับจะถูกเก็บแยกจากรายการที่คุณยืนยัน เพื่อให้ผู้ดูแลตรวจสอบย้อนหลังได้</p></div>
      {submitError ? <div className="form-error review-submit-error" role="alert"><AlertTriangle size={18} />{submitError}</div> : null}
      <button className={isSubmitting ? 'button button-primary button-large action-pending' : 'button button-primary button-large'} type="button" disabled={isSubmitting} onClick={onSubmit}><FileCheck2 size={21} />{isSubmitting ? 'กำลังเตรียมภาพสรุป…' : 'ยืนยันและส่งผลตรวจ'}</button>
      {selectedPhoto ? <PhotoViewer position={selectedPhoto} photo={photos[selectedPhoto]} onClose={() => setSelectedPhoto(null)} /> : null}
    </div>
  )
}

function PhotoViewer({ position, photo, onClose }: { position: FootPosition; photo?: string; onClose: () => void }) {
  const label = footSteps.find((step) => step.id === position)?.label ?? position
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="detail-modal photo-viewer" role="dialog" aria-modal="true" aria-labelledby="photo-viewer-title"><header><div><span className="eyebrow">ภาพจากการตรวจ</span><h2 id="photo-viewer-title">{label}</h2></div><button className="icon-button" type="button" aria-label="ปิด" onClick={onClose}><X size={21} /></button></header><div className="photo-viewer-canvas" style={photo && photo !== 'demo' ? { backgroundImage: `url(${photo})` } : undefined}>{!photo || photo === 'demo' ? <FourFrameIllustration /> : null}</div><p className="photo-viewer-note">ตรวจว่าภาพเห็นเท้าครบและไม่มีส่วนสำคัญถูกบัง ก่อนกลับไปยืนยันรายการ</p><button className="button button-primary" type="button" onClick={onClose}>กลับไปตรวจผล</button></section></div>
}

function SummaryReport({ examination, photos, diseaseRecords, onHome, onRestart }: { examination: Examination; photos: Partial<Record<FootPosition, string>>; diseaseRecords: Disease[]; onHome: () => void; onRestart: () => void }) {
  const findings = examination.findings
  const recommendationLines = [...new Set(findings.flatMap((finding) => {
    const disease = diseaseRecords.find((item) => item.id === finding.diseaseId)
    return disease ? [disease.care, disease.recommendation].filter(Boolean) : []
  }))].slice(0, 3)
  const comparisonFinding = findings.find((finding) => finding.comparison !== 'คงที่')
  const fallbackRecommendations = ['ล้างเท้าและซับให้แห้ง โดยเฉพาะซอกนิ้ว', 'ตรวจเท้าด้วยตนเองทุกวัน', 'หากมีแผล บวม แดง ร้อน หรือปวดผิดปกติ ให้ติดต่อแพทย์']
  return (
    <div className="page narrow-page summary-page">
      <div className="success-mark"><Check size={30} /></div><span className="eyebrow">บันทึกเรียบร้อย</span><h1>ผลการตรวจเท้า</h1><p className="summary-date">{examination.displayDate} · {examination.time} น. · {examination.id}</p>
      <section className="summary-overview">
        <div><span>ภาวะที่พบ</span><strong>{findings.length}<small> รายการ</small></strong></div><div><span>ภาพรวม</span><strong className={findings.length ? 'attention-text' : 'success-text'}>{findings.length ? 'ควรติดตาม' : 'ยังไม่พบภาวะ'}</strong></div>
      </section>
      <section className="summary-images"><div className="section-heading"><div><span className="eyebrow">ภาพจากการตรวจ</span><h2>ภาพเท้า 4 มุม</h2></div><span className="status-pill success"><CircleCheck size={15} />ครบ 4 ภาพ</span></div><div className="summary-photo-grid">{footSteps.map((step) => { const photo = photos[step.id]; return <div className="summary-photo" key={step.id} style={photo && photo !== 'demo' ? { backgroundImage: `url(${photo})` } : undefined}>{!photo || photo === 'demo' ? <Footprints size={26} /> : null}<span>{step.short}</span></div> })}</div></section>
      {findings.length ? <section className="summary-section"><div className="section-heading"><div><span className="eyebrow">ผลที่ยืนยันแล้ว</span><h2>รายการที่พบ</h2></div></div><div className="finding-list">{findings.map((finding) => <FindingRow key={finding.diseaseId} finding={finding} />)}</div></section> : <section className="no-finding-card"><CircleCheck size={24} /><div><h2>ยังไม่พบภาวะจากรายการที่ตรวจ</h2><p>ผลนี้ไม่ได้แปลว่าไม่มีโรคแน่นอน หากมีอาการผิดปกติ ให้เฝ้าระวังและติดต่อแพทย์</p></div></section>}
      {comparisonFinding ? <section className="comparison-card"><div className="comparison-icon"><TrendingDown size={24} /></div><div><span className="eyebrow">เทียบกับครั้งก่อน</span><h2>{comparisonFinding.name} {comparisonFinding.comparison}</h2><p>ผลเปรียบเทียบจากการตรวจครั้งก่อน ควรติดตามตามคำแนะนำ</p></div></section> : null}
      <section className="recommendation-card"><div className="section-heading"><div><span className="eyebrow">คำแนะนำ</span><h2>ดูแลต่อเนื่องหลังการตรวจ</h2></div><HeartPulse size={24} /></div><ul>{(recommendationLines.length ? recommendationLines : fallbackRecommendations).map((recommendation) => <li key={recommendation}><Check size={17} />{recommendation}</li>)}</ul></section>
      <ClinicalDisclaimer />
      <button className="button button-primary button-large" type="button" onClick={onHome}>กลับหน้าหลัก</button>
      <button className="button button-ghost" type="button" onClick={onRestart}>เริ่มการตรวจใหม่</button>
    </div>
  )
}

function PageBack({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return <button className="page-back" type="button" onClick={onClick}><ArrowLeft size={18} />{children}</button>
}

function HistoryPage({ examinations: patientExaminations, diseaseRecords }: { examinations: Examination[]; diseaseRecords: Disease[] }) {
  const [view, setView] = useState<HistoryView>('list')
  const [selected, setSelected] = useState<Examination | null>(null)
  return (
    <div className="page history-page">
      <PageTitle eyebrow="ติดตามสุขภาพเท้า" title="ประวัติการตรวจ" description="ดูผลย้อนหลัง วันที่ตรวจ และแนวโน้มการเปลี่ยนแปลง" />
      <div className="segmented-control" role="tablist" aria-label="รูปแบบประวัติ">
        <HistoryTab icon={List} label="รายการ" value="list" active={view === 'list'} onClick={setView} />
        <HistoryTab icon={CalendarDays} label="ปฏิทิน" value="calendar" active={view === 'calendar'} onClick={setView} />
        <HistoryTab icon={Activity} label="แนวโน้ม" value="insight" active={view === 'insight'} onClick={setView} />
      </div>
      {view === 'list' ? <HistoryList examinations={patientExaminations} onSelect={setSelected} /> : view === 'calendar' ? <HistoryCalendar examinations={patientExaminations} onSelect={setSelected} /> : <HistoryInsight examinations={patientExaminations} onSelect={setSelected} />}
      {selected ? <ExaminationDetail exam={selected} diseaseRecords={diseaseRecords} onClose={() => setSelected(null)} /> : null}
    </div>
  )
}

function PageTitle({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <header className="page-title"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</header>
}

function HistoryTab({ icon: Icon, label, value, active, onClick }: { icon: typeof List; label: string; value: HistoryView; active: boolean; onClick: (value: HistoryView) => void }) {
  return <button role="tab" aria-selected={active} className={active ? 'active' : ''} type="button" onClick={() => onClick(value)}><Icon size={18} />{label}</button>
}

function HistoryList({ examinations: patientExaminations, onSelect }: { examinations: Examination[]; onSelect: (exam: Examination) => void }) {
  return (
    <div className="history-content"><div className="history-summary-bar"><span><ClipboardCheck size={19} /><strong>ตรวจแล้ว {patientExaminations.length} ครั้ง</strong></span><small>ข้อมูลตั้งแต่ {patientExaminations.at(-1)?.displayDate ?? 'ยังไม่มีข้อมูล'}</small></div>{patientExaminations.length ? <div className="exam-list">
      {patientExaminations.map((exam, index) => { const thumbnail = exam.thumbnails?.['left-dorsal']; return <article className="exam-card" key={exam.id}><div className="exam-date-block"><strong>{exam.displayDate.split(' ')[0]}</strong><span>{exam.displayDate.split(' ').slice(1).join(' ')}</span><small>{exam.time} น.</small></div><div className={thumbnail && thumbnail !== 'demo' ? 'exam-thumb has-image' : 'exam-thumb'} role={thumbnail && thumbnail !== 'demo' ? 'img' : undefined} aria-label={thumbnail && thumbnail !== 'demo' ? 'ภาพย่อจากการตรวจ' : undefined} style={thumbnail && thumbnail !== 'demo' ? { backgroundImage: `url(${thumbnail})` } : undefined}>{!thumbnail || thumbnail === 'demo' ? <Footprints size={30} /> : null}<span>4 ภาพ</span></div><div className="exam-findings"><span className="eyebrow">{index === 0 ? 'ล่าสุด' : exam.id}</span><h2>พบ {exam.findings.length} รายการ</h2><div>{exam.findings.map((finding) => <span key={finding.diseaseId} className={`severity-label severity-${severityRank[finding.severity]}`}>{finding.name} · {finding.severity}</span>)}</div></div><button className="exam-open" type="button" onClick={() => onSelect(exam)} aria-label={`ดูผลวันที่ ${exam.displayDate}`}>ดูรายละเอียด<ChevronRight size={19} /></button></article> })}
    </div> : <div className="empty-state"><ClipboardCheck size={32} /><h2>ยังไม่มีประวัติการตรวจ</h2><p>เริ่มตรวจเท้าครั้งแรกเพื่อดูผลย้อนหลังและแนวโน้มการเปลี่ยนแปลง</p></div>}</div>
  )
}

function HistoryCalendar({ examinations: patientExaminations, onSelect }: { examinations: Examination[]; onSelect: (exam: Examination) => void }) {
  const [cursor, setCursor] = useState({ year: 2026, month: 7 })
  const [selectedDay, setSelectedDay] = useState(8)
  const monthNames = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate()
  const firstDay = new Date(cursor.year, cursor.month, 1).getDay()
  const monthPrefix = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}`
  const selectedDate = `${monthPrefix}-${String(selectedDay).padStart(2, '0')}`
  const selectedExaminations = patientExaminations.filter((exam) => exam.date === selectedDate)
  const shiftMonth = (delta: number) => setCursor((current) => { const next = new Date(current.year, current.month + delta, 1); setSelectedDay(1); return { year: next.getFullYear(), month: next.getMonth() } })
  return (
    <div className="calendar-layout"><section className="calendar-card"><div className="calendar-header"><button className="icon-button" type="button" aria-label="เดือนก่อน" onClick={() => shiftMonth(-1)}><ArrowLeft size={19} /></button><h2>{monthNames[cursor.month]} {cursor.year + 543}</h2><button className="icon-button" type="button" aria-label="เดือนถัดไป" onClick={() => shiftMonth(1)}><ArrowRight size={19} /></button></div><div className="weekdays">{['อา','จ','อ','พ','พฤ','ศ','ส'].map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-grid">{Array.from({ length: firstDay }).map((_, index) => <span key={`empty-${index}`} />)}{Array.from({ length: daysInMonth }, (_, index) => index + 1).map((day) => { const date = `${monthPrefix}-${String(day).padStart(2, '0')}`; const examsOnDay = patientExaminations.filter((item) => item.date === date); return <button key={day} type="button" aria-label={`เลือกวันที่ ${day} ${monthNames[cursor.month]} ${cursor.year + 543}`} className={`${examsOnDay.length ? 'has-exam ' : ''}${selectedDay === day ? 'selected' : ''}`} onClick={() => setSelectedDay(day)}>{day}{examsOnDay.length ? <i /> : null}</button> })}</div></section><section className="calendar-side"><span className="eyebrow">วันที่เลือก</span><h2>{selectedDay} {monthNames[cursor.month]} {cursor.year + 543}</h2>{selectedExaminations.length ? selectedExaminations.map((exam) => <div className="calendar-event" key={exam.id}><span><Check size={16} /></span><div><strong>ตรวจเท้า เวลา {exam.time} น.</strong><p>พบ {exam.findings.map((finding) => finding.name).join(' และ ') || 'ไม่พบภาวะตามเกณฑ์'}</p><button type="button" onClick={() => onSelect(exam)}>ดูผลตรวจ <ChevronRight size={16} /></button></div></div>) : <div className="calendar-empty"><CalendarDays size={22} /><p>ไม่มีรายการตรวจในวันนี้</p></div>}</section></div>
  )
}

function HistoryInsight({ examinations: patientExaminations, onSelect }: { examinations: Examination[]; onSelect: (exam: Examination) => void }) {
  const latest = patientExaminations[0]
  const previous = patientExaminations[1]
  const trackedFinding = latest?.findings[0]
  const previousFinding = trackedFinding ? previous?.findings.find((finding) => finding.diseaseId === trackedFinding.diseaseId) : undefined
  const severityDelta = trackedFinding && previousFinding ? severityRank[trackedFinding.severity] - severityRank[previousFinding.severity] : 0
  const trendLabel = severityDelta < 0 ? 'แนวโน้มดีขึ้น' : severityDelta > 0 ? 'ควรติดตาม' : 'คงที่'
  const trendStatus = severityDelta < 0 ? 'success' : severityDelta > 0 ? 'danger' : 'attention'
  const trendIcon = severityDelta < 0 ? <TrendingDown size={30} /> : severityDelta > 0 ? <TrendingUp size={30} /> : <Clock3 size={30} />
  const recurringCount = trackedFinding ? patientExaminations.filter((exam) => exam.findings.some((finding) => finding.diseaseId === trackedFinding.diseaseId)).length : 0
  const trendRecords = patientExaminations.slice(0, 4).reverse()
  return (
    <div className="insight-grid"><section className="insight-hero"><div><span className="eyebrow">ภาพรวมจาก {patientExaminations.length} ครั้งล่าสุด</span><h2>{trendLabel}</h2><p>{trackedFinding ? `${trackedFinding.name} ${severityDelta < 0 ? 'ลดระดับจากครั้งก่อน' : severityDelta > 0 ? 'มีระดับสูงขึ้นจากครั้งก่อน' : 'ยังอยู่ในระดับเดิม'}${previous ? '' : ' · รอข้อมูลครั้งถัดไปเพื่อเปรียบเทียบ'}` : 'ยังไม่มีผลตรวจสำหรับวิเคราะห์แนวโน้ม'}</p></div><span className="big-trend">{trendIcon}</span></section><div className="stat-row"><div className="stat-card"><span>ตรวจทั้งหมด</span><strong>{patientExaminations.length} <small>ครั้ง</small></strong></div><div className="stat-card"><span>ตรวจล่าสุด</span><strong>{latest?.displayDate.split(' ')[0] ?? '—'}</strong></div><div className="stat-card"><span>พบต่อเนื่อง</span><strong>{recurringCount} <small>ครั้ง</small></strong></div></div><section className="trend-card"><div className="section-heading"><div><span className="eyebrow">ระดับความรุนแรง</span><h2>{trackedFinding?.name ?? 'ยังไม่มีข้อมูล'}</h2></div><span className={`status-pill ${trendStatus}`}>{severityDelta < 0 ? <TrendingDown size={15} /> : severityDelta > 0 ? <TrendingUp size={15} /> : <Clock3 size={15} />}{trendLabel.replace('แนวโน้ม', '')}</span></div><div className="severity-chart">{trendRecords.map((exam) => { const finding = trackedFinding ? exam.findings.find((item) => item.diseaseId === trackedFinding.diseaseId) : undefined; const value = finding ? severityRank[finding.severity] : 0; return <div key={exam.id}><span className={`bar severity-bg-${value || 1}`} style={{ height: `${Math.max(18, value * 46)}px`, opacity: value ? 1 : .35 }}><i>{finding?.severity ?? 'ไม่มีข้อมูล'}</i></span><small>{exam.displayDate.split(' ')[0]} {exam.displayDate.split(' ')[1] ?? ''}</small></div> })}</div></section><section className="insight-list"><h2>สิ่งที่ควรรู้</h2>{trackedFinding ? <button type="button" onClick={() => latest && onSelect(latest)}><span className={`insight-bullet ${severityDelta < 0 ? 'good' : 'attention'}`}>{severityDelta < 0 ? <TrendingDown size={18} /> : <Clock3 size={18} />}</span><div><strong>{trackedFinding.name} {severityDelta < 0 ? 'ดีขึ้น' : severityDelta > 0 ? 'ควรติดตาม' : 'ยังคงที่'}</strong><p>{previousFinding ? `ระดับ${previousFinding.severity} → ${trackedFinding.severity}` : 'มีข้อมูลจากการตรวจครั้งล่าสุด'}</p></div><ChevronRight size={18} /></button> : <div className="calendar-empty"><Clock3 size={22} /><p>ตรวจอย่างน้อยหนึ่งครั้งเพื่อเริ่มดูแนวโน้ม</p></div>}{previous && trackedFinding ? <button type="button" onClick={() => onSelect(previous)}><span className="insight-bullet attention"><History size={18} /></span><div><strong>ดูผลครั้งก่อน</strong><p>{previous.displayDate} · {previous.findings.length} รายการ</p></div><ChevronRight size={18} /></button> : null}</section></div>
  )
}

function ExaminationDetail({ exam, diseaseRecords = diseases, onClose }: { exam: Examination; diseaseRecords?: Disease[]; onClose: () => void }) {
  const recommendationLines = [...new Set(exam.findings.flatMap((finding) => { const disease = diseaseRecords.find((item) => item.id === finding.diseaseId); return disease ? [disease.care, disease.recommendation].filter(Boolean) : [] }))].slice(0, 2)
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title"><header><div><span className="eyebrow">{exam.id}</span><h2 id="detail-title">ผลตรวจวันที่ {exam.displayDate}</h2><p>{exam.time} น. · ภาพครบ 4 มุม</p></div><button className="icon-button" type="button" aria-label="ปิด" onClick={onClose}><X size={21} /></button></header><div className="detail-photo-row">{footSteps.map((step) => { const photo = exam.thumbnails?.[step.id]; return <div key={step.id} className={photo ? 'has-thumbnail' : ''} style={photo ? { backgroundImage: `url(${photo})`, backgroundPosition: 'center', backgroundSize: 'cover' } : undefined}>{!photo ? <Footprints size={28} /> : null}<span>{step.short}</span></div> })}</div><section><h3>ภาวะที่พบ</h3><div className="finding-list">{exam.findings.map((finding) => <FindingRow key={finding.diseaseId} finding={finding} />)}</div></section><section className="modal-recommendation"><HeartPulse size={22} /><div><h3>คำแนะนำ</h3>{(recommendationLines.length ? recommendationLines : ['ตรวจเท้าทุกวัน และติดต่อแพทย์หากมีอาการผิดปกติ']).map((line) => <p key={line}>{line}</p>)}</div></section><button className="button button-primary" type="button" onClick={onClose}>ปิดรายละเอียด</button></section></div>
}

function KnowledgePage({ articles, diseaseRecords, showToast }: { articles: KnowledgeArticle[]; diseaseRecords: Disease[]; showToast: (text: string) => void }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('ทั้งหมด')
  const [diseaseFilter, setDiseaseFilter] = useState('ทั้งหมด')
  const [severityFilter, setSeverityFilter] = useState('ทั้งหมด')
  const [selected, setSelected] = useState<KnowledgeArticle | null>(null)
  const categories = ['ทั้งหมด', ...new Set(articles.map((article) => article.category))]
  const diseaseOptions = ['ทั้งหมด', ...diseaseRecords.map((disease) => disease.id)]
  const severityOptions = ['ทั้งหมด', 'ทุกระดับ', 'เล็กน้อย', 'ปานกลาง', 'รุนแรง'] as const
  const filtered = useMemo(() => articles.filter((article) => (category === 'ทั้งหมด' || article.category === category) && (diseaseFilter === 'ทั้งหมด' || article.diseaseId === diseaseFilter) && (severityFilter === 'ทั้งหมด' || article.severity === severityFilter) && `${article.title} ${article.summary} ${article.diseaseId ?? ''}`.toLowerCase().includes(query.toLowerCase())), [articles, query, category, diseaseFilter, severityFilter])
  return (
    <div className="page knowledge-page"><PageTitle eyebrow="ความรู้สำหรับการดูแล" title="คลังความรู้ดูแลเท้า" description="คำแนะนำที่อ่านง่ายและผ่านการจัดทำโดยทีมดูแล" /><div className="knowledge-tools"><label className="search-field"><Search size={20} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหา เช่น ผิวแห้ง หนังด้าน" aria-label="ค้นหาคลังความรู้" /></label><div className="category-chips" aria-label="กรองตามหมวดหมู่">{categories.map((item) => <button className={category === item ? 'active' : ''} type="button" key={item} onClick={() => setCategory(item)}>{item}</button>)}</div><div className="knowledge-filter-row"><label><span>ภาวะ</span><select aria-label="กรองตามภาวะ" value={diseaseFilter} onChange={(event) => setDiseaseFilter(event.target.value)}>{diseaseOptions.map((id) => <option value={id} key={id}>{id === 'ทั้งหมด' ? id : `${id} · ${diseaseRecords.find((disease) => disease.id === id)?.name ?? id}`}</option>)}</select></label><label><span>ระดับความรุนแรง</span><select aria-label="กรองตามระดับความรุนแรง" value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)}>{severityOptions.map((severity) => <option value={severity} key={severity}>{severity}</option>)}</select></label></div></div>{filtered.length ? <div className="article-grid">{filtered.map((article, index) => <article className={`article-card tone-${article.tone}`} key={article.id}><div className="article-visual">{article.image ? <img src={article.image} alt="" /> : <HeartPulse size={30} />}<span>{index + 1}</span></div><div className="article-body"><div><span className="category-label">{article.category}</span><span>{article.severity} · {article.readTime}</span></div><h2>{article.title}</h2><p>{article.summary}</p><button className="card-link" type="button" onClick={() => setSelected(article)}>อ่านคำแนะนำ <ChevronRight size={18} /> </button></div></article>)}</div> : <div className="empty-state"><Search size={32} /><h2>ยังไม่พบหัวข้อนี้</h2><p>ลองค้นด้วยคำที่สั้นลง หรือเลือก “ทั้งหมด” เพื่อดูคำแนะนำที่มี</p><button className="button button-secondary" type="button" onClick={() => { setQuery(''); setCategory('ทั้งหมด'); setDiseaseFilter('ทั้งหมด'); setSeverityFilter('ทั้งหมด') }}>ดูบทความทั้งหมด</button></div>}{selected ? <ArticleModal article={selected} onClose={() => setSelected(null)} onSaved={() => { showToast('บันทึกไว้อ่านภายหลังแล้ว'); setSelected(null) }} /> : null}</div>
  )
}

function ArticleModal({ article, onClose, onSaved }: { article: KnowledgeArticle; onClose: () => void; onSaved: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><article className="detail-modal article-modal" role="dialog" aria-modal="true" aria-labelledby="article-title"><header><div><span className="eyebrow">{article.category} · {article.severity} · {article.readTime}</span><h2 id="article-title">{article.title}</h2></div><button className="icon-button" type="button" aria-label="ปิด" onClick={onClose}><X size={21} /></button></header><div className={`article-hero tone-${article.tone}`}>{article.image ? <img src={article.image} alt="" /> : <HeartPulse size={44} />}</div><p className="article-intro">{article.summary}</p><h3>ทำตาม 3 ขั้นตอนนี้</h3><ol className="care-steps">{article.care.map((step, index) => <li key={step}><span>{index + 1}</span>{step}</li>)}</ol>{article.treatment ? <section className="article-guidance"><h3>การรักษา</h3><p>{article.treatment}</p></section> : null}{article.recommendation ? <section className="article-guidance"><h3>คำแนะนำเพิ่มเติม</h3><p>{article.recommendation}</p></section> : null}<div className="review-explainer"><Info size={19} /><p>คำแนะนำทั่วไปอาจไม่เหมาะกับทุกคน หากมีอาการผิดปกติควรปรึกษาแพทย์</p></div><button className="button button-primary" type="button" onClick={onSaved}>บันทึกไว้อ่านภายหลัง</button></article></div>
}

function DoctorPages({ page, setPage, showToast, adminService, auditLogger }: { page: Page; setPage: (page: Page) => void; showToast: (text: string) => void; adminService?: AdminService; auditLogger?: AuditLogger }) {
  const [userRecords, setUserRecords] = useState<UserRecord[]>(() => adminService ? [] : seededUsers)
  const [diseaseRecords, setDiseaseRecords] = useState<Disease[]>(() => adminService ? [] : diseases)
  const [knowledgeRecords, setKnowledgeRecords] = useState<KnowledgeArticle[]>(() => adminService ? [] : knowledgeArticles)

  useEffect(() => {
    if (!adminService) return
    let cancelled = false
    const requests = [
      adminService.listUsers().then((records) => { if (!cancelled) setUserRecords(records) }),
      adminService.listDiseases().then((records) => { if (!cancelled) setDiseaseRecords(records) }),
      adminService.listKnowledge().then((records) => { if (!cancelled) setKnowledgeRecords(records) }),
    ]
    void Promise.allSettled(requests).then((results) => {
      if (!cancelled && results.some((result) => result.status === 'rejected')) showToast('โหลดข้อมูล Admin workspace บางส่วนไม่สำเร็จ กรุณาลองใหม่')
    })
    return () => { cancelled = true }
  }, [adminService, showToast])

  if (page === 'users') return <UserManagement users={userRecords} diseaseRecords={diseaseRecords} setUsers={setUserRecords} showToast={showToast} adminService={adminService} auditLogger={auditLogger} />
  if (page === 'diseases') return <DiseaseManagement diseases={diseaseRecords} setDiseases={setDiseaseRecords} showToast={showToast} adminService={adminService} auditLogger={auditLogger} />
  if (page === 'admin-knowledge') return <KnowledgeManagement articles={knowledgeRecords} diseaseRecords={diseaseRecords} setArticles={setKnowledgeRecords} showToast={showToast} adminService={adminService} />
  return <DoctorHome onNavigate={setPage} showToast={showToast} users={userRecords} diseaseRecords={diseaseRecords} adminService={adminService} />
}

function DoctorHome({ onNavigate, showToast, users, diseaseRecords, adminService }: { onNavigate: (page: Page) => void; showToast: (text: string) => void; users: UserRecord[]; diseaseRecords: Disease[]; adminService?: AdminService }) {
  const [selectedExam, setSelectedExam] = useState<Examination | null>(null)
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null)
  const activeCount = users.filter((user) => user.status === 'active').length
  const recordsWithHistory = users.filter((user) => user.lastExam !== 'ยังไม่มีประวัติ').length
  return <div className="page admin-page"><PageTitle eyebrow="Admin workspace" title="ภาพรวมการดูแล" description="ภาพรวมกลุ่มทดลอง DM Foot Care วันนี้" action={<button className="button button-primary" type="button" onClick={() => onNavigate('users')}><Plus size={18} />เพิ่มผู้ใช้งาน</button>} /><div className="admin-stat-grid"><AdminStat icon={Users} label="ผู้ใช้งาน Active" value={String(activeCount)} note={`จากทั้งหมด ${users.length} คน`} tone="blue" /><AdminStat icon={ClipboardCheck} label="มีประวัติการตรวจ" value={String(recordsWithHistory)} note="จากข้อมูลผู้ใช้งานปัจจุบัน" tone="teal" /><AdminStat icon={AlertTriangle} label="ควรติดตาม" value="3" note="มีระดับรุนแรง 1 คน" tone="amber" /><AdminStat icon={Activity} label="ตรวจล่าสุด" value={users.find((user) => user.lastExam !== 'ยังไม่มีประวัติ')?.lastExam ?? '—'} note={users.find((user) => user.lastExam !== 'ยังไม่มีประวัติ')?.username ?? 'ยังไม่มีข้อมูล'} tone="blue" /></div><div className="admin-grid"><section className="admin-panel"><div className="section-heading"><div><span className="eyebrow">ต้องตรวจสอบ</span><h2>ผู้ใช้ที่ควรติดตาม</h2></div><button className="text-link" type="button" onClick={() => onNavigate('users')}>ดูทั้งหมด</button></div><div className="followup-list"><FollowupRow initials="ปม" name="ประเสริฐ มั่นคง" code="DM002" issue="แผลที่เท้า · รุนแรง" time="7 ส.ค. 2569" severe /><FollowupRow initials="นส" name="นภา แสงทอง" code="DM003" issue="ผิวแห้ง · ปานกลาง" time="5 ส.ค. 2569" /><FollowupRow initials="วด" name="วิชัย ดีพร้อม" code="DM004" issue="ไม่ได้ตรวจ 11 วัน" time="28 ก.ค. 2569" /></div></section><section className="admin-panel"><div className="section-heading"><div><span className="eyebrow">7 วันที่ผ่านมา</span><h2>กิจกรรมการตรวจ</h2></div><span className="status-pill success"><TrendingUp size={15} />12 ครั้ง</span></div><div className="activity-chart">{[32,58,44,72,48,90,66].map((height, index) => <div key={index}><span style={{ height: `${height}%` }} /><small>{['อา','จ','อ','พ','พฤ','ศ','ส'][index]}</small></div>)}</div><div className="chart-legend"><span><i />การตรวจที่เสร็จสมบูรณ์</span><strong>เฉลี่ย 1.7 ครั้ง/วัน</strong></div></section></div><section className="admin-panel recent-panel"><div className="section-heading"><div><span className="eyebrow">กิจกรรมล่าสุด</span><h2>การตรวจล่าสุด</h2></div><button className="text-link" type="button" onClick={() => { onNavigate('users'); showToast('เปิดรายการผู้ใช้งานแล้ว') }}>ดูประวัติทั้งหมด</button></div><AdminTable users={users} onSelect={(user, index) => { if (adminService) setSelectedUser(user); else setSelectedExam(examinations[index] ?? examinations[0]) }} /></section>{selectedExam ? <ExaminationDetail exam={selectedExam} diseaseRecords={diseaseRecords} onClose={() => setSelectedExam(null)} /> : null}{selectedUser ? <UserHistoryModal user={selectedUser} diseaseRecords={diseaseRecords} adminService={adminService} onClose={() => setSelectedUser(null)} /> : null}</div>
}

function AdminStat({ icon: Icon, label, value, note, tone }: { icon: typeof Users; label: string; value: string; note: string; tone: string }) {
  return <div className="admin-stat"><span className={`admin-stat-icon tone-${tone}`}><Icon size={21} /></span><div><span>{label}</span><strong>{value}</strong><small>{note}</small></div></div>
}

function FollowupRow({ initials, name, code, issue, time, severe }: { initials: string; name: string; code: string; issue: string; time: string; severe?: boolean }) {
  return <button type="button"><span className="avatar">{initials}</span><div><strong>{name}</strong><small>{code} · {time}</small></div><span className={severe ? 'status-pill danger' : 'status-pill attention'}>{issue}</span><ChevronRight size={18} /></button>
}

function AdminTable({ users, onSelect }: { users: UserRecord[]; onSelect: (user: UserRecord, index: number) => void }) {
  return <div className="table-wrap"><table><thead><tr><th>ผู้ใช้งาน</th><th>วันที่ตรวจ</th><th>ผลที่พบ</th><th>สถานะ</th><th><span className="visually-hidden">การทำงาน</span></th></tr></thead><tbody>{users.slice(0,3).map((user, index) => <tr key={user.id}><td><div className="table-user"><span className="avatar">{user.name.slice(0,2)}</span><div><strong>{user.name}</strong><small>{user.username}</small></div></div></td><td>{user.lastExam}</td><td>{user.lastExam === 'ยังไม่มีประวัติ' ? 'ยังไม่มีผลตรวจ' : index === 1 ? 'แผลที่เท้า, ผิวแห้ง' : 'ผิวแห้ง, หนังด้าน'}</td><td><span className={index === 1 ? 'status-pill danger' : 'status-pill attention'}>{index === 1 ? 'ควรตรวจสอบ' : user.lastExam === 'ยังไม่มีประวัติ' ? 'รอตรวจ' : 'ติดตาม'}</span></td><td><button className="icon-button" type="button" aria-label={`ดู ${user.name}`} onClick={() => onSelect(user, index)}><Eye size={18} /></button></td></tr>)}</tbody></table></div>
}

type UserFormDraft = Omit<UserRecord, 'id' | 'lastExam'> & { pin?: string }

function UserManagement({ users, diseaseRecords, setUsers, showToast, adminService, auditLogger }: { users: UserRecord[]; diseaseRecords: Disease[]; setUsers: React.Dispatch<React.SetStateAction<UserRecord[]>>; showToast: (text: string) => void; adminService?: AdminService; auditLogger?: AuditLogger }) {
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<UserRecord | null>(null)
  const [creating, setCreating] = useState(false)
  const [historyUser, setHistoryUser] = useState<UserRecord | null>(null)
  const [pendingUserIds, setPendingUserIds] = useState<Set<string>>(() => new Set())
  const filtered = users.filter((user) => `${user.name} ${user.username}`.toLowerCase().includes(query.toLowerCase())).sort((left, right) => {
    const priority = { pending: 0, active: 1, inactive: 2 }
    return priority[left.status] - priority[right.status] || left.username.localeCompare(right.username)
  })
  const pendingCount = users.filter((user) => user.status === 'pending').length
  const toggle = (id: string) => {
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
        showToast(`${previousStatus === 'pending' ? 'อนุมัติ' : nextStatus === 'active' ? 'เปิด' : 'ปิด'}ใช้งาน ${user.username} แล้ว`)
      }).catch(() => {
        setUsers((current) => current.map((item) => item.id === id ? { ...item, status: previousStatus } : item))
        showToast('เปลี่ยนสถานะผู้ใช้ไม่สำเร็จ ระบบคืนสถานะเดิมแล้ว')
      }).finally(() => {
        setPendingUserIds((current) => { const next = new Set(current); next.delete(id); return next })
      })
    }
  }
  const closeForm = () => { setEditing(null); setCreating(false) }
  const saveUser = async (draft: UserFormDraft) => {
    if (adminService) {
      try {
        const saved = await adminService.saveUser(editing ? { ...draft, id: editing.id } : draft)
        setUsers((current) => editing ? current.map((user) => user.id === editing.id ? saved : user) : [...current, saved])
        void auditLogger?.append({ actorId: null, eventType: editing ? 'user_updated' : 'user_created', entityType: 'user', entityId: saved.id, payload: { username: saved.username, status: saved.status } }).catch(() => {})
        showToast(`${editing ? 'บันทึกข้อมูล' : 'เพิ่มผู้ใช้'} ${saved.username} แล้ว`)
        closeForm()
      } catch {
        showToast('บันทึกข้อมูลผู้ใช้ไม่สำเร็จ')
      }
      return
    }
    const { pin, ...safeDraft } = draft
    void pin
    if (editing) {
      setUsers((current) => current.map((user) => user.id === editing.id ? { ...user, ...safeDraft } : user))
      void auditLogger?.append({ actorId: null, eventType: 'user_updated', entityType: 'user', entityId: editing.id, payload: { username: safeDraft.username, status: safeDraft.status } }).catch(() => {})
      showToast(`บันทึกข้อมูล ${safeDraft.username} แล้ว`)
    } else {
      const nextId = `USR-${String(users.length + 1).padStart(3, '0')}`
      setUsers((current) => [...current, { ...safeDraft, id: nextId, lastExam: 'ยังไม่มีประวัติ' }])
      void auditLogger?.append({ actorId: null, eventType: 'user_created', entityType: 'user', entityId: nextId, payload: { username: safeDraft.username, status: safeDraft.status } }).catch(() => {})
      showToast(`เพิ่มผู้ใช้ ${safeDraft.username} แล้ว`)
    }
    closeForm()
  }
  return <div className="page admin-page"><PageTitle eyebrow="จัดการบัญชี" title="ผู้ใช้งาน" description="อนุมัติบัญชีใหม่ เปิดหรือปิดการใช้งาน และติดตามประวัติของ User" action={pendingCount ? <span className="pending-count"><Clock3 size={18} />รออนุมัติ {pendingCount} บัญชี</span> : undefined} /><div className="management-toolbar"><label className="search-field"><Search size={20} /><input aria-label="ค้นหาผู้ใช้งาน" placeholder="ค้นหาชื่อหรือ Username" value={query} onChange={(event) => setQuery(event.target.value)} /></label><span>ทั้งหมด {filtered.length} คน</span></div><div className="management-list">{filtered.map((user) => { const statusLabel = user.status === 'pending' ? 'รออนุมัติ' : user.status === 'active' ? 'เปิดใช้งาน' : 'ปิดใช้งาน'; return <article className={user.status === 'pending' ? 'pending-user' : ''} key={user.id} data-pending={pendingUserIds.has(user.id) ? 'true' : undefined}><div className="table-user"><span className="avatar">{user.name.slice(0,2)}</span><div><strong>{user.name}</strong><small>{user.username} · อายุ {calculateAge(user.dateOfBirth)} ปี · {calculateGeneration(user.dateOfBirth)} · {user.occupation}</small></div></div><div className="record-meta"><span>ตรวจล่าสุด</span><strong>{user.lastExam}</strong></div><span className={user.status === 'pending' ? 'status-pill attention' : user.status === 'active' ? 'status-pill success' : 'status-pill muted'}>{statusLabel}</span><div className="row-actions">{user.status === 'pending' ? <button className="button button-primary button-small approve-user-button" type="button" disabled={pendingUserIds.has(user.id)} onClick={() => toggle(user.id)}><Check size={17} />อนุมัติ</button> : null}<button className="button button-secondary button-small" type="button" onClick={() => { setCreating(false); setEditing(user) }}>แก้ไข</button><button className="button button-ghost button-small" type="button" onClick={() => setHistoryUser(user)}>ดูประวัติ</button>{user.status !== 'pending' ? <button className="icon-button" type="button" aria-label={`${user.status === 'active' ? 'ปิด' : 'เปิด'}ใช้งาน ${user.username}`} onClick={() => toggle(user.id)}><MoreHorizontal size={19} /></button> : null}</div></article> })}</div>{creating || editing ? <UserFormModal user={editing} onClose={closeForm} onSave={saveUser} /> : null}{historyUser ? <UserHistoryModal user={historyUser} diseaseRecords={diseaseRecords} adminService={adminService} onClose={() => setHistoryUser(null)} /> : null}</div>
}

function UserHistoryModal({ user, diseaseRecords = diseases, adminService, onClose }: { user: UserRecord; diseaseRecords?: Disease[]; adminService?: AdminService; onClose: () => void }) {
  const [selected, setSelected] = useState<Examination | null>(null)
  const [history, setHistory] = useState<Examination[]>(() => userExaminations[user.id] ?? [])
  const [loading, setLoading] = useState(Boolean(adminService))
  useEffect(() => {
    if (!adminService) return
    let cancelled = false
    void adminService.listUserExaminations(user.id).then((records) => {
      if (!cancelled) setHistory(records)
    }).catch(() => {
      if (!cancelled) setHistory([])
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [adminService, user.id])
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="detail-modal user-history-modal" role="dialog" aria-modal="true" aria-labelledby="user-history-title"><header><div><span className="eyebrow">ประวัติผู้ใช้งาน · {user.username}</span><h2 id="user-history-title">{user.name}</h2><p>ผลตรวจย้อนหลังสำหรับการติดตาม</p></div><button className="icon-button" type="button" aria-label="ปิด" onClick={onClose}><X size={21} /></button></header>{loading ? <div className="empty-state user-history-empty"><Clock3 size={32} /><h2>กำลังโหลดประวัติ</h2><p>กรุณารอสักครู่…</p></div> : history.length ? <div className="user-history-list">{history.map((exam) => <button className="user-history-card" type="button" key={exam.id} onClick={() => setSelected(exam)}><span className="user-history-date"><strong>{exam.displayDate.split(' ')[0]}</strong><small>{exam.displayDate.split(' ').slice(1).join(' ')}</small><small>{exam.time} น.</small></span><span className="user-history-summary"><strong>พบ {exam.findings.length} รายการ</strong><small>{exam.findings.map((finding) => `${finding.name} · ${finding.severity}`).join(' / ')}</small></span><ChevronRight size={19} /></button>)}</div> : <div className="empty-state user-history-empty"><ClipboardCheck size={32} /><h2>ยังไม่มีประวัติการตรวจ</h2><p>เมื่อผู้ใช้งานส่งผลตรวจแล้ว รายการจะแสดงในส่วนนี้</p></div>}<button className="button button-primary" type="button" onClick={onClose}>ปิดประวัติ</button></section>{selected ? <ExaminationDetail exam={selected} diseaseRecords={diseaseRecords} onClose={() => setSelected(null)} /> : null}</div>
}

function UserFormModal({ user, onClose, onSave }: { user: UserRecord | null; onClose: () => void; onSave: (draft: UserFormDraft) => void | Promise<void> }) {
  const [draft, setDraft] = useState<Omit<UserRecord, 'id' | 'lastExam'> & { pin: string }>(() => user
    ? { username: user.username, name: user.name, dateOfBirth: user.dateOfBirth, age: calculateAge(user.dateOfBirth), occupation: user.occupation, pinConfigured: user.pinConfigured, status: user.status, pin: '' }
    : { username: '', name: '', dateOfBirth: '1960-01-01', age: 0, occupation: '', pinConfigured: false, status: 'active', pin: '' })
  const [isSaving, setIsSaving] = useState(false)
  const update = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!draft.username.trim() || !draft.name.trim() || !draft.dateOfBirth || !draft.occupation.trim()) return
    const validPin = draft.pin === '' ? Boolean(user?.pinConfigured) : /^\d{4}$/.test(draft.pin)
    if (!validPin) return
    const safeDraft: Omit<UserRecord, 'id' | 'lastExam'> = { username: draft.username.trim().toUpperCase(), name: draft.name.trim(), dateOfBirth: draft.dateOfBirth, age: calculateAge(draft.dateOfBirth), occupation: draft.occupation.trim(), pinConfigured: Boolean(draft.pin || draft.pinConfigured), status: draft.status }
    setIsSaving(true)
    try {
      await onSave({ ...safeDraft, ...(draft.pin ? { pin: draft.pin } : {}) })
    } finally {
      setIsSaving(false)
    }
  }
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="detail-modal admin-form-modal" role="dialog" aria-modal="true" aria-labelledby="user-form-title"><header><div><span className="eyebrow">{user ? 'แก้ไขบัญชี' : 'บัญชีใหม่'}</span><h2 id="user-form-title">{user ? `แก้ไข ${user.username}` : 'เพิ่มผู้ใช้งาน'}</h2><p>ข้อมูลนี้ใช้สำหรับกลุ่มทดลองและสามารถแก้ไขภายหลังได้</p></div><button className="icon-button" type="button" aria-label="ปิด" onClick={onClose}><X size={21} /></button></header><form className="admin-form" onSubmit={submit}><label className="field-label" htmlFor="form-username">Username</label><input id="form-username" value={draft.username} onChange={(event) => update('username', event.target.value)} placeholder="เช่น DM005" autoComplete="off" /><label className="field-label" htmlFor="form-name">ชื่อ-นามสกุล</label><input id="form-name" value={draft.name} onChange={(event) => update('name', event.target.value)} placeholder="ชื่อผู้ใช้งาน" /><div className="admin-form-grid"><div><label className="field-label" htmlFor="form-dob">วันเดือนปีเกิด</label><input id="form-dob" type="date" value={draft.dateOfBirth} onChange={(event) => update('dateOfBirth', event.target.value)} /><div className="derived-metric"><span>อายุ / Generation</span><strong>{calculateAge(draft.dateOfBirth)} ปี · {calculateGeneration(draft.dateOfBirth)}</strong></div></div><div><label className="field-label" htmlFor="form-status">สถานะ</label><select id="form-status" value={draft.status} onChange={(event) => update('status', event.target.value as UserRecord['status'])}><option value="pending">รออนุมัติ</option><option value="active">เปิดใช้งาน</option><option value="inactive">ปิดใช้งาน</option></select></div></div><label className="field-label" htmlFor="form-occupation">อาชีพ</label><input id="form-occupation" value={draft.occupation} onChange={(event) => update('occupation', event.target.value)} placeholder="อาชีพ" /><label className="field-label" htmlFor="form-pin">PIN เริ่มต้น (4 หลัก){user ? ' · กรอกใหม่เมื่อเปลี่ยน PIN' : ''}</label><input id="form-pin" type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={draft.pin} onChange={(event) => update('pin', event.target.value.replace(/\D/g, '').slice(0, 4))} placeholder={user ? 'เว้นว่างเพื่อใช้ PIN เดิม' : 'เช่น 1234'} autoComplete="new-password" /><small className="field-helper">ระบบจะไม่แสดงหรือเก็บ PIN ดิบในหน้าจอจัดการ หากต้องการเปลี่ยน PIN ให้กรอกเลขใหม่แล้วบันทึก</small><div className="admin-form-actions"><button className="button button-secondary" type="button" disabled={isSaving} onClick={onClose}>ยกเลิก</button><button className={isSaving ? 'button button-primary action-pending' : 'button button-primary'} type="submit" disabled={isSaving}>{isSaving ? 'กำลังบันทึก…' : 'บันทึกข้อมูล'}</button></div></form></section></div>
}

function DiseaseManagement({ diseases: diseaseRecords, setDiseases, showToast, adminService, auditLogger }: { diseases: typeof diseases; setDiseases: React.Dispatch<React.SetStateAction<typeof diseases>>; showToast: (text: string) => void; adminService?: AdminService; auditLogger?: AuditLogger }) {
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Disease | null>(null)
  const [creating, setCreating] = useState(false)
  const [pendingDiseaseIds, setPendingDiseaseIds] = useState<Set<string>>(() => new Set())
  const filtered = diseaseRecords.filter((disease) => `${disease.name} ${disease.id} ${disease.category}`.toLowerCase().includes(query.toLowerCase()))
  const toggle = (id: string) => {
    if (pendingDiseaseIds.has(id)) return
    const disease = diseaseRecords.find((item) => item.id === id)
    if (!disease) return
    const previousActive = disease.active
    const nextActive = !previousActive
    setDiseases((current) => current.map((item) => item.id === id ? { ...item, active: nextActive } : item))
    if (adminService) {
      setPendingDiseaseIds((current) => new Set(current).add(id))
      void adminService.setDiseaseActive(id, nextActive).then(() => {
        showToast(`${previousActive ? 'ปิด' : 'เปิด'}ใช้งาน ${disease.name} แล้ว`)
      }).catch(() => {
        setDiseases((current) => current.map((item) => item.id === id ? { ...item, active: previousActive } : item))
        showToast('เปลี่ยนสถานะ Disease ไม่สำเร็จ ระบบคืนสถานะเดิมแล้ว')
      }).finally(() => {
        setPendingDiseaseIds((current) => { const next = new Set(current); next.delete(id); return next })
      })
      return
    }
    void auditLogger?.append({ actorId: null, eventType: 'disease_master_updated', entityType: 'disease', entityId: id, payload: { action: 'status_changed', active: nextActive } }).catch(() => {})
  }
  const openCreate = () => { setEditing(null); setCreating(true) }
  const closeForm = () => { setEditing(null); setCreating(false) }
  const saveDisease = async (draft: Omit<Disease, 'id'>) => {
    if (adminService) {
      try {
        const saved = await adminService.saveDisease(editing ? { ...draft, id: editing.id } : draft)
        setDiseases((current) => editing ? current.map((item) => item.id === editing.id ? saved : item) : [...current, saved])
        showToast(`${editing ? 'บันทึกเกณฑ์' : 'เพิ่ม'} ${saved.name} แล้ว`)
        closeForm()
      } catch {
        showToast('บันทึก Disease Master ไม่สำเร็จ')
      }
      return
    }
    if (editing) {
      setDiseases((current) => current.map((disease) => disease.id === editing.id ? { ...disease, ...draft } : disease))
      void auditLogger?.append({ actorId: null, eventType: 'disease_master_updated', entityType: 'disease', entityId: editing.id, payload: { name: draft.name, active: draft.active } }).catch(() => {})
      showToast(`บันทึกเกณฑ์ ${draft.name} แล้ว`)
    } else {
      const nextId = `D${String(diseaseRecords.length + 1).padStart(3, '0')}`
      setDiseases((current) => [...current, { ...draft, id: nextId }])
      void auditLogger?.append({ actorId: null, eventType: 'disease_master_created', entityType: 'disease', entityId: nextId, payload: { name: draft.name, active: draft.active } }).catch(() => {})
      showToast(`เพิ่ม ${draft.name} แล้ว`)
    }
    closeForm()
  }
  return <div className="page admin-page"><PageTitle eyebrow="เกณฑ์การประเมิน" title="Disease Master" description="AI จะประเมินเฉพาะรายการที่เปิดใช้งานและตามเกณฑ์ที่ผู้ดูแลกำหนด" action={<button className="button button-primary" type="button" onClick={openCreate}><Plus size={18} />เพิ่มรายการ</button>} /><div className="master-alert"><ShieldCheck size={20} /><div><strong>ผู้ดูแลเป็นผู้ควบคุมรายการทั้งหมด</strong><p>AI ไม่มีสิทธิ์สร้างชื่อภาวะหรือระดับความรุนแรงใหม่</p></div></div><div className="management-toolbar"><label className="search-field"><Search size={20} /><input aria-label="ค้นหารายการภาวะ" placeholder="ค้นหาชื่อ รหัส หรือหมวดหมู่" value={query} onChange={(event) => setQuery(event.target.value)} /></label><span>เปิดใช้ {diseaseRecords.filter((item) => item.active).length} รายการ</span></div><div className="disease-grid">{filtered.map((disease) => <article className={disease.active ? '' : 'inactive'} key={disease.id} data-pending={pendingDiseaseIds.has(disease.id) ? 'true' : undefined}><header><span className="disease-code">{disease.id}</span><button className={disease.active ? 'toggle on' : 'toggle'} type="button" role="switch" aria-checked={disease.active} aria-label={`${disease.active ? 'ปิด' : 'เปิด'}ใช้งาน ${disease.name}`} disabled={pendingDiseaseIds.has(disease.id)} onClick={() => toggle(disease.id)}><span /></button></header><span className="category-label">{disease.category}</span><h2>{disease.name}</h2><p>{disease.description}</p><div className="criteria-box"><span>เกณฑ์ตรวจจับ</span><p>{disease.criteria}</p></div><div className="criteria-box"><span>เกณฑ์ระดับความรุนแรง</span>{getDiseaseSeverityLevels(disease).map((level) => <p key={level.label}><strong>{level.label}:</strong> {level.criteria || 'ยังไม่ได้ระบุเกณฑ์'}</p>)}</div><div className="disease-footer"><span className={`severity-label severity-${severityRank[disease.severity]}`}>สูงสุด: {disease.severity}</span><button type="button" onClick={() => { setCreating(false); setEditing(disease) }}>แก้ไขเกณฑ์ <ChevronRight size={16} /></button></div></article>)}</div>{creating || editing ? <DiseaseFormModal disease={editing} onClose={closeForm} onSave={saveDisease} /> : null}</div>
}

function DiseaseFormModal({ disease, onClose, onSave }: { disease: Disease | null; onClose: () => void; onSave: (draft: Omit<Disease, 'id'>) => void | Promise<void> }) {
  const [draft, setDraft] = useState<Omit<Disease, 'id'>>(() => {
    const levels = getDiseaseSeverityLevels(disease ?? undefined)
    return disease
      ? { name: disease.name, category: disease.category, description: disease.description, criteria: disease.criteria, severityCriteria: disease.severityCriteria, severity: disease.severity, severityLevels: levels, care: disease.care, recommendation: disease.recommendation, referenceImage: disease.referenceImage, active: disease.active }
      : { name: '', category: 'ผิวหนัง', description: '', criteria: '', severityCriteria: '', severity: 'เล็กน้อย', severityLevels: levels, care: '', recommendation: '', referenceImage: undefined, active: true }
  })
  const [isSaving, setIsSaving] = useState(false)
  const update = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const updateSeverityCriteria = (label: Severity, criteria: string) => {
    const levels = (draft.severityLevels ?? getDiseaseSeverityLevels()).map((level) => level.label === label ? { ...level, criteria } : level)
    update('severityLevels', levels)
    update('severityCriteria', serializeSeverityLevels(levels))
  }
  const submit = async (event: React.FormEvent) => {
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
  const readReferenceImage = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => update('referenceImage', String(reader.result)); reader.readAsDataURL(file); event.target.value = '' }
  const levels = draft.severityLevels ?? getDiseaseSeverityLevels()
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="detail-modal admin-form-modal" role="dialog" aria-modal="true" aria-labelledby="disease-form-title"><header><div><span className="eyebrow">{disease ? 'แก้ไขเกณฑ์' : 'รายการใหม่'}</span><h2 id="disease-form-title">{disease ? `แก้ไข ${disease.name}` : 'เพิ่มรายการภาวะ'}</h2><p>AI จะใช้รายการนี้เฉพาะเมื่อเปิดใช้งานและมีเกณฑ์ครบถ้วน</p></div><button className="icon-button" type="button" aria-label="ปิด" onClick={onClose}><X size={21} /></button></header><form className="admin-form" onSubmit={submit}><label className="field-label" htmlFor="disease-name">ชื่อภาวะ</label><input id="disease-name" value={draft.name} onChange={(event) => update('name', event.target.value)} placeholder="เช่น ตาปลา" /><div className="admin-form-grid"><div><label className="field-label" htmlFor="disease-category">หมวดหมู่</label><input id="disease-category" value={draft.category} onChange={(event) => update('category', event.target.value)} placeholder="เช่น ผิวหนัง" /></div><div><label className="field-label" htmlFor="disease-severity">ระดับสูงสุด</label><select id="disease-severity" value={draft.severity} onChange={(event) => update('severity', event.target.value as Severity)}>{severityOrder.map((label) => <option value={label} key={label}>{label}</option>)}</select></div></div><label className="field-label" htmlFor="disease-description">คำอธิบาย</label><textarea id="disease-description" value={draft.description} onChange={(event) => update('description', event.target.value)} placeholder="อธิบายภาวะให้ผู้ใช้เข้าใจ" /><label className="field-label" htmlFor="disease-criteria">เกณฑ์ตรวจจับ</label><textarea id="disease-criteria" value={draft.criteria} onChange={(event) => update('criteria', event.target.value)} placeholder="เกณฑ์ที่ AI ใช้ประเมิน" /><div className="severity-criteria-editor"><span className="field-label">เกณฑ์แต่ละระดับความรุนแรง</span><small className="field-helper">กำหนดเกณฑ์แยกตามระดับ เพื่อให้ AI ใช้ schema ของภาวะนี้เท่านั้น</small>{levels.map((level) => <label key={level.label} className="severity-criteria-row" htmlFor={`disease-severity-${level.rank}`}><span className={`severity-label severity-${level.rank}`}>{level.label}</span><textarea id={`disease-severity-${level.rank}`} value={level.criteria} onChange={(event) => updateSeverityCriteria(level.label, event.target.value)} placeholder={`เกณฑ์ระดับ${level.label}`} /></label>)}</div><label className="field-label" htmlFor="disease-care">คำแนะนำการดูแล</label><textarea id="disease-care" value={draft.care} onChange={(event) => update('care', event.target.value)} placeholder="คำแนะนำเมื่อพบภาวะนี้" /><label className="field-label" htmlFor="disease-recommendation">การรักษา / คำแนะนำเพิ่มเติม</label><textarea id="disease-recommendation" value={draft.recommendation} onChange={(event) => update('recommendation', event.target.value)} placeholder="เมื่อใดควรพบแพทย์ หรือแนวทางส่งต่อ" /><label className="field-label" htmlFor="disease-reference-image">รูปอ้างอิง</label><input id="disease-reference-image" type="file" accept="image/*" onChange={readReferenceImage} />{draft.referenceImage ? <img className="reference-image-preview" src={draft.referenceImage} alt="รูปอ้างอิงภาวะ" /> : <small className="field-helper">รูปจะถูกเก็บเป็น preview ใน prototype; production จะอัปโหลดไป storage ที่กำหนด</small>}<label className="form-switch"><input type="checkbox" checked={draft.active} onChange={(event) => update('active', event.target.checked)} /><span className={draft.active ? 'toggle on' : 'toggle'}><span /></span><span>เปิดส่งรายการนี้ให้ AI ประเมิน</span></label><div className="admin-form-actions"><button className="button button-secondary" type="button" disabled={isSaving} onClick={onClose}>ยกเลิก</button><button className={isSaving ? 'button button-primary action-pending' : 'button button-primary'} type="submit" disabled={isSaving}>{isSaving ? 'กำลังบันทึก…' : 'บันทึกเกณฑ์'}</button></div></form></section></div>
}

function KnowledgeManagement({ articles, diseaseRecords, setArticles, showToast, adminService }: { articles: KnowledgeArticle[]; diseaseRecords: Disease[]; setArticles: React.Dispatch<React.SetStateAction<KnowledgeArticle[]>>; showToast: (text: string) => void; adminService?: AdminService }) {
  const [editing, setEditing] = useState<KnowledgeArticle | null>(null)
  const [creating, setCreating] = useState(false)
  const publishedCount = articles.filter((article) => (article.status ?? 'published') === 'published').length
  const draftCount = articles.filter((article) => article.status === 'draft').length
  const closeForm = () => { setEditing(null); setCreating(false) }
  const saveArticle = async (draft: Omit<KnowledgeArticle, 'id'>) => {
    if (adminService) {
      try {
        const saved = await adminService.saveKnowledge(editing ? { ...draft, id: editing.id } : draft)
        setArticles((current) => editing ? current.map((article) => article.id === editing.id ? saved : article) : [...current, saved])
        showToast(`${editing ? 'บันทึกบทความ' : 'สร้างบทความ'} “${saved.title}” แล้ว`)
        closeForm()
      } catch {
        showToast('บันทึกบทความไม่สำเร็จ')
      }
      return
    }
    if (editing) {
      setArticles((current) => current.map((article) => article.id === editing.id ? { ...article, ...draft } : article))
      showToast(`บันทึกบทความ “${draft.title}” แล้ว`)
    } else {
      const nextId = `K${String(articles.length + 1).padStart(3, '0')}`
      setArticles((current) => [...current, { ...draft, id: nextId }])
      showToast(`สร้างบทความ “${draft.title}” แล้ว`)
    }
    closeForm()
  }
  return <div className="page admin-page"><PageTitle eyebrow="เนื้อหาสำหรับผู้ใช้" title="จัดการคลังความรู้" description="บทความและคำแนะนำที่เชื่อมโยงกับผลตรวจ" action={<button className="button button-primary" type="button" onClick={() => { setEditing(null); setCreating(true) }}><Plus size={18} />สร้างบทความ</button>} /><div className="admin-stat-grid compact"><AdminStat icon={BookOpen} label="เผยแพร่แล้ว" value={String(publishedCount)} note="พร้อมให้ผู้ใช้อ่าน" tone="blue" /><AdminStat icon={Clock3} label="ฉบับร่าง" value={String(draftCount)} note="รอตรวจทาน" tone="amber" /><AdminStat icon={Eye} label="เปิดอ่านเดือนนี้" value="86" note="เพิ่มขึ้น 18%" tone="teal" /></div><div className="knowledge-admin-list">{articles.map((article) => { const status = article.status ?? 'published'; return <article key={article.id}><span className={`article-icon tone-${article.tone}`}><HeartPulse size={23} /></span><div><span className="category-label">{article.category}</span><h2>{article.title}</h2><p>{article.summary}</p></div><span className={status === 'published' ? 'status-pill success' : status === 'draft' ? 'status-pill attention' : 'status-pill muted'}>{status === 'published' ? 'เผยแพร่แล้ว' : status === 'draft' ? 'ฉบับร่าง' : 'เก็บถาวร'}</span><button className="button button-secondary button-small" type="button" onClick={() => { setCreating(false); setEditing(article) }}>แก้ไข</button></article> })}</div>{creating || editing ? <KnowledgeFormModal article={editing} diseases={diseaseRecords} onClose={closeForm} onSave={saveArticle} /> : null}</div>
}

function KnowledgeFormModal({ article, diseases: diseaseRecords, onClose, onSave }: { article: KnowledgeArticle | null; diseases: Disease[]; onClose: () => void; onSave: (draft: Omit<KnowledgeArticle, 'id'>) => void | Promise<void> }) {
  const [draft, setDraft] = useState<Omit<KnowledgeArticle, 'id'>>(() => article ? { title: article.title, diseaseId: article.diseaseId, category: article.category, severity: article.severity, summary: article.summary, care: article.care, treatment: article.treatment, recommendation: article.recommendation, image: article.image, readTime: article.readTime, tone: article.tone, status: article.status ?? 'published' } : { title: '', diseaseId: '', category: 'ผิวหนัง', severity: 'ทุกระดับ', summary: '', care: ['', '', ''], treatment: '', recommendation: '', image: undefined, readTime: 'อ่าน 3 นาที', tone: 'blue', status: 'draft' })
  const update = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const submit = (event: React.FormEvent) => { event.preventDefault(); if (!draft.title.trim() || !draft.category.trim() || !draft.summary.trim() || draft.care.filter((step) => step.trim()).length === 0) return; onSave({ ...draft, title: draft.title.trim(), category: draft.category.trim(), summary: draft.summary.trim(), care: draft.care.map((step) => step.trim()).filter(Boolean) }) }
  const readImage = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => update('image', String(reader.result)); reader.readAsDataURL(file); event.target.value = '' }
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="detail-modal admin-form-modal" role="dialog" aria-modal="true" aria-labelledby="knowledge-form-title"><header><div><span className="eyebrow">{article ? 'แก้ไขบทความ' : 'บทความใหม่'}</span><h2 id="knowledge-form-title">{article ? `แก้ไข ${article.title}` : 'สร้างบทความ'}</h2><p>ตรวจทานภาษาและสถานะก่อนเผยแพร่ให้ผู้ใช้อ่าน</p></div><button className="icon-button" type="button" aria-label="ปิด" onClick={onClose}><X size={21} /></button></header><form className="admin-form" onSubmit={submit}><label className="field-label" htmlFor="knowledge-title">ชื่อบทความ</label><input id="knowledge-title" value={draft.title} onChange={(event) => update('title', event.target.value)} placeholder="เช่น ดูแลเท้าเมื่อผิวแห้ง" /><div className="admin-form-grid"><div><label className="field-label" htmlFor="knowledge-disease">เชื่อมกับภาวะ</label><select id="knowledge-disease" value={draft.diseaseId ?? ''} onChange={(event) => update('diseaseId', event.target.value)}><option value="">ไม่ระบุ</option>{diseaseRecords.map((disease) => <option value={disease.id} key={disease.id}>{disease.id} · {disease.name}</option>)}</select></div><div><label className="field-label" htmlFor="knowledge-severity">ระดับ</label><select id="knowledge-severity" value={draft.severity} onChange={(event) => update('severity', event.target.value as KnowledgeArticle['severity'])}><option>ทุกระดับ</option><option>เล็กน้อย</option><option>ปานกลาง</option><option>รุนแรง</option></select></div></div><div className="admin-form-grid"><div><label className="field-label" htmlFor="knowledge-category">หมวดหมู่</label><input id="knowledge-category" value={draft.category} onChange={(event) => update('category', event.target.value)} /></div><div><label className="field-label" htmlFor="knowledge-status">สถานะ</label><select id="knowledge-status" value={draft.status} onChange={(event) => update('status', event.target.value as KnowledgeArticle['status'])}><option value="draft">ฉบับร่าง</option><option value="published">เผยแพร่แล้ว</option><option value="archived">เก็บถาวร</option></select></div></div><label className="field-label" htmlFor="knowledge-summary">สรุปสั้น</label><textarea id="knowledge-summary" value={draft.summary} onChange={(event) => update('summary', event.target.value)} placeholder="คำอธิบายที่แสดงบนการ์ด" /><label className="field-label" htmlFor="knowledge-care-1">ขั้นตอนการดูแล</label>{[0, 1, 2].map((index) => <input key={index} id={`knowledge-care-${index + 1}`} value={draft.care[index] ?? ''} onChange={(event) => update('care', draft.care.map((step, stepIndex) => stepIndex === index ? event.target.value : step))} placeholder={`ขั้นตอนที่ ${index + 1}`} />)}<label className="field-label" htmlFor="knowledge-treatment">การรักษา</label><textarea id="knowledge-treatment" value={draft.treatment ?? ''} onChange={(event) => update('treatment', event.target.value)} placeholder="แนวทางการรักษาหรือการส่งต่อ" /><label className="field-label" htmlFor="knowledge-recommendation">คำแนะนำเพิ่มเติม</label><textarea id="knowledge-recommendation" value={draft.recommendation ?? ''} onChange={(event) => update('recommendation', event.target.value)} placeholder="ข้อควรระวังหรือคำแนะนำสำหรับผู้ใช้" /><label className="field-label" htmlFor="knowledge-image">รูปประกอบ</label><input id="knowledge-image" type="file" accept="image/*" onChange={readImage} />{draft.image ? <img className="reference-image-preview" src={draft.image} alt="รูปประกอบบทความ" /> : <small className="field-helper">รูปจะถูกเก็บเป็น preview ใน prototype; production จะอัปโหลดไป storage ที่กำหนด</small>}<div className="admin-form-actions"><button className="button button-secondary" type="button" onClick={onClose}>ยกเลิก</button><button className="button button-primary" type="submit">บันทึกบทความ</button></div></form></section></div>
}

export default App
