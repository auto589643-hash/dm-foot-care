import type { Disease, Examination, KnowledgeArticle, Profile, UserRecord } from './types'

export const patientProfile: Profile = {
  id: 'USR-001',
  username: 'DM001',
  displayName: 'สมใจ ใจดี',
  dateOfBirth: '1964-04-12',
  age: 62,
  generation: 'Baby Boomer',
  occupation: 'เกษตรกร',
  role: 'patient',
}

export const doctorProfile: Profile = {
  id: 'DOC-001',
  username: 'DMDR01',
  displayName: 'พญ. มาลี สุขใจ',
  dateOfBirth: '1980-11-02',
  age: 45,
  generation: 'Gen X',
  occupation: 'แพทย์',
  role: 'doctor',
}

export const footSteps = [
  { id: 'left-dorsal', label: 'หลังเท้าซ้าย', short: 'ซ้าย · หลังเท้า', hint: 'วางหลังเท้าซ้ายให้อยู่กลางกรอบ และให้เห็นตั้งแต่ปลายนิ้วถึงข้อเท้า' },
  { id: 'left-sole', label: 'ฝ่าเท้าซ้าย', short: 'ซ้าย · ฝ่าเท้า', hint: 'หงายฝ่าเท้าซ้ายเข้าหากล้อง ให้เห็นส้นเท้าและปลายนิ้วครบ' },
  { id: 'right-dorsal', label: 'หลังเท้าขวา', short: 'ขวา · หลังเท้า', hint: 'วางหลังเท้าขวาให้อยู่กลางกรอบ และให้เห็นตั้งแต่ปลายนิ้วถึงข้อเท้า' },
  { id: 'right-sole', label: 'ฝ่าเท้าขวา', short: 'ขวา · ฝ่าเท้า', hint: 'หงายฝ่าเท้าขวาเข้าหากล้อง ให้เห็นส้นเท้าและปลายนิ้วครบ' },
] as const

export const examinations: Examination[] = [
  {
    id: 'EX000124', date: '2026-08-08', displayDate: '8 ส.ค. 2569', time: '09:42', status: 'complete',
    findings: [
      { diseaseId: 'D001', name: 'ผิวแห้ง', detected: true, severity: 'ปานกลาง', confidence: 91, comparison: 'ดีขึ้น' },
      { diseaseId: 'D002', name: 'หนังด้าน', detected: true, severity: 'เล็กน้อย', confidence: 86, comparison: 'คงที่' },
    ],
  },
  {
    id: 'EX000117', date: '2026-07-25', displayDate: '25 ก.ค. 2569', time: '18:16', status: 'complete',
    findings: [
      { diseaseId: 'D001', name: 'ผิวแห้ง', detected: true, severity: 'รุนแรง', confidence: 89, comparison: 'แย่ลง' },
      { diseaseId: 'D002', name: 'หนังด้าน', detected: true, severity: 'เล็กน้อย', confidence: 82, comparison: 'คงที่' },
    ],
  },
  {
    id: 'EX000101', date: '2026-07-11', displayDate: '11 ก.ค. 2569', time: '08:05', status: 'complete',
    findings: [
      { diseaseId: 'D001', name: 'ผิวแห้ง', detected: true, severity: 'ปานกลาง', confidence: 84, comparison: 'ควรติดตาม' },
    ],
  },
  {
    id: 'EX000089', date: '2026-06-28', displayDate: '28 มิ.ย. 2569', time: '20:30', status: 'complete',
    findings: [
      { diseaseId: 'D001', name: 'ผิวแห้ง', detected: true, severity: 'เล็กน้อย', confidence: 81, comparison: 'คงที่' },
    ],
  },
]

