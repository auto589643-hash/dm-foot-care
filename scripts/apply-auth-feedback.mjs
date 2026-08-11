import fs from 'node:fs'

const path = 'src/App.tsx'
let source = fs.readFileSync(path, 'utf8')

function replaceOnce(search, replacement, label) {
  const before = source
  source = source.replace(search, replacement)
  if (source === before) throw new Error(`Patch target not found: ${label}`)
}

replaceOnce(
  "  const [error, setError] = useState('')\n  const [submitting, setSubmitting] = useState(false)",
  "  const [error, setError] = useState('')\n  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})\n  const [submitting, setSubmitting] = useState(false)",
  'field error state',
)

replaceOnce(
  /  const handleLogin = async \(event: React\.FormEvent\) => \{[\s\S]*?\n  \}\n\n  const handleRegister = async/,
  `  const clearFieldError = (field: string) => {\n    setFieldErrors((current) => {\n      if (!current[field]) return current\n      const next = { ...current }\n      delete next[field]\n      return next\n    })\n  }\n\n  const handleLogin = async (event: React.FormEvent) => {\n    event.preventDefault()\n    setError('')\n    const normalizedUsername = username.trim().toUpperCase()\n    const nextErrors: Record<string, string> = {}\n    if (!normalizedUsername) nextErrors.loginUsername = 'กรุณากรอกชื่อผู้ใช้'\n    else if (!/^[A-Z0-9_-]{3,32}$/.test(normalizedUsername)) nextErrors.loginUsername = 'ชื่อผู้ใช้ต้องมี 3–32 ตัว และใช้ A-Z, 0-9, _ หรือ - เท่านั้น'\n    if (!pin) nextErrors.loginPin = 'กรุณากรอก PIN 4 หลัก'\n    else if (!/^\\d{4}$/.test(pin)) nextErrors.loginPin = 'PIN ต้องเป็นตัวเลข 4 หลัก'\n    setFieldErrors(nextErrors)\n    if (Object.keys(nextErrors).length) return\n\n    setSubmitting(true)\n    try {\n      onLogin(await authService.signInWithUsername(normalizedUsername, pin))\n    } catch (caught) {\n      setError(caught instanceof Error && caught.message ? caught.message : 'เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบข้อมูลหรือลองใหม่อีกครั้ง')\n    } finally {\n      setSubmitting(false)\n    }\n  }\n\n  const handleRegister = async`,
  'login handler',
)

replaceOnce(
  /  const handleRegister = async \(event: React\.FormEvent\) => \{[\s\S]*?\n  \}\n\n  const updateRegistration = \(key: keyof typeof registration, value: string\) => setRegistration\(\(current\) => \(\{ \.\.\.current, \[key\]: value \}\)\)/,
  `  const handleRegister = async (event: React.FormEvent) => {\n    event.preventDefault()\n    setError('')\n    const normalizedUsername = registration.username.trim().toUpperCase()\n    const nextErrors: Record<string, string> = {}\n    if (!normalizedUsername) nextErrors.registerUsername = 'กรุณากำหนด Username'\n    else if (!/^[A-Z0-9_-]{3,32}$/.test(normalizedUsername)) nextErrors.registerUsername = 'ใช้ A-Z, 0-9, _ หรือ - จำนวน 3–32 ตัวเท่านั้น'\n    if (!registration.displayName.trim()) nextErrors.displayName = 'กรุณากรอกชื่อ-นามสกุล'\n    if (!registration.dateOfBirth) nextErrors.dateOfBirth = 'กรุณาเลือกวันเดือนปีเกิด'\n    else {\n      const birthDate = new Date(\`${'${registration.dateOfBirth}'}T00:00:00Z\`)\n      if (Number.isNaN(birthDate.getTime()) || birthDate > new Date()) nextErrors.dateOfBirth = 'วันเดือนปีเกิดไม่ถูกต้อง'\n    }\n    if (!registration.occupation.trim()) nextErrors.occupation = 'กรุณากรอกอาชีพ'\n    if (!/^\\d{4}$/.test(registration.pin)) nextErrors.registerPin = 'PIN ต้องเป็นตัวเลข 4 หลัก'\n    if (!registration.confirmPin) nextErrors.confirmPin = 'กรุณายืนยัน PIN อีกครั้ง'\n    else if (registration.pin !== registration.confirmPin) nextErrors.confirmPin = 'PIN ทั้งสองช่องไม่ตรงกัน'\n    setFieldErrors(nextErrors)\n    if (Object.keys(nextErrors).length) return\n\n    setSubmitting(true)\n    try {\n      await authService.register({ username: normalizedUsername, displayName: registration.displayName.trim(), dateOfBirth: registration.dateOfBirth, occupation: registration.occupation.trim(), pin: registration.pin })\n      setFieldErrors({})\n      setRegistrationComplete(true)\n    } catch (caught) {\n      setError(caught instanceof Error && caught.message ? caught.message : 'ลงทะเบียนไม่สำเร็จ กรุณาตรวจสอบข้อมูลแล้วลองใหม่อีกครั้ง')\n    } finally {\n      setSubmitting(false)\n    }\n  }\n\n  const updateRegistration = (key: keyof typeof registration, value: string) => {\n    setRegistration((current) => ({ ...current, [key]: value }))\n    const map: Record<keyof typeof registration, string> = {\n      username: 'registerUsername',\n      displayName: 'displayName',\n      dateOfBirth: 'dateOfBirth',\n      occupation: 'occupation',\n      pin: 'registerPin',\n      confirmPin: 'confirmPin',\n    }\n    clearFieldError(map[key])\n    if (error) setError('')\n  }`,
  'register handler',
)

