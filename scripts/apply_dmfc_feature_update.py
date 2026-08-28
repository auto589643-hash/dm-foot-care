from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding='utf-8')


def replace_once(path: str, old: str, new: str) -> None:
    source = read(path)
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected exactly one match, found {count}: {old[:100]!r}')
    write(path, source.replace(old, new, 1))


def replace_all_checked(path: str, old: str, new: str, minimum: int = 1) -> None:
    source = read(path)
    count = source.count(old)
    if count < minimum:
        raise RuntimeError(f'{path}: expected at least {minimum} matches, found {count}: {old[:100]!r}')
    write(path, source.replace(old, new))


def replace_block(path: str, start_marker: str, end_marker: str, new_block: str) -> None:
    source = read(path)
    start = source.find(start_marker)
    if start < 0:
        raise RuntimeError(f'{path}: start marker not found: {start_marker!r}')
    end = source.find(end_marker, start + len(start_marker))
    if end < 0:
        raise RuntimeError(f'{path}: end marker not found: {end_marker!r}')
    write(path, source[:start] + new_block.rstrip() + '\n\n' + source[end:])


# ---------- Type surface ----------
replace_once(
    'src/types.ts',
    "export type Role = 'user' | 'admin'\n",
    "export type Role = 'user' | 'admin'\nexport type Sex = 'male' | 'female' | 'other' | 'prefer_not_to_say'\n",
)
replace_once(
    'src/types.ts',
    "  occupation: string\n  role: Role\n",
    "  occupation: string\n  sex?: Sex\n  diabetesYears?: number | null\n  latestHba1c?: number | null\n  role: Role\n",
)
replace_once(
    'src/types.ts',
    "  recommendation?: string\n  image?: string\n",
    "  recommendation?: string\n  youtubeUrl?: string\n  image?: string\n",
)
replace_once(
    'src/types.ts',
    "  occupation: string\n  pinConfigured: boolean\n",
    "  occupation: string\n  sex?: Sex\n  diabetesYears?: number | null\n  latestHba1c?: number | null\n  pinConfigured: boolean\n",
)
replace_once(
    'src/types.ts',
    "  occupation: string\n  pin: string\n}\n",
    "  occupation: string\n  sex: Sex\n  diabetesYears: number\n  latestHba1c?: number\n  pin: string\n}\n",
)

# ---------- Registration backend: active immediately + clinical context ----------
register_normalize = r'''function normalizeInput(body) {
  const username = String(body.username || '').trim().toUpperCase()
  const displayName = String(body.displayName || '').trim()
  const dateOfBirth = String(body.dateOfBirth || '').trim()
  const occupation = String(body.occupation || '').trim()
  const sex = String(body.sex || '').trim()
  const diabetesYears = Number(body.diabetesYears)
  const latestHba1cRaw = body.latestHba1c
  const latestHba1c = latestHba1cRaw === '' || latestHba1cRaw == null ? null : Number(latestHba1cRaw)
  const pin = String(body.pin || '').trim()
  if (!USERNAME_PATTERN.test(username)) throw badRequest('Username ต้องมี 3-32 ตัวอักษร และใช้ A-Z, 0-9, _ หรือ - เท่านั้น')
  if (!displayName || displayName.length > 160) throw badRequest('กรุณาระบุชื่อ-นามสกุล')
  if (!occupation || occupation.length > 160) throw badRequest('กรุณาระบุอาชีพ')
  if (!['male', 'female', 'other', 'prefer_not_to_say'].includes(sex)) throw badRequest('กรุณาระบุเพศ')
  if (!Number.isInteger(diabetesYears) || diabetesYears < 0 || diabetesYears > 100) throw badRequest('จำนวนปีที่เป็นเบาหวานต้องอยู่ระหว่าง 0-100 ปี')
  if (latestHba1c != null && (!Number.isFinite(latestHba1c) || latestHba1c <= 0 || latestHba1c > 30)) throw badRequest('HbA1c ล่าสุดไม่ถูกต้อง')
  if (!PIN_PATTERN.test(pin)) throw badRequest('PIN ต้องเป็นตัวเลข 4 หลัก')
  const date = new Date(`${dateOfBirth}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateOfBirth || date > new Date()) {
    throw badRequest('วันเดือนปีเกิดไม่ถูกต้อง')
  }
  return { username, displayName, dateOfBirth, occupation, sex, diabetesYears, latestHba1c, pin }
}'''
replace_block('backend/api/v1/auth/register.mjs', 'function normalizeInput(body) {', 'async function listAuthUsers()', register_normalize)
replace_once(
    'backend/api/v1/auth/register.mjs',
    "        occupation: input.occupation,\n        account_status: 'pending',\n        pin_hash: pinHash,\n",
    "        occupation: input.occupation,\n        sex: input.sex,\n        diabetes_years: input.diabetesYears,\n        latest_hba1c: input.latestHba1c,\n        account_status: 'active',\n        pin_hash: pinHash,\n",
)
replace_once(
    'backend/api/v1/auth/register.mjs',
    "      status: 'pending',\n      recovered: authResult.recovered,\n      message: 'ลงทะเบียนสำเร็จ กรุณารอผู้ดูแลระบบอนุมัติบัญชี',\n",
    "      status: 'active',\n      recovered: authResult.recovered,\n      message: 'ลงทะเบียนสำเร็จ บัญชีพร้อมใช้งานทันที',\n",
)

# ---------- Profile mapping ----------
replace_once(
    'backend/api/_lib/supabase.mjs',
    "    occupation: profile.occupation || '',\n    role: role === 'admin' ? 'admin' : 'user',\n",
    "    occupation: profile.occupation || '',\n    sex: profile.sex || undefined,\n    diabetesYears: profile.diabetes_years == null ? null : Number(profile.diabetes_years),\n    latestHba1c: profile.latest_hba1c == null ? null : Number(profile.latest_hba1c),\n    role: role === 'admin' ? 'admin' : 'user',\n",
)
replace_all_checked(
    'backend/api/_lib/supabase.mjs',
    'select=user_id,username,display_name,date_of_birth,occupation,account_status',
    'select=user_id,username,display_name,date_of_birth,occupation,sex,diabetes_years,latest_hba1c,account_status',
    minimum=2,
)

# ---------- Admin user API reads/writes new profile fields ----------
replace_once(
    'backend/api/v1/admin/users.mjs',
    "    occupation: profile.occupation || '',\n    pinConfigured: Boolean(profile.pin_hash),\n",
    "    occupation: profile.occupation || '',\n    sex: profile.sex || undefined,\n    diabetesYears: profile.diabetes_years == null ? null : Number(profile.diabetes_years),\n    latestHba1c: profile.latest_hba1c == null ? null : Number(profile.latest_hba1c),\n    pinConfigured: Boolean(profile.pin_hash),\n",
)
admin_create_normalize = r'''function normalizeCreateInput(body) {
  const username = String(body.username || '').trim().toUpperCase()
  const name = String(body.name || '').trim()
  const dateOfBirth = String(body.dateOfBirth || '').trim()
  const occupation = String(body.occupation || '').trim()
  const sexRaw = String(body.sex || '').trim()
  const sex = sexRaw && ['male', 'female', 'other', 'prefer_not_to_say'].includes(sexRaw) ? sexRaw : null
  const diabetesYears = body.diabetesYears === '' || body.diabetesYears == null ? null : Number(body.diabetesYears)
  const latestHba1c = body.latestHba1c === '' || body.latestHba1c == null ? null : Number(body.latestHba1c)
  const status = ['pending', 'inactive', 'active'].includes(body.status) ? body.status : ''
  const pin = String(body.pin || '')
  if (!USERNAME_PATTERN.test(username)) throw badRequest('Username ต้องมี 3-32 ตัวอักษร และใช้ A-Z, 0-9, _ หรือ - เท่านั้น')
  if (!name || name.length > 160) throw badRequest('กรุณาระบุชื่อ-นามสกุล')
  if (!occupation || occupation.length > 160) throw badRequest('กรุณาระบุอาชีพ')
  if (sexRaw && !sex) throw badRequest('เพศไม่ถูกต้อง')
  if (diabetesYears != null && (!Number.isInteger(diabetesYears) || diabetesYears < 0 || diabetesYears > 100)) throw badRequest('จำนวนปีที่เป็นเบาหวานไม่ถูกต้อง')
  if (latestHba1c != null && (!Number.isFinite(latestHba1c) || latestHba1c <= 0 || latestHba1c > 30)) throw badRequest('HbA1c ล่าสุดไม่ถูกต้อง')
  if (!PIN_PATTERN.test(pin)) throw badRequest('PIN ต้องเป็นตัวเลข 4 หลัก')
  if (!status) throw badRequest('สถานะผู้ใช้ไม่ถูกต้อง')
  const date = new Date(`${dateOfBirth}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateOfBirth || date > new Date()) {
    throw badRequest('วันเดือนปีเกิดไม่ถูกต้อง')
  }
  return { username, name, dateOfBirth, occupation, sex, diabetesYears, latestHba1c, status, pin }
}'''
replace_block('backend/api/v1/admin/users.mjs', 'function normalizeCreateInput(body) {', 'async function createAuthUser(username)', admin_create_normalize)
replace_all_checked(
    'backend/api/v1/admin/users.mjs',
    'select=user_id,username,display_name,date_of_birth,occupation,account_status,pin_hash',
    'select=user_id,username,display_name,date_of_birth,occupation,sex,diabetes_years,latest_hba1c,account_status,pin_hash',
)
replace_once(
    'backend/api/v1/admin/users.mjs',
    "        occupation: input.occupation,\n        account_status: input.status,\n",
    "        occupation: input.occupation,\n        sex: input.sex,\n        diabetes_years: input.diabetesYears,\n        latest_hba1c: input.latestHba1c,\n        account_status: input.status,\n",
)
replace_once(
    'backend/api/v1/admin/bootstrap.mjs',
    'select=user_id,username,display_name,date_of_birth,occupation,account_status,pin_hash',
    'select=user_id,username,display_name,date_of_birth,occupation,sex,diabetes_years,latest_hba1c,account_status,pin_hash',
)
replace_once(
    'backend/api/v1/admin/user.mjs',
    "  if ('status' in body) {\n",
    "  if ('sex' in body) {\n    const sex = body.sex == null || body.sex === '' ? null : String(body.sex)\n    if (sex && !['male', 'female', 'other', 'prefer_not_to_say'].includes(sex)) throw badRequest('เพศไม่ถูกต้อง')\n    patch.sex = sex\n  }\n  if ('diabetesYears' in body) {\n    const value = body.diabetesYears === '' || body.diabetesYears == null ? null : Number(body.diabetesYears)\n    if (value != null && (!Number.isInteger(value) || value < 0 || value > 100)) throw badRequest('จำนวนปีที่เป็นเบาหวานไม่ถูกต้อง')\n    patch.diabetes_years = value\n  }\n  if ('latestHba1c' in body) {\n    const value = body.latestHba1c === '' || body.latestHba1c == null ? null : Number(body.latestHba1c)\n    if (value != null && (!Number.isFinite(value) || value <= 0 || value > 30)) throw badRequest('HbA1c ล่าสุดไม่ถูกต้อง')\n    patch.latest_hba1c = value\n  }\n  if ('status' in body) {\n",
)