export const diseases: Disease[] = [
  { id: 'D001', name: 'ผิวแห้ง', category: 'ผิวหนัง', description: 'ผิวบริเวณเท้าแห้ง ลอก หรือมีรอยแตกตื้น', criteria: 'พบผิวลอก ความหยาบ หรือรอยแตกในอย่างน้อย 1 ตำแหน่ง', severityCriteria: 'เล็กน้อย: แห้งเล็กน้อย · ปานกลาง: ลอกหลายจุด · รุนแรง: แตกหรือมีเลือดซึม', severity: 'ปานกลาง', care: 'ทาครีมบำรุงหลังล้างเท้า หลีกเลี่ยงการทาระหว่างซอกนิ้ว', recommendation: 'หากรอยแตกลึก เจ็บ หรือมีเลือดซึม ให้ติดต่อแพทย์', active: true },
  { id: 'D002', name: 'หนังด้าน', category: 'แรงกดทับ', description: 'ผิวหนังหนาตัวจากแรงกดหรือการเสียดสีซ้ำ', criteria: 'พบผิวหนา สีเหลือง หรือผิวแข็งเฉพาะจุด', severityCriteria: 'เล็กน้อย: จุดเล็กและไม่เจ็บ · ปานกลาง: หนาหลายจุด · รุนแรง: เจ็บหรือมีแผลใต้หนังด้าน', severity: 'เล็กน้อย', care: 'เลือกรองเท้าพอดีเท้า และไม่ตัดหนังด้านด้วยตนเอง', recommendation: 'ถ้าเจ็บมากหรือมีแผลใต้หนังด้าน ควรให้แพทย์ประเมิน', active: true },
  { id: 'D003', name: 'แผลที่เท้า', category: 'บาดแผล', description: 'ผิวหนังเปิด มีน้ำเหลือง เลือด หรือสะเก็ดผิดปกติ', criteria: 'พบการสูญเสียความต่อเนื่องของผิวหนัง', severityCriteria: 'เล็กน้อย: แผลตื้น · ปานกลาง: แผลมีน้ำเหลือง · รุนแรง: แผลลึก แดงลาม หรือมีไข้', severity: 'รุนแรง', care: 'ปิดแผลด้วยวัสดุสะอาด งดลงน้ำหนัก และติดต่อแพทย์', recommendation: 'แผลลึก แดงลาม มีหนอง หรือมีไข้ ควรพบแพทย์ทันที', active: true },
  { id: 'D004', name: 'เล็บขบ', category: 'เล็บ', description: 'ขอบเล็บกดเข้าเนื้อ อาจมีอาการแดง บวม หรือเจ็บ', criteria: 'ขอบเล็บชิดร่องเล็บร่วมกับรอยแดงหรือบวม', severityCriteria: 'เล็กน้อย: กดเล็กน้อย · ปานกลาง: บวมและเจ็บ · รุนแรง: มีหนองหรือแผลเปิด', severity: 'ปานกลาง', care: 'ไม่แคะมุมเล็บและตัดเล็บเป็นแนวตรง', recommendation: 'หากมีหนองหรือปวดมาก ไม่ควรตัดหรือแคะเอง', active: true },
  { id: 'D005', name: 'เชื้อราที่เล็บ', category: 'เล็บ', description: 'เล็บหนา เปลี่ยนสี หรือเปราะผิดปกติ', criteria: 'เล็บสีเหลือง/ขาว หนา หรือมีเศษใต้เล็บ', severityCriteria: 'เล็กน้อย: เปลี่ยนสีเล็กน้อย · ปานกลาง: เล็บหนา · รุนแรง: หลายเล็บหรือเจ็บร่วมด้วย', severity: 'เล็กน้อย', care: 'รักษาเท้าให้แห้งและรับการประเมินเพื่อเลือกยา', recommendation: 'ควรยืนยันการวินิจฉัยก่อนใช้ยารักษาเชื้อรา', active: false },
]

