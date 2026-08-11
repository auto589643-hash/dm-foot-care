import fs from 'node:fs'

const path = 'src/App.tsx'
let source = fs.readFileSync(path, 'utf8')
source = source.replace(', Page, Profile, Role, Severity, UserRecord }', ', Page, Profile, Severity, UserRecord }')
source = source.replace('useEffect(() => { let cancelled = false; setLoading(true); void adminService.listUserExaminations', 'useEffect(() => { let cancelled = false; void adminService.listUserExaminations')
fs.writeFileSync(path, source)
console.log('Applied hardening lint fixes')