# ---------- Knowledge backend supports YouTube URL in existing JSON body ----------
for knowledge_path in ['backend/api/v1/knowledge.mjs', 'backend/api/v1/admin/knowledge.mjs']:
    replace_once(
        knowledge_path,
        "  if (Array.isArray(value)) return { care: value.map(String), treatment: '', recommendation: '', tone: 'blue' }\n",
        "  if (Array.isArray(value)) return { care: value.map(String), treatment: '', recommendation: '', youtubeUrl: '', tone: 'blue' }\n",
    )
    replace_once(
        knowledge_path,
        "    recommendation: String(value.recommendation || ''),\n    tone:",
        "    recommendation: String(value.recommendation || ''),\n    youtubeUrl: String(value.youtubeUrl || ''),\n    tone:",
    )
    replace_once(
        knowledge_path,
        "  return { care: [], treatment: '', recommendation: '', tone: 'blue' }\n",
        "  return { care: [], treatment: '', recommendation: '', youtubeUrl: '', tone: 'blue' }\n",
    )

replace_once(
    'backend/api/v1/knowledge.mjs',
    "        recommendation: content.recommendation || undefined,\n        image,\n",
    "        recommendation: content.recommendation || undefined,\n        youtubeUrl: content.youtubeUrl || undefined,\n        image,\n",
)

replace_once(
    'backend/api/v1/admin/knowledge.mjs',
    "function readTimeFor(article) {\n",
    "function normalizeYoutubeUrl(value) {\n  const raw = String(value || '').trim()\n  if (!raw) return ''\n  let parsed\n  try { parsed = new URL(raw) } catch { throw badRequest('URL YouTube ไม่ถูกต้อง') }\n  const host = parsed.hostname.toLowerCase().replace(/^www\\./, '')\n  if (parsed.protocol !== 'https:' || !['youtube.com', 'm.youtube.com', 'youtu.be'].includes(host)) throw badRequest('กรุณาใช้ลิงก์ YouTube แบบ https เท่านั้น')\n  return parsed.toString()\n}\n\nfunction readTimeFor(article) {\n",
)
replace_once(
    'backend/api/v1/admin/knowledge.mjs',
    "    recommendation: body.recommendation || undefined,\n    image,\n",
    "    recommendation: body.recommendation || undefined,\n    youtubeUrl: body.youtubeUrl || undefined,\n    image,\n",
)
replace_once(
    'backend/api/v1/admin/knowledge.mjs',
    "  const care = Array.isArray(body.care) ? body.care.map((item) => String(item).trim()).filter(Boolean) : []\n  const status = statuses.has(body.status) ? body.status : 'draft'\n",
    "  const care = Array.isArray(body.care) ? body.care.map((item) => String(item).trim()).filter(Boolean) : []\n  const youtubeUrl = normalizeYoutubeUrl(body.youtubeUrl)\n  const status = statuses.has(body.status) ? body.status : 'draft'\n",
)
replace_once(
    'backend/api/v1/admin/knowledge.mjs',
    "  if (!care.length) throw badRequest('กรุณาระบุขั้นตอนการดูแลอย่างน้อย 1 ขั้นตอน')\n",
    "  if (!care.length && !youtubeUrl) throw badRequest('กรุณาระบุขั้นตอนการดูแลอย่างน้อย 1 ขั้นตอน หรือเพิ่มลิงก์วิดีโอ YouTube')\n",
)
replace_once(
    'backend/api/v1/admin/knowledge.mjs',
    "      recommendation: String(body.recommendation || '').trim(),\n      tone:",
    "      recommendation: String(body.recommendation || '').trim(),\n      youtubeUrl,\n      tone:",
)

# ---------- App.tsx imports, shared wording and helpers ----------
replace_once('src/App.tsx', '  UserRound,\n  VideoOff,\n', '  UserRound,\n  Video,\n  VideoOff,\n')
replace_once(
    'src/App.tsx',
    "import type { AdminDashboard, AdminDashboardRecentExam, Disease, DiseaseSeverityLevel, Examination, Finding, FootPosition, KnowledgeArticle, Page, Profile, Severity, UserRecord } from './types'\n",
    "import type { AdminDashboard, AdminDashboardRecentExam, Disease, DiseaseSeverityLevel, Examination, Finding, FootPosition, KnowledgeArticle, Page, Profile, RegistrationInput, Sex, Severity, UserRecord } from './types'\n",
)
replace_once(
    'src/App.tsx',
    "function formatExamTime(date: Date): string {\n  return new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date)\n}\n",
    "function formatExamTime(date: Date): string {\n  return new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date)\n}\n\nfunction formatSex(sex?: Sex): string {\n  if (sex === 'male') return 'ชาย'\n  if (sex === 'female') return 'หญิง'\n  if (sex === 'other') return 'อื่นๆ'\n  if (sex === 'prefer_not_to_say') return 'ไม่ประสงค์ระบุ'\n  return 'ยังไม่ระบุ'\n}\n",
)