export const knowledgeArticles: KnowledgeArticle[] = [
  { id: 'K001', title: 'ดูแลผิวเท้าแห้งอย่างปลอดภัย', diseaseId: 'D001', category: 'ผิวหนัง', severity: 'ทุกระดับ', summary: 'วิธีเพิ่มความชุ่มชื้นโดยไม่ทำให้ซอกนิ้วอับ และสัญญาณที่ควรพบแพทย์', care: ['ล้างด้วยน้ำอุณหภูมิปกติ', 'ซับให้แห้งโดยเฉพาะซอกนิ้ว', 'ทาครีมบางๆ บนหลังเท้าและฝ่าเท้า'], treatment: 'ใช้ครีมเพิ่มความชุ่มชื้นตามคำแนะนำของแพทย์', recommendation: 'หากแตกเลือดซึมหรือเจ็บมากให้ติดต่อแพทย์', readTime: 'อ่าน 3 นาที', tone: 'blue' },
  { id: 'K002', title: 'เลือกรองเท้าเพื่อลดหนังด้าน', diseaseId: 'D002', category: 'แรงกดทับ', severity: 'เล็กน้อย', summary: 'เช็กความกว้าง พื้นรองเท้า และพื้นที่ปลายนิ้วก่อนสวมใส่เป็นเวลานาน', care: ['มีพื้นที่ขยับนิ้วเท้า', 'พื้นนุ่มและไม่บิดง่าย', 'ตรวจด้านในก่อนสวมทุกครั้ง'], treatment: 'ลดแรงกดและให้แพทย์ประเมินหากหนังด้านเจ็บ', recommendation: 'เปลี่ยนรองเท้าทันทีเมื่อพบจุดกดทับซ้ำ', readTime: 'อ่าน 4 นาที', tone: 'teal' },
  { id: 'K003', title: 'แผลแบบไหนไม่ควรรอดูอาการ', diseaseId: 'D003', category: 'บาดแผล', severity: 'รุนแรง', summary: 'รอยแดงลาม บวม ร้อน มีน้ำเหลือง หรือมีไข้ ควรติดต่อสถานพยาบาล', care: ['ไม่ใส่ยาที่แพทย์ไม่ได้แนะนำ', 'ปิดด้วยวัสดุสะอาด', 'งดลงน้ำหนักบริเวณแผล'], treatment: 'ล้างแผลอย่างเหมาะสมและรับการประเมินโดยเร็ว', recommendation: 'มีไข้ หนอง หรือรอยแดงลามให้ไปสถานพยาบาลทันที', readTime: 'อ่าน 2 นาที', tone: 'amber' },
  { id: 'K004', title: 'ตัดเล็บเท้าให้ถูกวิธี', diseaseId: 'D004', category: 'เล็บ', severity: 'ทุกระดับ', summary: 'ตัดเล็บเป็นแนวตรง ไม่สั้นชิดเนื้อ เพื่อลดโอกาสเกิดเล็บขบ', care: ['ตัดหลังอาบน้ำเมื่อเล็บนุ่ม', 'ใช้กรรไกรสะอาด', 'ลบมุมคมด้วยตะไบ'], treatment: 'หากบวมแดงหรือมีหนองควรให้แพทย์ดูแล', recommendation: 'ไม่แคะมุมเล็บหรือใช้ของแหลมตัดเอง', readTime: 'อ่าน 3 นาที', tone: 'blue' },
]

export const users: UserRecord[] = [
  { id: 'USR-001', username: 'DM001', name: 'สมใจ ใจดี', dateOfBirth: '1964-04-12', age: 62, occupation: 'เกษตรกร', pinConfigured: true, status: 'active', lastExam: 'วันนี้ 09:42' },
  { id: 'USR-002', username: 'DM002', name: 'ประเสริฐ มั่นคง', dateOfBirth: '1968-02-08', age: 58, occupation: 'ค้าขาย', pinConfigured: true, status: 'active', lastExam: '7 ส.ค. 2569' },
  { id: 'USR-003', username: 'DM003', name: 'นภา แสงทอง', dateOfBirth: '1959-11-23', age: 66, occupation: 'เกษียณ', pinConfigured: true, status: 'active', lastExam: '5 ส.ค. 2569' },
  { id: 'USR-004', username: 'DM004', name: 'วิชัย ดีพร้อม', dateOfBirth: '1971-06-18', age: 55, occupation: 'ช่างฝีมือ', pinConfigured: true, status: 'inactive', lastExam: '28 ก.ค. 2569' },
]

/** Demo-only staff view: production will query examinations by profiles.user_id through RLS. */
export const userExaminations: Record<string, Examination[]> = {
  'USR-001': examinations,
  'USR-002': [{ ...examinations[0], id: 'EX000122', displayDate: '7 ส.ค. 2569', time: '14:20', findings: [{ diseaseId: 'D003', name: 'แผลที่เท้า', detected: true, severity: 'รุนแรง', confidence: 88, comparison: 'ควรติดตาม' }, { diseaseId: 'D001', name: 'ผิวแห้ง', detected: true, severity: 'ปานกลาง', confidence: 84, comparison: 'คงที่' }] }],
  'USR-003': [{ ...examinations[0], id: 'EX000116', displayDate: '5 ส.ค. 2569', time: '09:10', findings: [{ diseaseId: 'D001', name: 'ผิวแห้ง', detected: true, severity: 'ปานกลาง', confidence: 86, comparison: 'คงที่' }] }],
  'USR-004': [{ ...examinations[3], id: 'EX000098', displayDate: '28 ก.ค. 2569', time: '16:35' }],
}
