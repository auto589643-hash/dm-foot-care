export type Role = 'patient' | 'doctor'
export type Page = 'home' | 'exam' | 'history' | 'knowledge' | 'admin-home' | 'users' | 'diseases' | 'admin-knowledge'
export type Severity = 'เล็กน้อย' | 'ปานกลาง' | 'รุนแรง'
export type FootPosition = 'left-dorsal' | 'left-sole' | 'right-dorsal' | 'right-sole'

export interface Profile {
  id: string
  username: string
  displayName: string
  dateOfBirth: string
  age: number
  generation: string
  occupation: string
  role: Role
}

export interface DiseaseSeverityLevel {
  label: Severity
  rank: number
  criteria: string
}

export interface Disease {
  id: string
  name: string
  category: string
  description: string
  criteria: string
  severityCriteria: string
  severity: Severity
  /** Structured per-disease severity schema; the text field remains for API/backward compatibility. */
  severityLevels?: DiseaseSeverityLevel[]
  care: string
  recommendation: string
  referenceImage?: string
  active: boolean
}

export interface Finding {
  diseaseId: string
  name: string
  detected: boolean
  severity: Severity
  confidence: number
  comparison: 'ดีขึ้น' | 'คงที่' | 'ควรติดตาม' | 'แย่ลง'
}

export interface Examination {
  id: string
  date: string
  displayDate: string
  time: string
  findings: Finding[]
  status: 'complete' | 'processing' | 'draft'
  thumbnails?: Partial<Record<FootPosition, string>>
}

export interface KnowledgeArticle {
  id: string
  title: string
  diseaseId?: string
  category: string
  severity: Severity | 'ทุกระดับ'
  summary: string
  care: string[]
  treatment?: string
  recommendation?: string
  image?: string
  readTime: string
  tone: 'blue' | 'teal' | 'amber'
  status?: 'draft' | 'published' | 'archived'
}

export interface UserRecord {
  id: string
  username: string
  name: string
  dateOfBirth: string
  age: number
  occupation: string
  pinConfigured: boolean
  status: 'active' | 'inactive'
  lastExam: string
}