login_screen = r'''function LoginScreen({ onLogin, authService }: { onLogin: (profile: Profile) => void; authService: AuthService }) {
  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [registration, setRegistration] = useState({
    username: '', displayName: '', dateOfBirth: '', sex: '' as Sex | '', diabetesYears: '', latestHba1c: '',
    occupationChoice: '', occupationOther: '', pin: '', confirmPin: '',
  })
  const [registrationComplete, setRegistrationComplete] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  const clearFieldError = (field: string) => {
    setFieldErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    const normalizedUsername = username.trim().toUpperCase()
    const nextErrors: Record<string, string> = {}
    if (!normalizedUsername) nextErrors.loginUsername = 'กรุณากรอกชื่อผู้ใช้'
    else if (!/^[A-Z0-9_-]{3,32}$/.test(normalizedUsername)) nextErrors.loginUsername = 'ชื่อผู้ใช้ต้องมี 3–32 ตัว และใช้ A-Z, 0-9, _ หรือ - เท่านั้น'
    if (!pin) nextErrors.loginPin = 'กรุณากรอก PIN 4 หลัก'
    else if (!/^\d{4}$/.test(pin)) nextErrors.loginPin = 'PIN ต้องเป็นตัวเลข 4 หลัก'
    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length) return

    setSubmitting(true)
    try {
      onLogin(await authService.signInWithUsername(normalizedUsername, pin))
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : 'เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบข้อมูลหรือลองใหม่อีกครั้ง')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    const normalizedUsername = registration.username.trim().toUpperCase()
    const occupation = registration.occupationChoice === 'อื่นๆ' ? registration.occupationOther.trim() : registration.occupationChoice.trim()
    const diabetesYears = Number(registration.diabetesYears)
    const latestHba1c = registration.latestHba1c.trim() ? Number(registration.latestHba1c) : undefined
    const nextErrors: Record<string, string> = {}
    if (!normalizedUsername) nextErrors.registerUsername = 'กรุณากำหนด Username'
    else if (!/^[A-Z0-9_-]{3,32}$/.test(normalizedUsername)) nextErrors.registerUsername = 'ใช้ A-Z, 0-9, _ หรือ - จำนวน 3–32 ตัวเท่านั้น'
    if (!registration.displayName.trim()) nextErrors.displayName = 'กรุณากรอกชื่อ-นามสกุล'
    if (!registration.dateOfBirth) nextErrors.dateOfBirth = 'กรุณาเลือกวันเดือนปีเกิด'
    else {
      const birthDate = new Date(`${registration.dateOfBirth}T00:00:00Z`)
      if (Number.isNaN(birthDate.getTime()) || birthDate > new Date()) nextErrors.dateOfBirth = 'วันเดือนปีเกิดไม่ถูกต้อง'
    }
    if (!registration.sex) nextErrors.sex = 'กรุณาเลือกเพศ'
    if (registration.diabetesYears === '' || !Number.isInteger(diabetesYears) || diabetesYears < 0 || diabetesYears > 100) nextErrors.diabetesYears = 'กรุณาระบุจำนวนปี 0–100 ปี'
    if (latestHba1c != null && (!Number.isFinite(latestHba1c) || latestHba1c <= 0 || latestHba1c > 30)) nextErrors.latestHba1c = 'กรุณากรอก HbA1c ให้ถูกต้อง'
    if (!registration.occupationChoice) nextErrors.occupation = 'กรุณาเลือกอาชีพ'
    else if (registration.occupationChoice === 'อื่นๆ' && !registration.occupationOther.trim()) nextErrors.occupationOther = 'กรุณาระบุอาชีพ'
    if (!/^\d{4}$/.test(registration.pin)) nextErrors.registerPin = 'PIN ต้องเป็นตัวเลข 4 หลัก'
    if (!registration.confirmPin) nextErrors.confirmPin = 'กรุณายืนยัน PIN อีกครั้ง'
    else if (registration.pin !== registration.confirmPin) nextErrors.confirmPin = 'PIN ทั้งสองช่องไม่ตรงกัน'
    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length) return

    const payload: RegistrationInput = {
      username: normalizedUsername,
      displayName: registration.displayName.trim(),
      dateOfBirth: registration.dateOfBirth,
      occupation,
      sex: registration.sex as Sex,
      diabetesYears,
      ...(latestHba1c != null ? { latestHba1c } : {}),
      pin: registration.pin,
    }
    setSubmitting(true)
    try {
      await authService.register(payload)
      setFieldErrors({})
      setRegistrationComplete(true)
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : 'ลงทะเบียนไม่สำเร็จ กรุณาตรวจสอบข้อมูลแล้วลองใหม่อีกครั้ง')
    } finally {
      setSubmitting(false)
    }
  }

  const updateRegistration = (key: keyof typeof registration, value: string) => {
    setRegistration((current) => ({ ...current, [key]: value }))
    const map: Record<keyof typeof registration, string> = {
      username: 'registerUsername', displayName: 'displayName', dateOfBirth: 'dateOfBirth', sex: 'sex', diabetesYears: 'diabetesYears',
      latestHba1c: 'latestHba1c', occupationChoice: 'occupation', occupationOther: 'occupationOther', pin: 'registerPin', confirmPin: 'confirmPin',
    }
    clearFieldError(map[key])
    if (error) setError('')
  }

  return (
    <main className="login-page">
      <section className="login-shell">
        <aside className="login-visual"><div className="brand brand-on-blue"><BrandMark /><span>DM Foot Care</span></div><div className="login-visual-copy"><span className="eyebrow">ดูแลอย่างต่อเนื่อง</span><h1>ติดตามสุขภาพเท้า<br />ได้ง่ายในทุกครั้ง</h1><p>บันทึกภาพ ตรวจสอบ และติดตามผลย้อนหลังในระบบเดียว</p></div><FourFrameIllustration /></aside>
        <div className="mobile-login-brand brand login-brand-lockup"><BrandMark /><span>DM Foot Care</span></div>
        <div className="login-form-wrap">
          {mode === 'login' ? <><div className="login-heading"><span className="eyebrow">ยินดีต้อนรับ</span><h2>เข้าสู่ระบบ</h2><p>กรอกชื่อผู้ใช้และ PIN ของคุณ</p></div><form onSubmit={handleLogin} noValidate><label className="field-label" htmlFor="username">ชื่อผู้ใช้</label><div className={fieldErrors.loginUsername ? 'input-wrap input-error' : 'input-wrap'}><UserRound size={20} /><input id="username" autoComplete="username" aria-invalid={Boolean(fieldErrors.loginUsername)} value={username} onChange={(event) => { setUsername(event.target.value); clearFieldError('loginUsername'); if (error) setError('') }} placeholder="เช่น DM001" /></div>{fieldErrors.loginUsername ? <div className="field-error-text">{fieldErrors.loginUsername}</div> : null}<label className="field-label" htmlFor="pin">PIN 4 หลัก</label><div className={fieldErrors.loginPin ? 'input-wrap input-error' : 'input-wrap'}><ShieldCheck size={20} /><input id="pin" inputMode="numeric" autoComplete="current-password" maxLength={4} type="password" aria-invalid={Boolean(fieldErrors.loginPin)} value={pin} onChange={(event) => { setPin(event.target.value.replace(/\D/g, '')); clearFieldError('loginPin'); if (error) setError('') }} placeholder="••••" /></div>{fieldErrors.loginPin ? <div className="field-error-text">{fieldErrors.loginPin}</div> : null}{error ? <div className="form-error" role="alert"><AlertTriangle size={18} />{error}</div> : null}<button className={submitting ? 'button button-primary button-large action-pending' : 'button button-primary button-large'} type="submit" disabled={submitting}>{submitting ? 'กำลังเข้าสู่ระบบ…' : <>เข้าสู่ระบบ <ArrowRight size={20} /></>}</button></form><button className="login-mode-switch" type="button" onClick={() => { setMode('register'); setError(''); setFieldErrors({}) }}>ยังไม่มีบัญชี? ลงทะเบียนใช้งาน</button><p className="login-support">มีปัญหาในการเข้าสู่ระบบ? ติดต่อผู้ดูแลระบบ</p></> : registrationComplete ? <div className="registration-success"><CircleCheck size={48} /><span className="eyebrow">ลงทะเบียนสำเร็จ</span><h2>บัญชีพร้อมใช้งานแล้ว</h2><p>ไม่ต้องรอ Admin อนุมัติ สามารถเข้าสู่ระบบด้วย Username และ PIN ที่ตั้งไว้ได้ทันที</p><button className="button button-primary button-large" type="button" onClick={() => { setUsername(registration.username.trim().toUpperCase()); setMode('login'); setRegistrationComplete(false); setError('') }}>เข้าสู่ระบบ</button></div> : <><div className="login-heading"><span className="eyebrow">บัญชีใหม่</span><h2>ลงทะเบียนใช้งาน</h2><p>กรอกข้อมูลสำหรับติดตามสุขภาพเท้า บัญชีจะเปิดใช้งานทันทีหลังลงทะเบียน</p></div><form className="registration-form" onSubmit={handleRegister} noValidate>
            <label className="field-label" htmlFor="register-username">Username</label><input id="register-username" className={fieldErrors.registerUsername ? 'input-error' : undefined} autoComplete="username" value={registration.username} onChange={(event) => updateRegistration('username', event.target.value)} placeholder="ใช้ A-Z, 0-9, _ หรือ -" />{fieldErrors.registerUsername ? <div className="field-error-text">{fieldErrors.registerUsername}</div> : null}
            <label className="field-label" htmlFor="register-name">ชื่อ-นามสกุล</label><input id="register-name" className={fieldErrors.displayName ? 'input-error' : undefined} autoComplete="name" value={registration.displayName} onChange={(event) => updateRegistration('displayName', event.target.value)} />{fieldErrors.displayName ? <div className="field-error-text">{fieldErrors.displayName}</div> : null}
            <div className="registration-grid"><div><label className="field-label" htmlFor="register-dob">วันเดือนปีเกิด</label><input id="register-dob" className={fieldErrors.dateOfBirth ? 'input-error' : undefined} type="date" value={registration.dateOfBirth} onChange={(event) => updateRegistration('dateOfBirth', event.target.value)} />{fieldErrors.dateOfBirth ? <div className="field-error-text">{fieldErrors.dateOfBirth}</div> : null}</div><div><label className="field-label" htmlFor="register-sex">เพศ</label><select id="register-sex" className={fieldErrors.sex ? 'input-error' : undefined} value={registration.sex} onChange={(event) => updateRegistration('sex', event.target.value)}><option value="">เลือกเพศ</option><option value="male">ชาย</option><option value="female">หญิง</option><option value="other">อื่นๆ</option><option value="prefer_not_to_say">ไม่ประสงค์ระบุ</option></select>{fieldErrors.sex ? <div className="field-error-text">{fieldErrors.sex}</div> : null}</div></div>
            <div className="registration-grid"><div><label className="field-label" htmlFor="register-diabetes-years">เป็นเบาหวานมาแล้วกี่ปี</label><input id="register-diabetes-years" className={fieldErrors.diabetesYears ? 'input-error' : undefined} type="number" inputMode="numeric" min="0" max="100" step="1" value={registration.diabetesYears} onChange={(event) => updateRegistration('diabetesYears', event.target.value)} placeholder="เช่น 8" />{fieldErrors.diabetesYears ? <div className="field-error-text">{fieldErrors.diabetesYears}</div> : null}</div><div><label className="field-label" htmlFor="register-hba1c">HbA1c ล่าสุด <span className="optional-label">ไม่บังคับ</span></label><input id="register-hba1c" className={fieldErrors.latestHba1c ? 'input-error' : undefined} type="number" inputMode="decimal" min="0.1" max="30" step="0.1" value={registration.latestHba1c} onChange={(event) => updateRegistration('latestHba1c', event.target.value)} placeholder="เช่น 7.2" />{fieldErrors.latestHba1c ? <div className="field-error-text">{fieldErrors.latestHba1c}</div> : null}</div></div>
            <label className="field-label" htmlFor="register-occupation">อาชีพ</label><select id="register-occupation" className={fieldErrors.occupation ? 'input-error' : undefined} value={registration.occupationChoice} onChange={(event) => updateRegistration('occupationChoice', event.target.value)}><option value="">เลือกอาชีพ</option><option value="เกษตรกร">เกษตรกร</option><option value="รับจ้างทั่วไป">รับจ้างทั่วไป</option><option value="ข้าราชการ">ข้าราชการ</option><option value="ธุรกิจส่วนตัว">ธุรกิจส่วนตัว</option><option value="อื่นๆ">อื่นๆ</option></select>{fieldErrors.occupation ? <div className="field-error-text">{fieldErrors.occupation}</div> : null}{registration.occupationChoice === 'อื่นๆ' ? <><label className="field-label" htmlFor="register-occupation-other">ระบุอาชีพ</label><input id="register-occupation-other" className={fieldErrors.occupationOther ? 'input-error' : undefined} value={registration.occupationOther} onChange={(event) => updateRegistration('occupationOther', event.target.value)} placeholder="พิมพ์อาชีพของคุณ" />{fieldErrors.occupationOther ? <div className="field-error-text">{fieldErrors.occupationOther}</div> : null}</> : null}
            <div className="registration-grid"><div><label className="field-label" htmlFor="register-pin">ตั้ง PIN 4 หลัก</label><input id="register-pin" className={fieldErrors.registerPin ? 'input-error' : undefined} type="password" inputMode="numeric" maxLength={4} autoComplete="new-password" value={registration.pin} onChange={(event) => updateRegistration('pin', event.target.value.replace(/\D/g, '').slice(0, 4))} />{fieldErrors.registerPin ? <div className="field-error-text">{fieldErrors.registerPin}</div> : null}</div><div><label className="field-label" htmlFor="register-confirm-pin">ยืนยัน PIN</label><input id="register-confirm-pin" className={fieldErrors.confirmPin ? 'input-error' : undefined} type="password" inputMode="numeric" maxLength={4} autoComplete="new-password" value={registration.confirmPin} onChange={(event) => updateRegistration('confirmPin', event.target.value.replace(/\D/g, '').slice(0, 4))} />{fieldErrors.confirmPin ? <div className="field-error-text">{fieldErrors.confirmPin}</div> : null}</div></div>
            <p className="registration-helper"><ShieldCheck size={17} />ข้อมูลใช้ภายในโครงการ DM Foot Care เพื่อการติดตามผลเท่านั้น</p>
            {error ? <div className="form-error" role="alert"><AlertTriangle size={18} />{error}</div> : null}<button className={submitting ? 'button button-primary button-large action-pending' : 'button button-primary button-large'} type="submit" disabled={submitting}>{submitting ? 'กำลังลงทะเบียน…' : 'ลงทะเบียนใช้งาน'}</button></form><button className="login-mode-switch" type="button" onClick={() => { setMode('login'); setError(''); setFieldErrors({}) }}>มีบัญชีแล้ว? กลับไปเข้าสู่ระบบ</button></>}
        </div>
      </section>
    </main>
  )
}'''
replace_block('src/App.tsx', 'function LoginScreen(', 'function BrandMark()', login_screen)

