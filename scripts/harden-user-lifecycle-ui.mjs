import { readFileSync, writeFileSync } from 'node:fs'

const path = 'src/App.tsx'
let source = readFileSync(path, 'utf8')
const from = `<div className="admin-form-grid"><div><label className="field-label" htmlFor="form-dob">วันเดือนปีเกิด</label><input id="form-dob" type="date" value={draft.dateOfBirth} onChange={(event) => update('dateOfBirth', event.target.value)} /><div className="derived-metric"><span>อายุ / Generation</span><strong>{calculateAge(draft.dateOfBirth)} ปี · {calculateGeneration(draft.dateOfBirth)}</strong></div></div><div><label className="field-label" htmlFor="form-status">สถานะ</label><select id="form-status" value={draft.status} onChange={(event) => update('status', event.target.value as UserRecord['status'])}><option value="pending">รออนุมัติ</option><option value="active">เปิดใช้งาน</option><option value="inactive">ปิดใช้งาน</option></select></div></div>`
const to = `<div className="admin-form-grid"><div><label className="field-label" htmlFor="form-dob">วันเดือนปีเกิด</label><input id="form-dob" type="date" value={draft.dateOfBirth} onChange={(event) => update('dateOfBirth', event.target.value)} /><div className="derived-metric"><span>อายุ / Generation</span><strong>{calculateAge(draft.dateOfBirth)} ปี · {calculateGeneration(draft.dateOfBirth)}</strong></div></div><div><label className="field-label">สถานะบัญชี</label><div className="derived-metric lifecycle-status-readonly"><span>จัดการจากหน้ารายการผู้ใช้งาน</span><strong>{draft.status === 'pending' ? 'รออนุมัติ' : draft.status === 'active' ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}</strong></div></div></div>`
if (!source.includes(from)) throw new Error('User status form target not found')
source = source.replace(from, to)
writeFileSync(path, source)

const cssPath = 'src/legacy65925.css'
let css = readFileSync(cssPath, 'utf8')
if (!css.includes('.lifecycle-status-readonly')) css += `\n.lifecycle-status-readonly { min-height: 50px; justify-content: center; }\n.lifecycle-status-readonly strong { color: #10233f; }\n`
writeFileSync(cssPath, css)
console.log('Lifecycle form hardened')
