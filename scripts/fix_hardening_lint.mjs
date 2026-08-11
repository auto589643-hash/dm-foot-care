import fs from 'node:fs'

const path = 'src/App.tsx'
let source = fs.readFileSync(path, 'utf8')
source = source.replace(', Page, Profile, Role, Severity, UserRecord }', ', Page, Profile, Severity, UserRecord }')
source = source.replace('useEffect(() => { let cancelled = false; setLoading(true); void adminService.listUserExaminations', 'useEffect(() => { let cancelled = false; void adminService.listUserExaminations')
source = source.replaceAll('useState(() => cloneFindings(mockFindings))', 'useState<Finding[]>([])')
source = source.replace("import { clearExaminationDraft, readExaminationDraft, saveExaminationDraft } from './services/draftStorage'", "import { clearExaminationDraft, readExaminationDraft, saveExaminationDraft } from './services/draftStorage'\nimport { photosToBlobs } from './services/photoBlobs'")
source = source.replace('adminService?: AdminService; auditLogger?: AuditLogger }) {', 'adminService: AdminService; auditLogger?: AuditLogger }) {')
if (source.includes('mockFindings') || source.includes('MockFootAssessmentProvider') || source.includes('InMemoryExaminationRepository')) {
  throw new Error('Runtime mock references still remain after hardening')
}
fs.writeFileSync(path, source)
console.log('Applied hardening lint/build fixes')