profile_dialog = r'''function ProfileDialog({ profile, mode, onClose }: { profile: Profile; mode: 'profile' | 'accessibility'; onClose: () => void }) {
  const isProfile = mode === 'profile'
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="detail-modal profile-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-dialog-title"><header><div><span className="eyebrow">{isProfile ? 'ข้อมูลส่วนตัว' : 'การช่วยเหลือการใช้งาน'}</span><h2 id="profile-dialog-title">{isProfile ? 'ข้อมูลของฉัน' : 'ใช้งานได้ง่ายสำหรับทุกคน'}</h2><p>{isProfile ? 'ข้อมูลที่ใช้ติดตามสุขภาพเท้าในโครงการ DM Foot Care' : 'คำแนะนำสำหรับการใช้งานบนโทรศัพท์และคอมพิวเตอร์'}</p></div><button className="icon-button" type="button" aria-label="ปิด" onClick={onClose}><X size={21} /></button></header>{isProfile ? <div className="profile-dialog-content"><div className="profile-dialog-identity"><Avatar profile={profile} /><div><strong>{profile.displayName}</strong><span>{profile.username} · {profile.role === 'admin' ? 'Admin' : 'User'}</span></div></div><dl className="profile-facts-list"><div><dt>วันเกิด</dt><dd>{profile.dateOfBirth}</dd></div><div><dt>อายุ</dt><dd>{profile.age} ปี</dd></div><div><dt>อาชีพ</dt><dd>{profile.occupation}</dd></div>{profile.role === 'user' ? <><div><dt>เพศ</dt><dd>{formatSex(profile.sex)}</dd></div><div><dt>เป็นเบาหวาน</dt><dd>{profile.diabetesYears == null ? 'ยังไม่ระบุ' : `${profile.diabetesYears} ปี`}</dd></div><div><dt>HbA1c ล่าสุด</dt><dd>{profile.latestHba1c == null ? 'ยังไม่ระบุ' : `${profile.latestHba1c}%`}</dd></div></> : null}</dl><div className="privacy-note"><ShieldCheck size={20} /><span>ข้อมูลและรูปภาพใช้ภายในโครงการ และไม่เผยแพร่สู่สาธารณะ</span></div></div> : <ul className="accessibility-list"><li><span><Type size={19} /></span><div><strong>อ่านข้อความได้ง่าย</strong><p>ตัวอักษรและระยะบรรทัดถูกปรับให้ใหญ่ขึ้นสำหรับการอ่านบนหน้าจอ</p></div></li><li><span><ScanLine size={19} /></span><div><strong>ปุ่มใหญ่ กดง่าย</strong><p>ปุ่มหลักและจุดกดสำคัญออกแบบให้เหมาะกับหน้าจอสัมผัส</p></div></li><li><span><Info size={19} /></span><div><strong>ถ้าเจอปัญหา</strong><p>อ่านข้อความแจ้งเตือนและทำตามวิธีแก้ หากยังไม่สำเร็จให้ติดต่อเจ้าหน้าที่โครงการ</p></div></li></ul>}<button className="button button-primary button-large" type="button" onClick={onClose}>ปิด</button></section></div>
}'''
replace_block('src/App.tsx', 'function ProfileDialog(', 'function Avatar(', profile_dialog)
replace_once('src/App.tsx', '  const featuredArticle = articles[0]\n', "  const featuredArticle = articles.find((article) => !article.youtubeUrl) ?? articles[0]\n")

