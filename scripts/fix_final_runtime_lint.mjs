import fs from 'node:fs'

const path = 'src/App.tsx'
let source = fs.readFileSync(path, 'utf8')
source = source.replace(
  '<DiseaseManagement diseases={diseaseRecords} setDiseases={setDiseaseRecords} showToast={showToast} adminService={adminService} auditLogger={auditLogger} />',
  '<DiseaseManagement diseases={diseaseRecords} setDiseases={setDiseaseRecords} showToast={showToast} adminService={adminService} />',
)
source = source.replace(
  'function DiseaseManagement({ diseases: diseaseRecords, setDiseases, showToast, adminService, auditLogger }: { diseases: Disease[]; setDiseases: React.Dispatch<React.SetStateAction<Disease[]>>; showToast: (text: string) => void; adminService: AdminService; auditLogger?: AuditLogger }) {',
  'function DiseaseManagement({ diseases: diseaseRecords, setDiseases, showToast, adminService }: { diseases: Disease[]; setDiseases: React.Dispatch<React.SetStateAction<Disease[]>>; showToast: (text: string) => void; adminService: AdminService }) {',
)
fs.writeFileSync(path, source)
console.log('Final runtime lint fix applied')