replaceOnce(
  '<div className="input-wrap"><UserRound size={20} /><input id="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="เช่น DM001" /></div>',
  '<div className={fieldErrors.loginUsername ? "input-wrap input-error" : "input-wrap"}><UserRound size={20} /><input id="username" autoComplete="username" aria-invalid={Boolean(fieldErrors.loginUsername)} aria-describedby={fieldErrors.loginUsername ? "login-username-error" : undefined} value={username} onChange={(event) => { setUsername(event.target.value); clearFieldError("loginUsername"); if (error) setError("") }} placeholder="เช่น DM001" /></div>{fieldErrors.loginUsername ? <div id="login-username-error" className="field-error-text">{fieldErrors.loginUsername}</div> : null}',
  'login username field',
)

replaceOnce(
  '<div className="input-wrap"><ShieldCheck size={20} /><input id="pin" inputMode="numeric" autoComplete="current-password" maxLength={4} type="password" value={pin} onChange={(event) => setPin(event.target.value.replace(/\\D/g, \'\'))} placeholder="••••" /></div>',
  '<div className={fieldErrors.loginPin ? "input-wrap input-error" : "input-wrap"}><ShieldCheck size={20} /><input id="pin" inputMode="numeric" autoComplete="current-password" maxLength={4} type="password" aria-invalid={Boolean(fieldErrors.loginPin)} aria-describedby={fieldErrors.loginPin ? "login-pin-error" : undefined} value={pin} onChange={(event) => { setPin(event.target.value.replace(/\\D/g, \'\')); clearFieldError("loginPin"); if (error) setError("") }} placeholder="••••" /></div>{fieldErrors.loginPin ? <div id="login-pin-error" className="field-error-text">{fieldErrors.loginPin}</div> : null}',
  'login pin field',
)