knowledge_page = r'''function KnowledgePage({ articles, diseaseRecords, showToast, knowledgeService }: { articles: KnowledgeArticle[]; diseaseRecords: Disease[]; showToast: (text: string) => void; knowledgeService: KnowledgeLibraryService }) {
  const [mode, setMode] = useState<'article' | 'video'>('article')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('ทั้งหมด')
  const [diseaseFilter, setDiseaseFilter] = useState('ทั้งหมด')
  const [severityFilter, setSeverityFilter] = useState('ทั้งหมด')
  const [selected, setSelected] = useState<KnowledgeArticle | null>(null)
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set())
  const [savingId, setSavingId] = useState<string | null>(null)
  useEffect(() => { let cancelled = false; void knowledgeService.listSavedArticleIds().then((ids) => { if (!cancelled) setSavedIds(new Set(ids)) }).catch(() => { if (!cancelled) showToast('โหลดรายการที่บันทึกไว้ไม่สำเร็จ') }); return () => { cancelled = true } }, [knowledgeService, showToast])
  const modeArticles = useMemo(() => articles.filter((article) => mode === 'video' ? Boolean(article.youtubeUrl) : !article.youtubeUrl), [articles, mode])
  const categories = ['ทั้งหมด', ...new Set(modeArticles.map((article) => article.category))]
  const diseaseOptions = ['ทั้งหมด', ...diseaseRecords.map((disease) => disease.id)]
  const severityOptions = ['ทั้งหมด', 'ทุกระดับ', 'เล็กน้อย', 'ปานกลาง', 'รุนแรง'] as const
  const filtered = useMemo(() => modeArticles.filter((article) => (category === 'ทั้งหมด' || article.category === category) && (diseaseFilter === 'ทั้งหมด' || article.diseaseId === diseaseFilter) && (severityFilter === 'ทั้งหมด' || article.severity === severityFilter) && `${article.title} ${article.summary} ${article.diseaseId ?? ''}`.toLowerCase().includes(query.toLowerCase())), [modeArticles, query, category, diseaseFilter, severityFilter])
  const changeMode = (nextMode: 'article' | 'video') => { setMode(nextMode); setCategory('ทั้งหมด'); setQuery(''); setSelected(null) }
  const toggleSaved = async (article: KnowledgeArticle) => {
    const wasSaved = savedIds.has(article.id); const nextSaved = !wasSaved
    setSavedIds((current) => { const next = new Set(current); if (nextSaved) next.add(article.id); else next.delete(article.id); return next })
    setSavingId(article.id)
    try { await knowledgeService.setSaved(article.id, nextSaved); showToast(nextSaved ? 'บันทึกไว้อ่านภายหลังแล้ว' : 'นำออกจากรายการที่บันทึกแล้ว') }
    catch { setSavedIds((current) => { const next = new Set(current); if (wasSaved) next.add(article.id); else next.delete(article.id); return next }); showToast('บันทึกรายการไม่สำเร็จ ระบบคืนสถานะเดิมแล้ว') }
    finally { setSavingId(null) }
  }
  return <div className="page knowledge-page"><PageTitle eyebrow="ความรู้สำหรับการดูแล" title="คำแนะนำการดูแลเท้า" description="คำแนะนำและวิดีโอที่อ่านง่ายสำหรับการดูแลเท้าอย่างต่อเนื่อง" /><div className="knowledge-mode-tabs" role="tablist" aria-label="รูปแบบคำแนะนำ"><button role="tab" aria-selected={mode === 'article'} className={mode === 'article' ? 'active' : ''} type="button" onClick={() => changeMode('article')}><BookOpen size={21} />คำแนะนำการดูแลเท้า</button><button role="tab" aria-selected={mode === 'video'} className={mode === 'video' ? 'active' : ''} type="button" onClick={() => changeMode('video')}><Video size={21} />วิดีโอแนะนำ</button></div><div className="knowledge-tools"><label className="search-field"><Search size={20} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={mode === 'video' ? 'ค้นหาวิดีโอแนะนำ' : 'ค้นหา เช่น ผิวแห้ง หนังด้าน'} aria-label="ค้นหาคำแนะนำการดูแลเท้า" /></label><div className="category-chips" aria-label="กรองตามหมวดหมู่">{categories.map((item) => <button className={category === item ? 'active' : ''} type="button" key={item} onClick={() => setCategory(item)}>{item}</button>)}</div><div className="knowledge-filter-row"><label><span>ภาวะ</span><select aria-label="กรองตามภาวะ" value={diseaseFilter} onChange={(event) => setDiseaseFilter(event.target.value)}>{diseaseOptions.map((id) => <option value={id} key={id}>{id === 'ทั้งหมด' ? id : `${id} · ${diseaseRecords.find((disease) => disease.id === id)?.name ?? id}`}</option>)}</select></label><label><span>ระดับความรุนแรง</span><select aria-label="กรองตามระดับความรุนแรง" value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)}>{severityOptions.map((severity) => <option value={severity} key={severity}>{severity}</option>)}</select></label></div></div>{filtered.length ? <div className="article-grid">{filtered.map((article, index) => <article className={`article-card tone-${article.tone}`} key={article.id}><div className="article-visual">{article.image ? <img src={article.image} alt="" /> : article.youtubeUrl ? <Video size={34} /> : <HeartPulse size={30} />}<span>{index + 1}</span>{article.youtubeUrl ? <i className="video-badge"><Video size={14} />วิดีโอ</i> : null}</div><div className="article-body"><div><span className="category-label">{article.category}</span><span>{article.severity} · {article.readTime}</span></div><h2>{article.title}</h2><p>{article.summary}</p><button className="card-link" type="button" onClick={() => setSelected(article)}>{article.youtubeUrl ? 'ดูวิดีโอแนะนำ' : 'อ่านคำแนะนำ'} <ChevronRight size={18} /></button></div></article>)}</div> : <div className="empty-state">{mode === 'video' ? <Video size={32} /> : <Search size={32} />}<h2>{mode === 'video' ? 'ยังไม่มีวิดีโอแนะนำ' : 'ยังไม่พบหัวข้อนี้'}</h2><p>{mode === 'video' ? 'เมื่อผู้ดูแลเพิ่มลิงก์ YouTube วิดีโอจะแสดงในส่วนนี้' : 'ลองค้นด้วยคำที่สั้นลง หรือเลือก “ทั้งหมด” เพื่อดูคำแนะนำที่มี'}</p>{mode === 'article' ? <button className="button button-secondary" type="button" onClick={() => { setQuery(''); setCategory('ทั้งหมด'); setDiseaseFilter('ทั้งหมด'); setSeverityFilter('ทั้งหมด') }}>ดูคำแนะนำทั้งหมด</button> : null}</div>}{selected ? <ArticleModal article={selected} saved={savedIds.has(selected.id)} saving={savingId === selected.id} onClose={() => setSelected(null)} onSaved={() => void toggleSaved(selected)} /> : null}</div>
}'''
replace_block('src/App.tsx', 'function KnowledgePage(', 'function ArticleModal(', knowledge_page)

article_modal = r'''function ArticleModal({ article, saved, saving, onClose, onSaved }: { article: KnowledgeArticle; saved: boolean; saving: boolean; onClose: () => void; onSaved: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><article className="detail-modal article-modal" role="dialog" aria-modal="true" aria-labelledby="article-title"><header><div><span className="eyebrow">{article.category} · {article.severity} · {article.readTime}</span><h2 id="article-title">{article.title}</h2></div><button className="icon-button" type="button" aria-label="ปิด" onClick={onClose}><X size={21} /></button></header><div className={`article-hero tone-${article.tone}`}>{article.image ? <img src={article.image} alt="" /> : article.youtubeUrl ? <Video size={50} /> : <HeartPulse size={44} />}</div><p className="article-intro">{article.summary}</p>{article.youtubeUrl ? <a className="button button-primary button-large video-open-button" href={article.youtubeUrl} target="_blank" rel="noopener noreferrer"><Video size={21} />เปิดวิดีโอ YouTube</a> : null}{article.care.length ? <><h3>ทำตามขั้นตอนนี้</h3><ol className="care-steps">{article.care.map((step, index) => <li key={`${index}-${step}`}><span>{index + 1}</span>{step}</li>)}</ol></> : null}{article.treatment ? <section className="article-guidance"><h3>การรักษา</h3><p>{article.treatment}</p></section> : null}{article.recommendation ? <section className="article-guidance"><h3>คำแนะนำเพิ่มเติม</h3><p>{article.recommendation}</p></section> : null}<div className="review-explainer"><Info size={19} /><p>คำแนะนำทั่วไปอาจไม่เหมาะกับทุกคน หากมีอาการผิดปกติควรปรึกษาแพทย์</p></div><button className={saving ? 'button button-secondary action-pending' : 'button button-secondary'} type="button" disabled={saving} onClick={onSaved}>{saving ? 'กำลังบันทึก…' : saved ? 'นำออกจากรายการที่บันทึก' : 'บันทึกไว้อ่านภายหลัง'}</button></article></div>
}'''
replace_block('src/App.tsx', 'function ArticleModal(', 'function DoctorPages(', article_modal)

