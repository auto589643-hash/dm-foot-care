export type Role = 'user' | 'admin'
export type Sex = 'male' | 'female' | 'other' | 'prefer_not_to_say'
export type Page = 'home' | 'exam' | 'history' | 'knowledge' | 'admin-home' | 'users' | 'diseases' | 'admin-knowledge'
export type Severity = 'เล็กน้อย' | 'ปานกลาง' | 'รุนแรง'
export type FootPosition = 'left-dorsal' | 'left-sole' | 'right-dorsal' | 'right-sole'
export type FindingComparison = 'ดีขึ้น' | 'คงที่' | 'ควรติดตาม' | 'แย่ลง' | 'ยังไม่มีข้อมูลเปรียบเทียบ'

export interface Profile {
  id: string
  username: string
  displayName: string
  dateOfBirth: string
  age: number
  generation: string
  occupation: string
  sex?: Sex
  diabetesYears?: number | null
  latestHba1c?: number | null
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
  comparison: FindingComparison
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
  youtubeUrl?: string
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
  sex?: Sex
  diabetesYears?: number | null
  latestHba1c?: number | null
  pinConfigured: boolean
  status: 'pending' | 'active' | 'inactive'
  lastExam: string
}

export interface AdminDashboardFollowup {
  userId: string
  username: string
  name: string
  issue: string
  time: string
  severe: boolean
}

export interface AdminDashboardRecentExam {
  examinationId: string
  userId: string
  username: string
  name: string
  displayDate: string
  findings: string[]
  status: 'success' | 'attention' | 'danger'
}

export interface AdminDashboard {
  activeUsers: number
  totalUsers: number
  usersWithHistory: number
  followupCount: number
  severeCount: number
  completedLast7Days: number
  averagePerDay: number
  activityLast7Days: { key: string; label: string; count: number }[]
  latestExam: { displayDate: string; username: string } | null
  followups: AdminDashboardFollowup[]
  recentExaminations: AdminDashboardRecentExam[]
}

export interface RegistrationInput {
  username: string
  displayName: string
  dateOfBirth: string
  occupation: string
  sex: Sex
  diabetesYears: number
  latestHba1c?: number
  pin: string
}