const registerFields = [
  [
    '<input id="register-username" autoComplete="username" value={registration.username} onChange={(event) => updateRegistration(\'username\', event.target.value)} placeholder="ใช้ A-Z, 0-9, _ หรือ -" />',
    '<input id="register-username" className={fieldErrors.registerUsername ? "input-error" : undefined} autoComplete="username" aria-invalid={Boolean(fieldErrors.registerUsername)} aria-describedby={fieldErrors.registerUsername ? "register-username-error" : undefined} value={registration.username} onChange={(event) => updateRegistration(\'username\', event.target.value)} placeholder="ใช้ A-Z, 0-9, _ หรือ -" />{fieldErrors.registerUsername ? <div id="register-username-error" className="field-error-text">{fieldErrors.registerUsername}</div> : null}',
    'register username',
  ],
  [
    '<input id="register-name" autoComplete="name" value={registration.displayName} onChange={(event) => updateRegistration(\'displayName\', event.target.value)} />',
    '<input id="register-name" className={fieldErrors.displayName ? "input-error" : undefined} autoComplete="name" aria-invalid={Boolean(fieldErrors.displayName)} aria-describedby={fieldErrors.displayName ? "register-name-error" : undefined} value={registration.displayName} onChange={(event) => updateRegistration(\'displayName\', event.target.value)} />{fieldErrors.displayName ? <div id="register-name-error" className="field-error-text">{fieldErrors.displayName}</div> : null}',
    'register display name',
  ],
  [
    '<input id="register-dob" type="date" value={registration.dateOfBirth} onChange={(event) => updateRegistration(\'dateOfBirth\', event.target.value)} />',
    '<input id="register-dob" className={fieldErrors.dateOfBirth ? "input-error" : undefined} type="date" aria-invalid={Boolean(fieldErrors.dateOfBirth)} aria-describedby={fieldErrors.dateOfBirth ? "register-dob-error" : undefined} value={registration.dateOfBirth} onChange={(event) => updateRegistration(\'dateOfBirth\', event.target.value)} />{fieldErrors.dateOfBirth ? <div id="register-dob-error" className="field-error-text">{fieldErrors.dateOfBirth}</div> : null}',
    'register dob',
  ],
  [
    '<input id="register-occupation" value={registration.occupation} onChange={(event) => updateRegistration(\'occupation\', event.target.value)} />',
    '<input id="register-occupation" className={fieldErrors.occupation ? "input-error" : undefined} aria-invalid={Boolean(fieldErrors.occupation)} aria-describedby={fieldErrors.occupation ? "register-occupation-error" : undefined} value={registration.occupation} onChange={(event) => updateRegistration(\'occupation\', event.target.value)} />{fieldErrors.occupation ? <div id="register-occupation-error" className="field-error-text">{fieldErrors.occupation}</div> : null}',
    'register occupation',
  ],
  [
    '<input id="register-pin" type="password" inputMode="numeric" maxLength={4} autoComplete="new-password" value={registration.pin} onChange={(event) => updateRegistration(\'pin\', event.target.value.replace(/\\D/g, \'\').slice(0, 4))} />',
    '<input id="register-pin" className={fieldErrors.registerPin ? "input-error" : undefined} type="password" inputMode="numeric" maxLength={4} autoComplete="new-password" aria-invalid={Boolean(fieldErrors.registerPin)} aria-describedby={fieldErrors.registerPin ? "register-pin-error" : undefined} value={registration.pin} onChange={(event) => updateRegistration(\'pin\', event.target.value.replace(/\\D/g, \'\').slice(0, 4))} />{fieldErrors.registerPin ? <div id="register-pin-error" className="field-error-text">{fieldErrors.registerPin}</div> : null}',
    'register pin',
  ],
  [
    '<input id="register-confirm-pin" type="password" inputMode="numeric" maxLength={4} autoComplete="new-password" value={registration.confirmPin} onChange={(event) => updateRegistration(\'confirmPin\', event.target.value.replace(/\\D/g, \'\').slice(0, 4))} />',
    '<input id="register-confirm-pin" className={fieldErrors.confirmPin ? "input-error" : undefined} type="password" inputMode="numeric" maxLength={4} autoComplete="new-password" aria-invalid={Boolean(fieldErrors.confirmPin)} aria-describedby={fieldErrors.confirmPin ? "register-confirm-pin-error" : undefined} value={registration.confirmPin} onChange={(event) => updateRegistration(\'confirmPin\', event.target.value.replace(/\\D/g, \'\').slice(0, 4))} />{fieldErrors.confirmPin ? <div id="register-confirm-pin-error" className="field-error-text">{fieldErrors.confirmPin}</div> : null}',
    'register confirm pin',
  ],
]
for (const [search, replacement, label] of registerFields) replaceOnce(search, replacement, label)

source = source.replaceAll("setMode('register'); setError('')", "setMode('register'); setError(''); setFieldErrors({})")
source = source.replaceAll("setMode('login'); setError('')", "setMode('login'); setError(''); setFieldErrors({})")

fs.writeFileSync(path, source)
console.log('Auth field feedback patch applied')