# Admin user editor with optional clinical context.
user_form_modal = r'''function UserFormModal({ user, onClose, onSave }: { user: UserRecord | null; onClose: () => void; onSave: (draft: UserFormDraft) => void | Promise<void> }) {
  const [draft, setDraft] = useState(() => ({
    username: user?.username ?? '', name: user?.name ?? '', dateOfBirth: user?.dateOfBirth ?? '', occupation: user?.occupation ?? '',
    sex: (user?.sex ?? '') as Sex | '', diabetesYears: user?.diabetesYears == null ? '' : String(user.diabetesYears), latestHba1c: user?.latestHba1c == null ? '' : String(user.latestHba1c),
    pinConfigured: user?.pinConfigured ?? false, status: user?.status ?? 'active' as UserRecord['status'], pin: '',
  }))
  const [isSaving, setIsSaving] = useState(false)
  const update = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!draft.username.trim() || !draft.name.trim() || !draft.dateOfBirth || !draft.occupation.trim()) return
    const validPin = draft.pin === '' ? Boolean(user?.pinConfigured) : /^\d{4}$/.test(draft.pin)
    if (!validPin) return
    const diabetesYears = draft.diabetesYears === '' ? null : Number(draft.diabetesYears)
    const latestHba1c = draft.latestHba1c === '' ? null : Number(draft.latestHba1c)
    if (diabetesYears != null && (!Number.isInteger(diabetesYears) || diabetesYears < 0 || diabetesYears > 100)) return
    if (latestHba1c != null && (!Number.isFinite(latestHba1c) || latestHba1c <= 0 || latestHba1c > 30)) return
    const safeDraft: UserFormDraft = { username: draft.username.trim().toUpperCase(), name: draft.name.trim(), dateOfBirth: draft.dateOfBirth, age: calculateAge(draft.dateOfBirth), occupation: draft.occupation.trim(), sex: draft.sex || undefined, diabetesYears, latestHba1c, pinConfigured: Boolean(draft.pin || draft.pinConfigured), status: draft.status, ...(draft.pin ? { pin: draft.pin } : {}) }
    setIsSaving(true)
    try { await onSave(safeDraft) } finally { setIsSaving(false) }
  }
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="detail-modal admin-form-modal" role="dialog" aria-modal="true" aria-labelledby="user-form-title"><header><div><span className="eyebrow">{user ? 'แก้ไขบัญชี' : 'บัญชีใหม่'}</span><h2 id="user-form-title">{user ? `แก้ไข ${user.username}` : 'เพิ่มผู้ใช้งาน'}</h2><p>ข้อมูลพื้นฐานและข้อมูลติดตามสุขภาพสามารถแก้ไขภายหลังได้</p></div><button className="icon-button" type="button" aria-label="ปิด" onClick={onClose}><X size={21} /></button></header><form className="admin-form" onSubmit={submit}><label className="field-label" htmlFor="form-username">Username</label><input id="form-username" value={draft.username} onChange={(event) => update('username', event.target.value)} placeholder="เช่น DM005" autoComplete="off" /><label className="field-label" htmlFor="form-name">ชื่อ-นามสกุล</label><input id="form-name" value={draft.name} onChange={(event) => update('name', event.target.value)} placeholder="ชื่อผู้ใช้งาน" /><div className="admin-form-grid"><div><label className="field-label" htmlFor="form-dob">วันเดือนปีเกิด</label><input id="form-dob" type="date" value={draft.dateOfBirth} onChange={(event) => update('dateOfBirth', event.target.value)} /><div className="derived-metric"><span>อายุ / Generation</span><strong>{calculateAge(draft.dateOfBirth)} ปี · {calculateGeneration(draft.dateOfBirth)}</strong></div></div><div><label className="field-label" htmlFor="form-sex">เพศ</label><select id="form-sex" value={draft.sex} onChange={(event) => update('sex', event.target.value as Sex | '')}><option value="">ยังไม่ระบุ</option><option value="male">ชาย</option><option value="female">หญิง</option><option value="other">อื่นๆ</option><option value="prefer_not_to_say">ไม่ประสงค์ระบุ</option></select></div></div><div className="admin-form-grid"><div><label className="field-label" htmlFor="form-diabetes-years">เป็นเบาหวานมาแล้วกี่ปี</label><input id="form-diabetes-years" type="number" min="0" max="100" step="1" value={draft.diabetesYears} onChange={(event) => update('diabetesYears', event.target.value)} placeholder="ยังไม่ระบุ" /></div><div><label className="field-label" htmlFor="form-hba1c">HbA1c ล่าสุด</label><input id="form-hba1c" type="number" min="0.1" max="30" step="0.1" value={draft.latestHba1c} onChange={(event) => update('latestHba1c', event.target.value)} placeholder="ยังไม่ระบุ" /></div></div><label className="field-label" htmlFor="form-occupation">อาชีพ</label><input id="form-occupation" value={draft.occupation} onChange={(event) => update('occupation', event.target.value)} placeholder="อาชีพ" /><label className="field-label" htmlFor="form-pin">PIN เริ่มต้น (4 หลัก){user ? ' · กรอกใหม่เมื่อเปลี่ยน PIN' : ''}</label><input id="form-pin" type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={draft.pin} onChange={(event) => update('pin', event.target.value.replace(/\D/g, '').slice(0, 4))} placeholder={user ? 'เว้นว่างเพื่อใช้ PIN เดิม' : 'เช่น 1234'} autoComplete="new-password" /><small className="field-helper">ระบบจะไม่แสดงหรือเก็บ PIN ดิบในหน้าจอจัดการ หากต้องการเปลี่ยน PIN ให้กรอกเลขใหม่แล้วบันทึก</small><div className="admin-form-actions"><button className="button button-secondary" type="button" disabled={isSaving} onClick={onClose}>ยกเลิก</button><button className={isSaving ? 'button button-primary action-pending' : 'button button-primary'} type="submit" disabled={isSaving}>{isSaving ? 'กำลังบันทึก…' : 'บันทึกข้อมูล'}</button></div></form></section></div>
}'''
replace_block('src/App.tsx', 'function UserFormModal(', 'function DiseaseManagement(', user_form_modal)

knowledge_management = r'''function KnowledgeManagement({ articles, diseaseRecords, setArticles, showToast, adminService }: { articles: KnowledgeArticle[]; diseaseRecords: Disease[]; setArticles: React.Dispatch<React.SetStateAction<KnowledgeArticle[]>>; showToast: (text: string) => void; adminService: AdminService }) {
  const [editing, setEditing] = useState<KnowledgeArticle | null>(null)
  const [creating, setCreating] = useState(false)
  const publishedCount = articles.filter((article) => (article.status ?? 'published') === 'published').length
  const videoCount = articles.filter((article) => Boolean(article.youtubeUrl) && (article.status ?? 'published') === 'published').length
  const closeForm = () => { setEditing(null); setCreating(false) }
  const saveArticle = async (draft: Omit<KnowledgeArticle, 'id'>) => {
    try {
      const saved = await adminService.saveKnowledge(editing ? { ...draft, id: editing.id } : draft)
      setArticles((current) => editing ? current.map((article) => article.id === editing.id ? saved : article) : [...current, saved])
      showToast(`${editing ? 'บันทึก' : 'สร้าง'} “${saved.title}” แล้ว`)
      closeForm()
    } catch {
      showToast('บันทึกคำแนะนำไม่สำเร็จ')
    }
  }
  return <div className="page admin-page"><PageTitle eyebrow="เนื้อหาสำหรับผู้ใช้" title="จัดการคำแนะนำการดูแลเท้า" description="จัดการบทความ ขั้นตอนการดูแล และวิดีโอ YouTube ที่แสดงให้ผู้ใช้" action={<button className="button button-primary" type="button" onClick={() => { setEditing(null); setCreating(true) }}><Plus size={18} />สร้างคำแนะนำ</button>} /><div className="admin-stat-grid compact"><AdminStat icon={BookOpen} label="เผยแพร่แล้ว" value={String(publishedCount)} note="พร้อมให้ผู้ใช้อ่าน" tone="blue" /><AdminStat icon={Video} label="วิดีโอแนะนำ" value={String(videoCount)} note="ลิงก์ YouTube ที่เผยแพร่" tone="teal" /></div><div className="knowledge-admin-list">{articles.map((article) => { const status = article.status ?? 'published'; return <article key={article.id}><span className={`article-icon tone-${article.tone}`}>{article.youtubeUrl ? <Video size={23} /> : <HeartPulse size={23} />}</span><div><span className="category-label">{article.youtubeUrl ? 'วิดีโอ · ' : ''}{article.category}</span><h2>{article.title}</h2><p>{article.summary}</p></div><span className={status === 'published' ? 'status-pill success' : status === 'draft' ? 'status-pill attention' : 'status-pill muted'}>{status === 'published' ? 'เผยแพร่แล้ว' : status === 'draft' ? 'ฉบับร่าง' : 'เก็บถาวร'}</span><button className="button button-secondary button-small" type="button" onClick={() => { setCreating(false); setEditing(article) }}>แก้ไข</button></article> })}</div>{creating || editing ? <KnowledgeFormModal article={editing} diseases={diseaseRecords} onClose={closeForm} onSave={saveArticle} /> : null}</div>
}'''
replace_block('src/App.tsx', 'function KnowledgeManagement(', 'function KnowledgeFormModal(', knowledge_management)

knowledge_form = r'''function KnowledgeFormModal({ article, diseases: diseaseRecords, onClose, onSave }: { article: KnowledgeArticle | null; diseases: Disease[]; onClose: () => void; onSave: (draft: Omit<KnowledgeArticle, 'id'>) => void | Promise<void> }) {
  const [draft, setDraft] = useState<Omit<KnowledgeArticle, 'id'>>(() => article ? { title: article.title, diseaseId: article.diseaseId, category: article.category, severity: article.severity, summary: article.summary, care: article.care.length ? article.care : [''], treatment: article.treatment, recommendation: article.recommendation, youtubeUrl: article.youtubeUrl, image: article.image, readTime: article.readTime, tone: article.tone, status: article.status ?? 'published' } : { title: '', diseaseId: '', category: 'ผิวหนัง', severity: 'ทุกระดับ', summary: '', care: ['', '', ''], treatment: '', recommendation: '', youtubeUrl: '', image: undefined, readTime: '', tone: 'blue', status: 'draft' })
  const update = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const updateCare = (index: number, value: string) => update('care', draft.care.map((step, stepIndex) => stepIndex === index ? value : step))
  const addCare = () => update('care', [...draft.care, ''])
  const removeCare = (index: number) => update('care', draft.care.filter((_, stepIndex) => stepIndex !== index))
  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const care = draft.care.map((step) => step.trim()).filter(Boolean)
    const youtubeUrl = draft.youtubeUrl?.trim() ?? ''
    if (!draft.title.trim() || !draft.category.trim() || !draft.summary.trim() || (!care.length && !youtubeUrl)) return
    onSave({ ...draft, title: draft.title.trim(), category: draft.category.trim(), summary: draft.summary.trim(), care, youtubeUrl: youtubeUrl || undefined })
  }
  const readImage = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => update('image', String(reader.result)); reader.readAsDataURL(file); event.target.value = '' }
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="detail-modal admin-form-modal" role="dialog" aria-modal="true" aria-labelledby="knowledge-form-title"><header><div><span className="eyebrow">{article ? 'แก้ไขคำแนะนำ' : 'คำแนะนำใหม่'}</span><h2 id="knowledge-form-title">{article ? `แก้ไข ${article.title}` : 'สร้างคำแนะนำการดูแลเท้า'}</h2><p>เพิ่มขั้นตอนการดูแลได้ตามต้องการ หรือใส่ลิงก์ YouTube เพื่อแสดงเป็นวิดีโอแนะนำ</p></div><button className="icon-button" type="button" aria-label="ปิด" onClick={onClose}><X size={21} /></button></header><form className="admin-form" onSubmit={submit}><label className="field-label" htmlFor="knowledge-title">ชื่อคำแนะนำ</label><input id="knowledge-title" value={draft.title} onChange={(event) => update('title', event.target.value)} placeholder="เช่น ดูแลเท้าเมื่อผิวแห้ง" /><div className="admin-form-grid"><div><label className="field-label" htmlFor="knowledge-disease">เชื่อมกับภาวะ</label><select id="knowledge-disease" value={draft.diseaseId ?? ''} onChange={(event) => update('diseaseId', event.target.value)}><option value="">ไม่ระบุ</option>{diseaseRecords.map((disease) => <option value={disease.id} key={disease.id}>{disease.id} · {disease.name}</option>)}</select></div><div><label className="field-label" htmlFor="knowledge-severity">ระดับ</label><select id="knowledge-severity" value={draft.severity} onChange={(event) => update('severity', event.target.value as KnowledgeArticle['severity'])}><option>ทุกระดับ</option><option>เล็กน้อย</option><option>ปานกลาง</option><option>รุนแรง</option></select></div></div><div className="admin-form-grid"><div><label className="field-label" htmlFor="knowledge-category">หมวดหมู่</label><input id="knowledge-category" value={draft.category} onChange={(event) => update('category', event.target.value)} /></div><div><label className="field-label" htmlFor="knowledge-status">สถานะ</label><select id="knowledge-status" value={draft.status} onChange={(event) => update('status', event.target.value as KnowledgeArticle['status'])}><option value="draft">ฉบับร่าง</option><option value="published">เผยแพร่แล้ว</option><option value="archived">เก็บถาวร</option></select></div></div><label className="field-label" htmlFor="knowledge-summary">สรุปสั้น</label><textarea id="knowledge-summary" value={draft.summary} onChange={(event) => update('summary', event.target.value)} placeholder="คำอธิบายที่แสดงบนการ์ด" /><label className="field-label" htmlFor="knowledge-youtube">ลิงก์วิดีโอ YouTube <span className="optional-label">ไม่บังคับ</span></label><div className="video-url-field"><Video size={20} /><input id="knowledge-youtube" type="url" value={draft.youtubeUrl ?? ''} onChange={(event) => update('youtubeUrl', event.target.value)} placeholder="https://www.youtube.com/watch?v=..." /></div><small className="field-helper">เมื่อใส่ลิงก์ รายการนี้จะแสดงในแท็บ “วิดีโอแนะนำ” ของผู้ใช้</small><div className="care-step-editor"><div className="care-step-heading"><span className="field-label">ขั้นตอนการดูแล</span><button className="button button-secondary button-small" type="button" onClick={addCare}><Plus size={16} />เพิ่มขั้นตอน</button></div>{draft.care.length ? draft.care.map((step, index) => <div className="care-step-row" key={index}><span>{index + 1}</span><input id={`knowledge-care-${index + 1}`} value={step} onChange={(event) => updateCare(index, event.target.value)} placeholder={`ขั้นตอนที่ ${index + 1}`} /><button className="icon-button" type="button" aria-label={`ลบขั้นตอนที่ ${index + 1}`} onClick={() => removeCare(index)}><X size={18} /></button></div>) : <div className="care-step-empty">ยังไม่มีขั้นตอน · เหมาะสำหรับรายการวิดีโอ</div>}</div><label className="field-label" htmlFor="knowledge-treatment">การรักษา</label><textarea id="knowledge-treatment" value={draft.treatment ?? ''} onChange={(event) => update('treatment', event.target.value)} placeholder="แนวทางการรักษาหรือการส่งต่อ" /><label className="field-label" htmlFor="knowledge-recommendation">คำแนะนำเพิ่มเติม</label><textarea id="knowledge-recommendation" value={draft.recommendation ?? ''} onChange={(event) => update('recommendation', event.target.value)} placeholder="ข้อควรระวังหรือคำแนะนำสำหรับผู้ใช้" /><label className="field-label" htmlFor="knowledge-image">รูปประกอบ</label><input id="knowledge-image" type="file" accept="image/*" onChange={readImage} />{draft.image ? <img className="reference-image-preview" src={draft.image} alt="รูปประกอบคำแนะนำ" /> : <small className="field-helper">เมื่อบันทึก ระบบจะอัปโหลดรูปไปยังพื้นที่จัดเก็บส่วนตัวของ DM Foot Care</small>}<div className="admin-form-actions"><button className="button button-secondary" type="button" onClick={onClose}>ยกเลิก</button><button className="button button-primary" type="submit">บันทึกคำแนะนำ</button></div></form></section></div>
}'''
replace_block('src/App.tsx', 'function KnowledgeFormModal(', 'export default App', knowledge_form)

# Rename user-facing wording without changing API routes/table names.
for old, new in [
    ('คลังความรู้ดูแลเท้า', 'คำแนะนำการดูแลเท้า'),
    ('จัดการคลังความรู้', 'จัดการคำแนะนำการดูแลเท้า'),
    ('ค้นหาคลังความรู้', 'ค้นหาคำแนะนำการดูแลเท้า'),
    ('เปิดคลังความรู้', 'เปิดคำแนะนำการดูแลเท้า'),
    ('คลังความรู้', 'คำแนะนำการดูแลเท้า'),
]:
    source = read('src/App.tsx')
    if old in source:
        write('src/App.tsx', source.replace(old, new))

# Add compact clinical context to admin user list.
replace_once(
    'src/App.tsx',
    "<small>{user.username} · อายุ {calculateAge(user.dateOfBirth)} ปี · {calculateGeneration(user.dateOfBirth)} · {user.occupation}</small>",
    "<small>{user.username} · อายุ {calculateAge(user.dateOfBirth)} ปี · {user.occupation}{user.diabetesYears == null ? '' : ` · เบาหวาน ${user.diabetesYears} ปี`}{user.latestHba1c == null ? '' : ` · HbA1c ${user.latestHba1c}%`}</small>",
)

# ---------- Accessibility CSS imported last ----------
accessibility_css = r'''/* DMFC accessibility and feature additions — loaded after legacy styles. */
:root { font-size: 17px; }
body { font-size: 17px; line-height: 1.65; }
p, li, dd, dt, td, th, label, input, select, textarea, button { line-height: 1.55; }
.eyebrow { font-size: 14px; line-height: 1.4; letter-spacing: .055em; }
.button { min-height: 50px; font-size: 17px; padding: 11px 19px; }
.button-large { min-height: 58px; font-size: 18px; }
.button-small { min-height: 44px; font-size: 15px; padding: 8px 13px; }
.field-label { font-size: 16px; margin-top: 20px; }
input, select, textarea { font-size: 17px !important; }
.registration-form > input,
.registration-form select,
.registration-form .registration-grid input,
.admin-form input,
.admin-form select { min-height: 52px; }
.admin-form textarea { min-height: 108px; }
.field-helper, .field-error-text, .login-support, small { font-size: 14px; }
.status-pill, .severity-label, .category-label { font-size: 14px; padding: 6px 10px; }
.section-heading h2 { font-size: 21px; }
.disclaimer { font-size: 15px; line-height: 1.7; }
.nav-item span { font-size: 16px; line-height: 1.35; }
.page-title p, .page-lead, .article-card p, .knowledge-callout p { font-size: 17px; line-height: 1.7; }
.login-heading p, .login-support, .registration-success p { font-size: 16px; line-height: 1.7; }
.optional-label { display: inline-flex; margin-left: 6px; padding: 2px 7px; border-radius: 999px; background: #edf3fa; color: var(--muted); font-size: 13px; font-weight: 600; vertical-align: middle; }
.registration-helper { margin: 18px 0 2px; padding: 12px 14px; border-radius: 12px; background: var(--blue-soft); color: var(--muted); display: flex; align-items: flex-start; gap: 9px; font-size: 15px; }
.registration-helper svg { flex: 0 0 auto; margin-top: 3px; color: var(--blue); }
.registration-success { max-width: 520px; }

.knowledge-mode-tabs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 0 0 22px; padding: 6px; border: 1px solid var(--line); background: #fff; border-radius: 16px; box-shadow: var(--shadow-sm); }
.knowledge-mode-tabs button { min-height: 54px; border: 0; border-radius: 12px; background: transparent; color: var(--muted); font: inherit; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; gap: 9px; cursor: pointer; }
.knowledge-mode-tabs button.active { background: var(--blue-soft); color: var(--blue-dark); box-shadow: inset 0 0 0 1px #cfe0ff; }
.video-badge { position: absolute; left: 10px; bottom: 10px; display: inline-flex; align-items: center; gap: 4px; padding: 5px 8px; border-radius: 999px; background: rgba(16,35,63,.88); color: #fff; font-size: 12px; font-style: normal; font-weight: 700; }
.article-visual { position: relative; }
.video-open-button { margin: 18px 0 10px; text-decoration: none; }
.video-url-field { min-height: 52px; display: flex; align-items: center; gap: 10px; padding: 0 14px; border: 1px solid #cdd9e7; border-radius: 12px; background: #fff; }
.video-url-field svg { flex: 0 0 auto; color: var(--blue); }
.video-url-field input { min-width: 0; flex: 1; border: 0 !important; outline: 0; min-height: 48px !important; }
.care-step-editor { margin-top: 20px; padding: 16px; border: 1px solid var(--line); border-radius: 14px; background: #f9fbfe; }
.care-step-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.care-step-heading .field-label { margin: 0; }
.care-step-row { display: grid; grid-template-columns: 34px minmax(0, 1fr) 44px; align-items: center; gap: 8px; margin-top: 9px; }
.care-step-row > span { width: 32px; height: 32px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: var(--blue-soft); color: var(--blue-dark); font-weight: 800; }
.care-step-row input { width: 100%; min-height: 50px; }
.care-step-empty { padding: 14px; border: 1px dashed #cdd9e7; border-radius: 10px; color: var(--muted); text-align: center; font-size: 15px; }

@media (max-width: 760px) {
  :root { font-size: 16px; }
  body { font-size: 16px; }
  .login-page { min-height: 100dvh; }
  .login-form-wrap { width: 100%; }
  .registration-grid { grid-template-columns: 1fr !important; gap: 0 !important; }
  .field-label { font-size: 16px; }
  .button { font-size: 16px; }
  .page-title p, .page-lead, .article-card p, .knowledge-callout p { font-size: 16px; }
  .knowledge-mode-tabs { grid-template-columns: 1fr 1fr; }
  .knowledge-mode-tabs button { padding: 8px; font-size: 14px; line-height: 1.35; }
  .mobile-nav { min-height: 72px; }
  .mobile-nav .nav-item { min-height: 64px; padding: 6px 4px; }
  .mobile-nav .nav-item span { max-width: 88px; white-space: normal; text-align: center; font-size: 14px; line-height: 1.25; }
  .care-step-row { grid-template-columns: 30px minmax(0, 1fr) 44px; }
}
'''
write('src/accessibility-overrides.css', accessibility_css)
replace_once('src/main.tsx', "import './legacy65925.css'\n", "import './legacy65925.css'\nimport './accessibility-overrides.css'\n")

# ---------- Database migration tracked in repository ----------
migration = r'''-- Add optional clinical context used by DMFC registration and profile views.
-- Existing users remain valid because every new column is nullable.

alter table public.profiles
  add column if not exists sex text,
  add column if not exists diabetes_years smallint,
  add column if not exists latest_hba1c numeric(4,1);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_sex_check') then
    alter table public.profiles add constraint profiles_sex_check
      check (sex is null or sex = any (array['male'::text, 'female'::text, 'other'::text, 'prefer_not_to_say'::text]));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_diabetes_years_check') then
    alter table public.profiles add constraint profiles_diabetes_years_check
      check (diabetes_years is null or (diabetes_years >= 0 and diabetes_years <= 100));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_latest_hba1c_check') then
    alter table public.profiles add constraint profiles_latest_hba1c_check
      check (latest_hba1c is null or (latest_hba1c > 0 and latest_hba1c <= 30));
  end if;
end
$$;
'''
write('supabase/migrations/20260828190000_add_profile_clinical_context.sql', migration)

# ---------- Regression contract ----------
contract_test = r'''import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const app = read('src/App.tsx')
const types = read('src/types.ts')
const register = read('backend/api/v1/auth/register.mjs')
const adminKnowledge = read('backend/api/v1/admin/knowledge.mjs')
const publicKnowledge = read('backend/api/v1/knowledge.mjs')
const main = read('src/main.tsx')
const css = read('src/accessibility-overrides.css')

assert.match(types, /sex: Sex/)
assert.match(types, /diabetesYears: number/)
assert.match(types, /latestHba1c\?: number/)
assert.match(register, /account_status: 'active'/)
assert.match(register, /diabetes_years: input\.diabetesYears/)
assert.match(register, /latest_hba1c: input\.latestHba1c/)
assert.doesNotMatch(register, /status: 'pending'/)
assert.match(app, /เป็นเบาหวานมาแล้วกี่ปี/)
assert.match(app, /HbA1c ล่าสุด/)
assert.match(app, /คำแนะนำการดูแลเท้า/)
assert.match(app, /วิดีโอแนะนำ/)
assert.match(app, /draft\.care\.map/)
assert.doesNotMatch(app, /\[0, 1, 2\]\.map/)
assert.match(adminKnowledge, /normalizeYoutubeUrl/)
assert.match(adminKnowledge, /youtubeUrl/)
assert.match(publicKnowledge, /youtubeUrl/)
assert.match(main, /accessibility-overrides\.css/)
assert.match(css, /\.knowledge-mode-tabs/)
assert.match(css, /font-size: 17px/)
console.log('DMFC feature update contract passed')
'''
write('tests/feature_update_contract.test.ts', contract_test)

replace_once(
    'package.json',
    'node --experimental-strip-types tests/image_quality.test.ts",',
    'node --experimental-strip-types tests/image_quality.test.ts && node --experimental-strip-types tests/feature_update_contract.test.ts",',
)

print('DMFC feature update applied successfully')
