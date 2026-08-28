from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def write(path: str, value: str) -> None:
    (ROOT / path).write_text(value, encoding='utf-8')


def replace_once(path: str, old: str, new: str) -> None:
    source = read(path)
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected one match, found {count}: {old[:120]!r}')
    write(path, source.replace(old, new, 1))


def replace_block(path: str, start_marker: str, end_marker: str, new_block: str) -> None:
    source = read(path)
    start = source.find(start_marker)
    if start < 0:
        raise RuntimeError(f'{path}: missing start marker {start_marker!r}')
    end = source.find(end_marker, start + len(start_marker))
    if end < 0:
        raise RuntimeError(f'{path}: missing end marker {end_marker!r}')
    write(path, source[:start] + new_block.rstrip() + '\n\n' + source[end:])


# ---------- types ----------
replace_once(
    'src/types.ts',
    "export type Page = 'home' | 'exam' | 'history' | 'knowledge' | 'admin-home' | 'users' | 'diseases' | 'admin-knowledge'",
    "export type Page = 'home' | 'exam' | 'history' | 'knowledge' | 'videos' | 'admin-home' | 'users' | 'diseases' | 'admin-knowledge' | 'admin-videos'",
)
replace_once('src/types.ts', "  youtubeUrl?: string\n", '')
replace_once(
    'src/types.ts',
    "export interface UserRecord {",
    "export interface CareVideo {\n  id: string\n  title: string\n  summary: string\n  youtubeUrl: string\n  image?: string\n  status?: 'draft' | 'published' | 'archived'\n}\n\nexport interface UserRecord {",
)

# ---------- service contracts ----------
replace_once(
    'src/services/contracts.ts',
    "import type { AdminDashboard, Disease, Examination, Finding, FootPosition, KnowledgeArticle, Profile, RegistrationInput, Severity, UserRecord } from '../types'",
    "import type { AdminDashboard, CareVideo, Disease, Examination, Finding, FootPosition, KnowledgeArticle, Profile, RegistrationInput, Severity, UserRecord } from '../types'",
)
replace_once(
    'src/services/contracts.ts',
    "  listPublished(options?: { limit?: number; includeDiseaseImages?: boolean }): Promise<{ articles: KnowledgeArticle[]; diseases: Disease[] }>\n  listSavedArticleIds(): Promise<string[]>",
    "  listPublished(options?: { limit?: number; includeDiseaseImages?: boolean }): Promise<{ articles: KnowledgeArticle[]; diseases: Disease[] }>\n  listVideos(): Promise<CareVideo[]>\n  listSavedArticleIds(): Promise<string[]>",
)
replace_once(
    'src/services/contracts.ts',
    "  getBootstrap(): Promise<{ users: UserRecord[]; diseases: Disease[]; articles: KnowledgeArticle[]; dashboard: AdminDashboard | null; partial: boolean }>",
    "  getBootstrap(): Promise<{ users: UserRecord[]; diseases: Disease[]; articles: KnowledgeArticle[]; videos: CareVideo[]; dashboard: AdminDashboard | null; partial: boolean }>",
)
replace_once(
    'src/services/contracts.ts',
    "  listKnowledge(): Promise<KnowledgeArticle[]>\n  getDashboard(): Promise<AdminDashboard>",
    "  listKnowledge(): Promise<KnowledgeArticle[]>\n  listCareVideos(): Promise<CareVideo[]>\n  getDashboard(): Promise<AdminDashboard>",
)
replace_once(
    'src/services/contracts.ts',
    "export type AdminKnowledgeWriteInput = Omit<KnowledgeArticle, 'id'> & { id?: string }",
    "export type AdminKnowledgeWriteInput = Omit<KnowledgeArticle, 'id'> & { id?: string }\nexport type AdminCareVideoWriteInput = Omit<CareVideo, 'id'> & { id?: string }",
)
replace_once(
    'src/services/contracts.ts',
    "  saveKnowledge(input: AdminKnowledgeWriteInput): Promise<KnowledgeArticle>\n}",
    "  saveKnowledge(input: AdminKnowledgeWriteInput): Promise<KnowledgeArticle>\n  saveCareVideo(input: AdminCareVideoWriteInput): Promise<CareVideo>\n}",
)

# ---------- HTTP adapters ----------
replace_once(
    'src/services/httpAdapters.ts',
    "  async listSavedArticleIds(): Promise<string[]> {",
    "  async listVideos(): Promise<import('../types.ts').CareVideo[]> {\n    const response = await this.client.get<{ videos?: import('../types.ts').CareVideo[] } | import('../types.ts').CareVideo[]>('/v1/care-videos')\n    return Array.isArray(response) ? response : response.videos ?? []\n  }\n\n  async listSavedArticleIds(): Promise<string[]> {",
)
replace_once(
    'src/services/httpAdapters.ts',
    "  async getBootstrap(): Promise<{ users: import('../types.ts').UserRecord[]; diseases: import('../types.ts').Disease[]; articles: import('../types.ts').KnowledgeArticle[]; dashboard: import('../types.ts').AdminDashboard | null; partial: boolean }> {\n    const response = await this.client.get<{ users?: import('../types.ts').UserRecord[]; diseases?: unknown; articles?: import('../types.ts').KnowledgeArticle[]; dashboard?: import('../types.ts').AdminDashboard | null; partial?: boolean }>('/v1/admin/bootstrap')\n    return { users: response.users ?? [], diseases: normalizeDiseaseList(response.diseases), articles: response.articles ?? [], dashboard: response.dashboard ?? null, partial: Boolean(response.partial) }\n  }",
    "  async getBootstrap(): Promise<{ users: import('../types.ts').UserRecord[]; diseases: import('../types.ts').Disease[]; articles: import('../types.ts').KnowledgeArticle[]; videos: import('../types.ts').CareVideo[]; dashboard: import('../types.ts').AdminDashboard | null; partial: boolean }> {\n    const response = await this.client.get<{ users?: import('../types.ts').UserRecord[]; diseases?: unknown; articles?: import('../types.ts').KnowledgeArticle[]; videos?: import('../types.ts').CareVideo[]; dashboard?: import('../types.ts').AdminDashboard | null; partial?: boolean }>('/v1/admin/bootstrap')\n    return { users: response.users ?? [], diseases: normalizeDiseaseList(response.diseases), articles: response.articles ?? [], videos: response.videos ?? [], dashboard: response.dashboard ?? null, partial: Boolean(response.partial) }\n  }",
)
replace_once(
    'src/services/httpAdapters.ts',
    "  async saveUser(input: import('./contracts.ts').AdminUserWriteInput): Promise<import('../types.ts').UserRecord> {",
    "  async listCareVideos(): Promise<import('../types.ts').CareVideo[]> {\n    return readArrayResponse(await this.client.get<import('../types.ts').CareVideo[] | { videos?: import('../types.ts').CareVideo[] }>('/v1/admin/care-videos'), 'videos')\n  }\n\n  async saveUser(input: import('./contracts.ts').AdminUserWriteInput): Promise<import('../types.ts').UserRecord> {",
)
replace_once(
    'src/services/httpAdapters.ts',
    "  async saveKnowledge(input: import('./contracts.ts').AdminKnowledgeWriteInput): Promise<import('../types.ts').KnowledgeArticle> {\n    const path = input.id ? `/v1/admin/knowledge/${encodeURIComponent(input.id)}` : '/v1/admin/knowledge'\n    const response = input.id\n      ? await this.client.patchJson<import('../types.ts').KnowledgeArticle | { article?: import('../types.ts').KnowledgeArticle }>(path, input)\n      : await this.client.postJson<import('../types.ts').KnowledgeArticle | { article?: import('../types.ts').KnowledgeArticle }>(path, input)\n    return readObjectResponse(response, 'article')\n  }",
    "  async saveKnowledge(input: import('./contracts.ts').AdminKnowledgeWriteInput): Promise<import('../types.ts').KnowledgeArticle> {\n    const path = input.id ? `/v1/admin/knowledge/${encodeURIComponent(input.id)}` : '/v1/admin/knowledge'\n    const response = input.id\n      ? await this.client.patchJson<import('../types.ts').KnowledgeArticle | { article?: import('../types.ts').KnowledgeArticle }>(path, input)\n      : await this.client.postJson<import('../types.ts').KnowledgeArticle | { article?: import('../types.ts').KnowledgeArticle }>(path, input)\n    return readObjectResponse(response, 'article')\n  }\n\n  async saveCareVideo(input: import('./contracts.ts').AdminCareVideoWriteInput): Promise<import('../types.ts').CareVideo> {\n    const path = input.id ? `/v1/admin/care-videos/${encodeURIComponent(input.id)}` : '/v1/admin/care-videos'\n    const response = input.id\n      ? await this.client.patchJson<import('../types.ts').CareVideo | { video?: import('../types.ts').CareVideo }>(path, input)\n      : await this.client.postJson<import('../types.ts').CareVideo | { video?: import('../types.ts').CareVideo }>(path, input)\n    return readObjectResponse(response, 'video')\n  }",
)

# ---------- clean video concerns out of knowledge backend ----------
for path in ['backend/api/v1/knowledge.mjs', 'backend/api/v1/admin/knowledge.mjs']:
    source = read(path)
    source = source.replace("youtubeUrl: '', ", '')
    source = source.replace("youtubeUrl: String(value.youtubeUrl || ''),\n    ", '')
    source = source.replace("    youtubeUrl: body.youtubeUrl || undefined,\n", '')
    source = source.replace("        youtubeUrl: content.youtubeUrl || undefined,\n", '')
    write(path, source)

admin_knowledge = read('backend/api/v1/admin/knowledge.mjs')
admin_knowledge = admin_knowledge.replace("\nfunction normalizeYoutubeUrl(value) {\n  const raw = String(value || '').trim()\n  if (!raw) return ''\n  let parsed\n  try { parsed = new URL(raw) } catch { throw badRequest('URL YouTube ไม่ถูกต้อง') }\n  const host = parsed.hostname.toLowerCase().replace(/^www\\./, '')\n  if (parsed.protocol !== 'https:' || !['youtube.com', 'm.youtube.com', 'youtu.be'].includes(host)) throw badRequest('กรุณาใช้ลิงก์ YouTube แบบ https เท่านั้น')\n  return parsed.toString()\n}\n", "\n")
admin_knowledge = admin_knowledge.replace("  const youtubeUrl = normalizeYoutubeUrl(body.youtubeUrl)\n", '')
admin_knowledge = admin_knowledge.replace("  if (!care.length && !youtubeUrl) throw badRequest('กรุณาระบุขั้นตอนการดูแลอย่างน้อย 1 ขั้นตอน หรือเพิ่มลิงก์วิดีโอ YouTube')\n", "  if (!care.length) throw badRequest('กรุณาระบุขั้นตอนการดูแลอย่างน้อย 1 ขั้นตอน')\n")
admin_knowledge = admin_knowledge.replace("      youtubeUrl,\n", '')
write('backend/api/v1/admin/knowledge.mjs', admin_knowledge)

# ---------- admin bootstrap ----------
replace_once('backend/api/v1/admin/bootstrap.mjs', "import { listArticles } from './knowledge.mjs'", "import { listArticles } from './knowledge.mjs'\nimport { listCareVideos } from './care-videos.mjs'")
replace_once(
    'backend/api/v1/admin/bootstrap.mjs',
    "      listArticles(),\n      sharedRows.then((rows) => loadDashboard(rows)),",
    "      listArticles(),\n      listCareVideos(),\n      sharedRows.then((rows) => loadDashboard(rows)),",
)
replace_once(
    'backend/api/v1/admin/bootstrap.mjs',
    "    return sendJson(res, 200, { users: value(0, []), diseases: value(1, []), articles: value(2, []), dashboard: value(3, null), partial })",
    "    return sendJson(res, 200, { users: value(0, []), diseases: value(1, []), articles: value(2, []), videos: value(3, []), dashboard: value(4, null), partial })",
)

# ---------- API router ----------
replace_once('api/[...route].mjs', "import knowledge from '../backend/api/v1/knowledge.mjs'", "import knowledge from '../backend/api/v1/knowledge.mjs'\nimport careVideos from '../backend/api/v1/care-videos.mjs'")
replace_once('api/[...route].mjs', "import adminKnowledge from '../backend/api/v1/admin/knowledge.mjs'", "import adminKnowledge from '../backend/api/v1/admin/knowledge.mjs'\nimport adminCareVideos from '../backend/api/v1/admin/care-videos.mjs'")
replace_once('api/[...route].mjs', "  if (path === 'v1/knowledge') return knowledge(req, res)", "  if (path === 'v1/knowledge') return knowledge(req, res)\n  if (path === 'v1/care-videos') return careVideos(req, res)")
replace_once('api/[...route].mjs', "  if (path === 'v1/admin/knowledge') return adminKnowledge(req, res)", "  if (path === 'v1/admin/knowledge') return adminKnowledge(req, res)\n  if (path === 'v1/admin/care-videos') return adminCareVideos(req, res)")
replace_once(
    'api/[...route].mjs',
    "  match = path.match(/^v1\\/admin\\/knowledge\\/([^/]+)$/)\n  if (match) {\n    withParams(req, { articleId: decodeURIComponent(match[1]) })\n    return adminKnowledge(req, res)\n  }",
    "  match = path.match(/^v1\\/admin\\/knowledge\\/([^/]+)$/)\n  if (match) {\n    withParams(req, { articleId: decodeURIComponent(match[1]) })\n    return adminKnowledge(req, res)\n  }\n  match = path.match(/^v1\\/admin\\/care-videos\\/([^/]+)$/)\n  if (match) {\n    withParams(req, { videoId: decodeURIComponent(match[1]) })\n    return adminCareVideos(req, res)\n  }",
)

# ---------- App shell, state and navigation ----------
replace_once(
    'src/App.tsx',
    "import type { AdminDashboard, AdminDashboardRecentExam, Disease, DiseaseSeverityLevel, Examination, Finding, FootPosition, KnowledgeArticle, Page, Profile, RegistrationInput, Sex, Severity, UserRecord } from './types'",
    "import type { AdminDashboard, AdminDashboardRecentExam, CareVideo, Disease, DiseaseSeverityLevel, Examination, Finding, FootPosition, KnowledgeArticle, Page, Profile, RegistrationInput, Sex, Severity, UserRecord } from './types'",
)
replace_once(
    'src/App.tsx',
    "  { page: 'knowledge', label: 'คำแนะนำการดูแลเท้า', icon: BookOpen },\n]",
    "  { page: 'knowledge', label: 'คำแนะนำการดูแลเท้า', icon: BookOpen },\n  { page: 'videos', label: 'วิดีโอแนะนำการดูแลเท้า', icon: Video },\n]",
)
replace_once(
    'src/App.tsx',
    "  { page: 'admin-knowledge', label: 'คำแนะนำการดูแลเท้า', icon: Library },\n]",
    "  { page: 'admin-knowledge', label: 'คำแนะนำการดูแลเท้า', icon: Library },\n  { page: 'admin-videos', label: 'วิดีโอแนะนำการดูแลเท้า', icon: Video },\n]",
)
replace_once(
    'src/App.tsx',
    "  const [patientKnowledge, setPatientKnowledge] = useState<KnowledgeArticle[]>([])\n  const [patientDiseases, setPatientDiseases] = useState<Disease[]>([])",
    "  const [patientKnowledge, setPatientKnowledge] = useState<KnowledgeArticle[]>([])\n  const [patientVideos, setPatientVideos] = useState<CareVideo[]>([])\n  const [patientVideosLoaded, setPatientVideosLoaded] = useState(false)\n  const [patientDiseases, setPatientDiseases] = useState<Disease[]>([])",
)
replace_once(
    'src/App.tsx',
    "  useEffect(() => {\n    if (!integrations) return",
    "  const loadPatientVideos = useCallback(async () => {\n    if (!integrations?.knowledge) return\n    try {\n      setPatientVideos(await integrations.knowledge.listVideos())\n      setPatientVideosLoaded(true)\n    } catch {\n      // Keep the last video list visible if the endpoint is temporarily unavailable.\n    }\n  }, [integrations])\n\n  useEffect(() => {\n    if (!integrations) return",
)
replace_once('src/App.tsx', "    setPatientKnowledge([])\n    setPatientDiseases([])", "    setPatientKnowledge([])\n    setPatientVideos([])\n    setPatientVideosLoaded(false)\n    setPatientDiseases([])")
replace_once(
    'src/App.tsx',
    "      if (nextPage === 'knowledge' && patientKnowledgeMode !== 'full') void loadPatientKnowledge(false)",
    "      if (nextPage === 'knowledge' && patientKnowledgeMode !== 'full') void loadPatientKnowledge(false)\n      if (nextPage === 'videos' && !patientVideosLoaded) void loadPatientVideos()",
)
replace_once(
    'src/App.tsx',
    "              knowledgeArticles={patientKnowledge}\n              diseaseRecords={patientDiseases}",
    "              knowledgeArticles={patientKnowledge}\n              careVideos={patientVideos}\n              diseaseRecords={patientDiseases}",
)

# PatientPages signature and page route
replace_once(
    'src/App.tsx',
    "function PatientPages({ profile, page, setPage, examStage, setExamStage, examinations: patientExaminations, knowledgeArticles: patientKnowledge, diseaseRecords: patientDiseases, integrations, onExamCompleted, showToast }: { profile: Profile; page: Page; setPage: (page: Page) => void; examStage: ExamStage; setExamStage: (stage: ExamStage) => void; examinations: Examination[]; knowledgeArticles: KnowledgeArticle[]; diseaseRecords: Disease[]; integrations: RuntimeIntegrations; onExamCompleted: (exam: Examination) => void; showToast: (text: string) => void }) {",
    "function PatientPages({ profile, page, setPage, examStage, setExamStage, examinations: patientExaminations, knowledgeArticles: patientKnowledge, careVideos: patientVideos, diseaseRecords: patientDiseases, integrations, onExamCompleted, showToast }: { profile: Profile; page: Page; setPage: (page: Page) => void; examStage: ExamStage; setExamStage: (stage: ExamStage) => void; examinations: Examination[]; knowledgeArticles: KnowledgeArticle[]; careVideos: CareVideo[]; diseaseRecords: Disease[]; integrations: RuntimeIntegrations; onExamCompleted: (exam: Examination) => void; showToast: (text: string) => void }) {",
)
replace_once(
    'src/App.tsx',
    "  if (page === 'knowledge') return <KnowledgePage articles={patientKnowledge} diseaseRecords={patientDiseases} showToast={showToast} knowledgeService={integrations.knowledge} />\n  return <PatientHome",
    "  if (page === 'knowledge') return <KnowledgePage articles={patientKnowledge} diseaseRecords={patientDiseases} showToast={showToast} knowledgeService={integrations.knowledge} />\n  if (page === 'videos') return <CareVideoPage videos={patientVideos} />\n  return <PatientHome",
)

# Replace patient knowledge/video implementation completely.
patient_content = r'''function getYoutubeVideoId(value?: string): string | null {
  if (!value) return null
  try {
    const parsed = new URL(value)
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
    let videoId = ''
    if (host === 'youtu.be') videoId = parsed.pathname.split('/').filter(Boolean)[0] ?? ''
    else if (host === 'youtube.com' || host === 'm.youtube.com') {
      videoId = parsed.searchParams.get('v') ?? ''
      if (!videoId) {
        const segments = parsed.pathname.split('/').filter(Boolean)
        if (['embed', 'shorts', 'live'].includes(segments[0] ?? '')) videoId = segments[1] ?? ''
      }
    }
    return /^[A-Za-z0-9_-]{6,32}$/.test(videoId) ? videoId : null
  } catch {
    return null
  }
}

function getYoutubeEmbedUrl(value?: string): string | null {
  const videoId = getYoutubeVideoId(value)
  return videoId ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?rel=0&playsinline=1` : null
}

function getYoutubeThumbnailUrl(value?: string): string | null {
  const videoId = getYoutubeVideoId(value)
  return videoId ? `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg` : null
}

function KnowledgePage({ articles, diseaseRecords, showToast, knowledgeService }: { articles: KnowledgeArticle[]; diseaseRecords: Disease[]; showToast: (text: string) => void; knowledgeService: KnowledgeLibraryService }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('ทั้งหมด')
  const [diseaseFilter, setDiseaseFilter] = useState('ทั้งหมด')
  const [severityFilter, setSeverityFilter] = useState('ทั้งหมด')
  const [selected, setSelected] = useState<KnowledgeArticle | null>(null)
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set())
  const [savingId, setSavingId] = useState<string | null>(null)
  useEffect(() => { let cancelled = false; void knowledgeService.listSavedArticleIds().then((ids) => { if (!cancelled) setSavedIds(new Set(ids)) }).catch(() => { if (!cancelled) showToast('โหลดรายการที่บันทึกไว้ไม่สำเร็จ') }); return () => { cancelled = true } }, [knowledgeService, showToast])
  const categories = ['ทั้งหมด', ...new Set(articles.map((article) => article.category))]
  const diseaseOptions = ['ทั้งหมด', ...diseaseRecords.map((disease) => disease.id)]
  const severityOptions = ['ทั้งหมด', 'ทุกระดับ', 'เล็กน้อย', 'ปานกลาง', 'รุนแรง'] as const
  const filtered = useMemo(() => articles.filter((article) => (category === 'ทั้งหมด' || article.category === category) && (diseaseFilter === 'ทั้งหมด' || article.diseaseId === diseaseFilter) && (severityFilter === 'ทั้งหมด' || article.severity === severityFilter) && `${article.title} ${article.summary} ${article.diseaseId ?? ''}`.toLowerCase().includes(query.toLowerCase())), [articles, query, category, diseaseFilter, severityFilter])
  const toggleSaved = async (article: KnowledgeArticle) => {
    const wasSaved = savedIds.has(article.id); const nextSaved = !wasSaved
    setSavedIds((current) => { const next = new Set(current); if (nextSaved) next.add(article.id); else next.delete(article.id); return next })
    setSavingId(article.id)
    try { await knowledgeService.setSaved(article.id, nextSaved); showToast(nextSaved ? 'บันทึกไว้อ่านภายหลังแล้ว' : 'นำออกจากรายการที่บันทึกแล้ว') }
    catch { setSavedIds((current) => { const next = new Set(current); if (wasSaved) next.add(article.id); else next.delete(article.id); return next }); showToast('บันทึกรายการไม่สำเร็จ ระบบคืนสถานะเดิมแล้ว') }
    finally { setSavingId(null) }
  }
  return <div className="page knowledge-page"><PageTitle eyebrow="ความรู้สำหรับการดูแล" title="คำแนะนำการดูแลเท้า" description="คำแนะนำที่อ่านง่ายสำหรับการดูแลเท้าอย่างต่อเนื่อง" /><div className="knowledge-tools"><label className="search-field"><Search size={20} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหา เช่น ผิวแห้ง หนังด้าน" aria-label="ค้นหาคำแนะนำการดูแลเท้า" /></label><div className="category-chips" aria-label="กรองตามหมวดหมู่">{categories.map((item) => <button className={category === item ? 'active' : ''} type="button" key={item} onClick={() => setCategory(item)}>{item}</button>)}</div><div className="knowledge-filter-row"><label><span>ภาวะ</span><select aria-label="กรองตามภาวะ" value={diseaseFilter} onChange={(event) => setDiseaseFilter(event.target.value)}>{diseaseOptions.map((id) => <option value={id} key={id}>{id === 'ทั้งหมด' ? id : `${id} · ${diseaseRecords.find((disease) => disease.id === id)?.name ?? id}`}</option>)}</select></label><label><span>ระดับความรุนแรง</span><select aria-label="กรองตามระดับความรุนแรง" value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)}>{severityOptions.map((severity) => <option value={severity} key={severity}>{severity}</option>)}</select></label></div></div>{filtered.length ? <div className="article-grid">{filtered.map((article, index) => <article className={`article-card tone-${article.tone}`} key={article.id}><div className="article-visual">{article.image ? <img src={article.image} alt="" /> : <HeartPulse size={30} />}<span>{index + 1}</span></div><div className="article-body"><div><span className="category-label">{article.category}</span><span>{article.severity} · {article.readTime}</span></div><h2>{article.title}</h2><p>{article.summary}</p><button className="card-link" type="button" onClick={() => setSelected(article)}>ดูคำแนะนำ <ChevronRight size={18} /></button></div></article>)}</div> : <div className="empty-state"><Search size={32} /><h2>ยังไม่พบหัวข้อนี้</h2><p>ลองค้นด้วยคำที่สั้นลง หรือเลือก “ทั้งหมด” เพื่อดูคำแนะนำที่มี</p><button className="button button-secondary" type="button" onClick={() => { setQuery(''); setCategory('ทั้งหมด'); setDiseaseFilter('ทั้งหมด'); setSeverityFilter('ทั้งหมด') }}>ดูคำแนะนำทั้งหมด</button></div>}{selected ? <ArticleModal article={selected} saved={savedIds.has(selected.id)} saving={savingId === selected.id} onClose={() => setSelected(null)} onSaved={() => void toggleSaved(selected)} /> : null}</div>
}

function ArticleModal({ article, saved, saving, onClose, onSaved }: { article: KnowledgeArticle; saved: boolean; saving: boolean; onClose: () => void; onSaved: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><article className="detail-modal article-modal" role="dialog" aria-modal="true" aria-labelledby="article-title"><header><div><span className="eyebrow">{article.category} · {article.severity} · {article.readTime}</span><h2 id="article-title">{article.title}</h2></div><button className="icon-button" type="button" aria-label="ปิด" onClick={onClose}><X size={21} /></button></header><div className={`article-hero tone-${article.tone}`}>{article.image ? <img src={article.image} alt="" /> : <HeartPulse size={44} />}</div><p className="article-intro">{article.summary}</p>{article.care.length ? <><h3>ทำตามขั้นตอนนี้</h3><ol className="care-steps">{article.care.map((step, index) => <li key={`${index}-${step}`}><span>{index + 1}</span>{step}</li>)}</ol></> : null}{article.treatment ? <section className="article-guidance"><h3>การรักษา</h3><p>{article.treatment}</p></section> : null}{article.recommendation ? <section className="article-guidance"><h3>คำแนะนำเพิ่มเติม</h3><p>{article.recommendation}</p></section> : null}<div className="review-explainer"><Info size={19} /><p>คำแนะนำทั่วไปอาจไม่เหมาะกับทุกคน หากมีอาการผิดปกติควรปรึกษาแพทย์</p></div><button className={saving ? 'button button-secondary action-pending' : 'button button-secondary'} type="button" disabled={saving} onClick={onSaved}>{saving ? 'กำลังบันทึก…' : saved ? 'นำออกจากรายการที่บันทึก' : 'บันทึกไว้อ่านภายหลัง'}</button></article></div>
}

function CareVideoPage({ videos }: { videos: CareVideo[] }) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<CareVideo | null>(null)
  const filtered = useMemo(() => videos.filter((video) => `${video.title} ${video.summary}`.toLowerCase().includes(query.toLowerCase())), [videos, query])
  return <div className="page care-video-page"><PageTitle eyebrow="เรียนรู้ด้วยวิดีโอ" title="วิดีโอแนะนำการดูแลเท้า" description="รับชมวิดีโอแนะนำจาก YouTube ได้ภายใน DM Foot Care โดยไม่ต้องออกจากเว็บไซต์" /><div className="knowledge-tools video-search-tools"><label className="search-field"><Search size={20} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาวิดีโอแนะนำ" aria-label="ค้นหาวิดีโอแนะนำการดูแลเท้า" /></label></div>{filtered.length ? <div className="care-video-grid">{filtered.map((video) => { const cover = video.image || getYoutubeThumbnailUrl(video.youtubeUrl); return <article className="care-video-card" key={video.id}><button type="button" className="care-video-cover" onClick={() => setSelected(video)} aria-label={`เปิดวิดีโอ ${video.title}`}>{cover ? <img src={cover} alt="" /> : <span className="video-cover-fallback"><Video size={38} /></span>}<span className="video-play-mark"><Video size={24} /></span></button><div className="care-video-card-body"><span className="category-label"><Video size={14} />วิดีโอ</span><h2>{video.title}</h2>{video.summary ? <p>{video.summary}</p> : null}<button className="card-link" type="button" onClick={() => setSelected(video)}>รับชมในเว็บ <ChevronRight size={18} /></button></div></article> })}</div> : <div className="empty-state"><Video size={32} /><h2>ยังไม่พบวิดีโอ</h2><p>{query ? 'ลองค้นหาด้วยคำที่สั้นลง' : 'เมื่อผู้ดูแลเพิ่มวิดีโอ รายการจะแสดงที่หน้านี้'}</p>{query ? <button className="button button-secondary" type="button" onClick={() => setQuery('')}>ดูวิดีโอทั้งหมด</button> : null}</div>}{selected ? <CareVideoModal video={selected} onClose={() => setSelected(null)} /> : null}</div>
}

function CareVideoModal({ video, onClose }: { video: CareVideo; onClose: () => void }) {
  const embedUrl = getYoutubeEmbedUrl(video.youtubeUrl)
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><article className="detail-modal care-video-modal" role="dialog" aria-modal="true" aria-labelledby="care-video-title"><header><div><span className="eyebrow">วิดีโอแนะนำการดูแลเท้า</span><h2 id="care-video-title">{video.title}</h2></div><button className="icon-button" type="button" aria-label="ปิดวิดีโอ" onClick={onClose}><X size={21} /></button></header>{embedUrl ? <div className="youtube-embed care-video-player"><iframe src={embedUrl} title={video.title} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /></div> : <div className="form-error" role="alert"><AlertTriangle size={18} />ลิงก์วิดีโอนี้ไม่สามารถเปิดได้</div>}{video.summary ? <p className="article-intro">{video.summary}</p> : null}<button className="button button-secondary" type="button" onClick={onClose}>ปิดวิดีโอ</button></article></div>
}'''
replace_block('src/App.tsx', 'function getYoutubeEmbedUrl(value?: string): string | null {', 'function DoctorPages({ page, setPage, showToast, adminService, auditLogger }:', patient_content)

# Replace DoctorPages to track dedicated video data.
doctor_pages = r'''function DoctorPages({ page, setPage, showToast, adminService, auditLogger }: { page: Page; setPage: (page: Page) => void; showToast: (text: string) => void; adminService: AdminService; auditLogger?: AuditLogger }) {
  const [userRecords, setUserRecords] = useState<UserRecord[]>([])
  const [diseaseRecords, setDiseaseRecords] = useState<Disease[]>([])
  const [knowledgeRecords, setKnowledgeRecords] = useState<KnowledgeArticle[]>([])
  const [videoRecords, setVideoRecords] = useState<CareVideo[]>([])
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null)
  useEffect(() => {
    let cancelled = false
    void adminService.getBootstrap().then((data) => {
      if (cancelled) return
      setUserRecords(data.users)
      setDiseaseRecords(data.diseases)
      setKnowledgeRecords(data.articles)
      setVideoRecords(data.videos)
      if (data.dashboard) setDashboard(data.dashboard)
      if (data.partial) showToast('โหลดข้อมูลบางส่วนไม่สำเร็จ กรุณาลองใหม่')
    }).catch(() => { if (!cancelled) showToast('โหลดข้อมูลผู้ดูแลระบบไม่สำเร็จ กรุณาลองใหม่') })
    return () => { cancelled = true }
  }, [adminService, showToast])
  if (page === 'users') return <UserManagement users={userRecords} diseaseRecords={diseaseRecords} setUsers={setUserRecords} showToast={showToast} adminService={adminService} auditLogger={auditLogger} onUsersChanged={() => { void adminService.getDashboard().then(setDashboard).catch(() => {}) }} />
  if (page === 'diseases') return <DiseaseManagement diseases={diseaseRecords} setDiseases={setDiseaseRecords} showToast={showToast} adminService={adminService} />
  if (page === 'admin-knowledge') return <KnowledgeManagement articles={knowledgeRecords} diseaseRecords={diseaseRecords} setArticles={setKnowledgeRecords} showToast={showToast} adminService={adminService} />
  if (page === 'admin-videos') return <VideoManagement videos={videoRecords} setVideos={setVideoRecords} showToast={showToast} adminService={adminService} />
  return <AdminHome dashboard={dashboard} onOpenUsers={() => setPage('users')} />
}'''
replace_block('src/App.tsx', 'function DoctorPages({ page, setPage, showToast, adminService, auditLogger }:', 'function AdminHome(', doctor_pages)

# Replace admin knowledge management and append dedicated video management.
admin_content = r'''function KnowledgeManagement({ articles, diseaseRecords, setArticles, showToast, adminService }: { articles: KnowledgeArticle[]; diseaseRecords: Disease[]; setArticles: React.Dispatch<React.SetStateAction<KnowledgeArticle[]>>; showToast: (text: string) => void; adminService: AdminService }) {
  const [editing, setEditing] = useState<KnowledgeArticle | null>(null)
  const [creating, setCreating] = useState(false)
  const publishedCount = articles.filter((article) => (article.status ?? 'published') === 'published').length
  const closeForm = () => { setEditing(null); setCreating(false) }
  const saveArticle = async (draft: Omit<KnowledgeArticle, 'id'>) => {
    try {
      const saved = await adminService.saveKnowledge({ ...draft, ...(editing ? { id: editing.id } : {}) })
      setArticles((current) => editing ? current.map((item) => item.id === editing.id ? saved : item) : [saved, ...current])
      showToast(editing ? 'บันทึกการแก้ไขแล้ว' : 'สร้างคำแนะนำแล้ว')
      closeForm()
    } catch {
      showToast('บันทึกคำแนะนำไม่สำเร็จ')
    }
  }
  return <div className="page admin-page"><PageTitle eyebrow="เนื้อหาสำหรับผู้ใช้" title="จัดการคำแนะนำการดูแลเท้า" description="จัดการบทความและขั้นตอนการดูแลที่แสดงให้ผู้ใช้" action={<button className="button button-primary" type="button" onClick={() => { setEditing(null); setCreating(true) }}><Plus size={18} />สร้างคำแนะนำ</button>} /><div className="admin-stat-grid compact"><AdminStat icon={BookOpen} label="เผยแพร่แล้ว" value={String(publishedCount)} note="พร้อมให้ผู้ใช้อ่าน" tone="blue" /></div><div className="knowledge-admin-list">{articles.map((article) => { const status = article.status ?? 'published'; return <article key={article.id}><span className={`article-icon tone-${article.tone}`}><HeartPulse size={23} /></span><div><span className="category-label">{article.category}</span><h2>{article.title}</h2><p>{article.summary}</p></div><span className={status === 'published' ? 'status-pill success' : status === 'draft' ? 'status-pill attention' : 'status-pill muted'}>{status === 'published' ? 'เผยแพร่แล้ว' : status === 'draft' ? 'ฉบับร่าง' : 'เก็บถาวร'}</span><button className="button button-secondary button-small" type="button" onClick={() => { setCreating(false); setEditing(article) }}>แก้ไข</button></article> })}</div>{creating || editing ? <KnowledgeFormModal article={editing} diseases={diseaseRecords} onClose={closeForm} onSave={saveArticle} /> : null}</div>
}

function KnowledgeFormModal({ article, diseases: diseaseRecords, onClose, onSave }: { article: KnowledgeArticle | null; diseases: Disease[]; onClose: () => void; onSave: (draft: Omit<KnowledgeArticle, 'id'>) => void | Promise<void> }) {
  const [draft, setDraft] = useState<Omit<KnowledgeArticle, 'id'>>(() => article ? { title: article.title, diseaseId: article.diseaseId, category: article.category, severity: article.severity, summary: article.summary, care: article.care.length ? article.care : [''], treatment: article.treatment, recommendation: article.recommendation, image: article.image, readTime: article.readTime, tone: article.tone, status: article.status ?? 'published' } : { title: '', diseaseId: '', category: 'ผิวหนัง', severity: 'ทุกระดับ', summary: '', care: ['', '', ''], treatment: '', recommendation: '', image: undefined, readTime: '', tone: 'blue', status: 'draft' })
  const update = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const updateCare = (index: number, value: string) => update('care', draft.care.map((step, stepIndex) => stepIndex === index ? value : step))
  const addCare = () => update('care', [...draft.care, ''])
  const removeCare = (index: number) => update('care', draft.care.filter((_, stepIndex) => stepIndex !== index))
  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const care = draft.care.map((step) => step.trim()).filter(Boolean)
    if (!draft.title.trim() || !draft.category.trim() || !draft.summary.trim() || !care.length) return
    onSave({ ...draft, title: draft.title.trim(), category: draft.category.trim(), summary: draft.summary.trim(), care })
  }
  const readImage = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => update('image', String(reader.result)); reader.readAsDataURL(file); event.target.value = '' }
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="detail-modal admin-form-modal" role="dialog" aria-modal="true" aria-labelledby="knowledge-form-title"><header><div><span className="eyebrow">{article ? 'แก้ไขคำแนะนำ' : 'คำแนะนำใหม่'}</span><h2 id="knowledge-form-title">{article ? `แก้ไข ${article.title}` : 'สร้างคำแนะนำการดูแลเท้า'}</h2><p>เพิ่มขั้นตอนการดูแลได้ตามต้องการ วิดีโอจัดการแยกในเมนู “วิดีโอแนะนำการดูแลเท้า”</p></div><button className="icon-button" type="button" aria-label="ปิด" onClick={onClose}><X size={21} /></button></header><form className="admin-form" onSubmit={submit}><label className="field-label" htmlFor="knowledge-title">ชื่อคำแนะนำ</label><input id="knowledge-title" value={draft.title} onChange={(event) => update('title', event.target.value)} placeholder="เช่น ดูแลเท้าเมื่อผิวแห้ง" /><div className="admin-form-grid"><div><label className="field-label" htmlFor="knowledge-disease">เชื่อมกับภาวะ</label><select id="knowledge-disease" value={draft.diseaseId ?? ''} onChange={(event) => update('diseaseId', event.target.value)}><option value="">ไม่ระบุ</option>{diseaseRecords.map((disease) => <option value={disease.id} key={disease.id}>{disease.id} · {disease.name}</option>)}</select></div><div><label className="field-label" htmlFor="knowledge-severity">ระดับ</label><select id="knowledge-severity" value={draft.severity} onChange={(event) => update('severity', event.target.value as KnowledgeArticle['severity'])}><option>ทุกระดับ</option><option>เล็กน้อย</option><option>ปานกลาง</option><option>รุนแรง</option></select></div></div><div className="admin-form-grid"><div><label className="field-label" htmlFor="knowledge-category">หมวดหมู่</label><input id="knowledge-category" value={draft.category} onChange={(event) => update('category', event.target.value)} /></div><div><label className="field-label" htmlFor="knowledge-status">สถานะ</label><select id="knowledge-status" value={draft.status} onChange={(event) => update('status', event.target.value as KnowledgeArticle['status'])}><option value="draft">ฉบับร่าง</option><option value="published">เผยแพร่แล้ว</option><option value="archived">เก็บถาวร</option></select></div></div><label className="field-label" htmlFor="knowledge-summary">สรุปสั้น</label><textarea id="knowledge-summary" value={draft.summary} onChange={(event) => update('summary', event.target.value)} placeholder="คำอธิบายที่แสดงบนการ์ด" /><div className="care-step-editor"><div className="care-step-heading"><span className="field-label">ขั้นตอนการดูแล</span><button className="button button-secondary button-small" type="button" onClick={addCare}><Plus size={16} />เพิ่มขั้นตอน</button></div>{draft.care.length ? draft.care.map((step, index) => <div className="care-step-row" key={index}><span>{index + 1}</span><input id={`knowledge-care-${index + 1}`} value={step} onChange={(event) => updateCare(index, event.target.value)} placeholder={`ขั้นตอนที่ ${index + 1}`} /><button className="icon-button" type="button" aria-label={`ลบขั้นตอนที่ ${index + 1}`} onClick={() => removeCare(index)}><X size={18} /></button></div>) : <div className="care-step-empty">เพิ่มขั้นตอนการดูแลอย่างน้อย 1 ขั้นตอน</div>}</div><label className="field-label" htmlFor="knowledge-treatment">การรักษา</label><textarea id="knowledge-treatment" value={draft.treatment ?? ''} onChange={(event) => update('treatment', event.target.value)} placeholder="แนวทางการรักษาหรือการส่งต่อ" /><label className="field-label" htmlFor="knowledge-recommendation">คำแนะนำเพิ่มเติม</label><textarea id="knowledge-recommendation" value={draft.recommendation ?? ''} onChange={(event) => update('recommendation', event.target.value)} placeholder="ข้อควรระวังหรือคำแนะนำสำหรับผู้ใช้" /><label className="field-label" htmlFor="knowledge-image">รูปประกอบ</label><input id="knowledge-image" type="file" accept="image/*" onChange={readImage} />{draft.image ? <img className="reference-image-preview" src={draft.image} alt="รูปประกอบคำแนะนำ" /> : <small className="field-helper">เมื่อบันทึก ระบบจะอัปโหลดรูปไปยังพื้นที่จัดเก็บส่วนตัวของ DM Foot Care</small>}<div className="admin-form-actions"><button className="button button-secondary" type="button" onClick={onClose}>ยกเลิก</button><button className="button button-primary" type="submit">บันทึกคำแนะนำ</button></div></form></section></div>
}

function VideoManagement({ videos, setVideos, showToast, adminService }: { videos: CareVideo[]; setVideos: React.Dispatch<React.SetStateAction<CareVideo[]>>; showToast: (text: string) => void; adminService: AdminService }) {
  const [editing, setEditing] = useState<CareVideo | null>(null)
  const [creating, setCreating] = useState(false)
  const publishedCount = videos.filter((video) => (video.status ?? 'published') === 'published').length
  const closeForm = () => { setEditing(null); setCreating(false) }
  const saveVideo = async (draft: Omit<CareVideo, 'id'>) => {
    try {
      const saved = await adminService.saveCareVideo({ ...draft, ...(editing ? { id: editing.id } : {}) })
      setVideos((current) => editing ? current.map((item) => item.id === editing.id ? saved : item) : [saved, ...current])
      showToast(editing ? 'บันทึกวิดีโอแล้ว' : 'เพิ่มวิดีโอแล้ว')
      closeForm()
    } catch (error) {
      showToast(error instanceof Error && error.message ? error.message : 'บันทึกวิดีโอไม่สำเร็จ')
    }
  }
  return <div className="page admin-page"><PageTitle eyebrow="สื่อวิดีโอสำหรับผู้ใช้" title="จัดการวิดีโอแนะนำการดูแลเท้า" description="เพิ่มรูปปกและลิงก์ YouTube ผู้ใช้จะรับชมวิดีโอภายใน DM Foot Care" action={<button className="button button-primary" type="button" onClick={() => { setEditing(null); setCreating(true) }}><Plus size={18} />เพิ่มวิดีโอ</button>} /><div className="admin-stat-grid compact"><AdminStat icon={Video} label="เผยแพร่แล้ว" value={String(publishedCount)} note="วิดีโอพร้อมรับชม" tone="teal" /></div><div className="knowledge-admin-list video-admin-list">{videos.map((video) => { const status = video.status ?? 'published'; return <article key={video.id}>{video.image ? <img className="video-admin-thumb" src={video.image} alt="" /> : <span className="article-icon tone-teal"><Video size={23} /></span>}<div><span className="category-label"><Video size={14} />YouTube</span><h2>{video.title}</h2><p>{video.summary || 'ไม่มีคำอธิบาย'}</p></div><span className={status === 'published' ? 'status-pill success' : status === 'draft' ? 'status-pill attention' : 'status-pill muted'}>{status === 'published' ? 'เผยแพร่แล้ว' : status === 'draft' ? 'ฉบับร่าง' : 'เก็บถาวร'}</span><button className="button button-secondary button-small" type="button" onClick={() => { setCreating(false); setEditing(video) }}>แก้ไข</button></article> })}</div>{creating || editing ? <VideoFormModal video={editing} onClose={closeForm} onSave={saveVideo} /> : null}</div>
}

function VideoFormModal({ video, onClose, onSave }: { video: CareVideo | null; onClose: () => void; onSave: (draft: Omit<CareVideo, 'id'>) => void | Promise<void> }) {
  const [draft, setDraft] = useState<Omit<CareVideo, 'id'>>(() => video ? { title: video.title, summary: video.summary, youtubeUrl: video.youtubeUrl, image: video.image, status: video.status ?? 'published' } : { title: '', summary: '', youtubeUrl: '', image: undefined, status: 'draft' })
  const [error, setError] = useState('')
  const update = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const readImage = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 4_000_000) { setError('รูปปกต้องมีขนาดไม่เกิน 4 MB'); event.target.value = ''; return } const reader = new FileReader(); reader.onload = () => { update('image', String(reader.result)); setError('') }; reader.readAsDataURL(file); event.target.value = '' }
  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    if (!draft.title.trim()) return setError('กรุณาระบุชื่อวิดีโอ')
    if (!getYoutubeVideoId(draft.youtubeUrl)) return setError('กรุณาใส่ลิงก์ YouTube ที่ถูกต้อง')
    void onSave({ ...draft, title: draft.title.trim(), summary: draft.summary.trim(), youtubeUrl: draft.youtubeUrl.trim() })
  }
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="detail-modal admin-form-modal" role="dialog" aria-modal="true" aria-labelledby="video-form-title"><header><div><span className="eyebrow">{video ? 'แก้ไขวิดีโอ' : 'วิดีโอใหม่'}</span><h2 id="video-form-title">{video ? `แก้ไข ${video.title}` : 'เพิ่มวิดีโอแนะนำการดูแลเท้า'}</h2><p>อัปโหลดรูปปกและวางลิงก์ YouTube ระบบจะฝัง Player ให้รับชมในเว็บไซต์โดยตรง</p></div><button className="icon-button" type="button" aria-label="ปิด" onClick={onClose}><X size={21} /></button></header><form className="admin-form" onSubmit={submit}><label className="field-label" htmlFor="video-title">ชื่อวิดีโอ</label><input id="video-title" value={draft.title} onChange={(event) => update('title', event.target.value)} placeholder="เช่น วิธีตรวจเท้าด้วยตนเอง" /><label className="field-label" htmlFor="video-summary">คำอธิบายสั้น <span className="optional-label">ไม่บังคับ</span></label><textarea id="video-summary" value={draft.summary} onChange={(event) => update('summary', event.target.value)} placeholder="อธิบายว่าวิดีโอนี้ช่วยเรื่องอะไร" /><label className="field-label" htmlFor="video-youtube">ลิงก์ YouTube</label><div className="video-url-field"><Video size={20} /><input id="video-youtube" type="url" value={draft.youtubeUrl} onChange={(event) => update('youtubeUrl', event.target.value)} placeholder="https://www.youtube.com/watch?v=..." /></div><small className="field-helper">รองรับ youtube.com, youtu.be, Shorts และ Live และวิดีโอจะเปิดในเว็บ DM Foot Care</small><label className="field-label" htmlFor="video-image">รูปปกวิดีโอ <span className="optional-label">ไม่บังคับ</span></label><input id="video-image" type="file" accept="image/jpeg,image/png,image/webp" onChange={readImage} />{draft.image ? <img className="reference-image-preview video-cover-preview" src={draft.image} alt="ตัวอย่างรูปปกวิดีโอ" /> : <small className="field-helper">หากไม่ใส่รูป ระบบจะแสดงภาพตัวอย่างจาก YouTube ให้ผู้ใช้แทน</small>}<label className="field-label" htmlFor="video-status">สถานะ</label><select id="video-status" value={draft.status} onChange={(event) => update('status', event.target.value as CareVideo['status'])}><option value="draft">ฉบับร่าง</option><option value="published">เผยแพร่แล้ว</option><option value="archived">เก็บถาวร</option></select>{error ? <div className="form-error" role="alert"><AlertTriangle size={18} />{error}</div> : null}<div className="admin-form-actions"><button className="button button-secondary" type="button" onClick={onClose}>ยกเลิก</button><button className="button button-primary" type="submit">บันทึกวิดีโอ</button></div></form></section></div>
}'''
replace_block('src/App.tsx', 'function KnowledgeManagement({ articles, diseaseRecords, setArticles, showToast, adminService }:', 'export default App', admin_content)

# ---------- CSS ----------
css = read('src/accessibility-overrides.css')
for line in [
    ".knowledge-mode-tabs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 0 0 22px; padding: 6px; border: 1px solid var(--line); background: #fff; border-radius: 16px; box-shadow: var(--shadow-sm); }\n",
    ".knowledge-mode-tabs button { min-height: 54px; border: 0; border-radius: 12px; background: transparent; color: var(--muted); font: inherit; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; gap: 9px; cursor: pointer; }\n",
    ".knowledge-mode-tabs button.active { background: var(--blue-soft); color: var(--blue-dark); box-shadow: inset 0 0 0 1px #cfe0ff; }\n",
    "  .knowledge-mode-tabs { grid-template-columns: 1fr 1fr; }\n",
    "  .knowledge-mode-tabs button { padding: 8px; font-size: 14px; line-height: 1.35; }\n",
]:
    css = css.replace(line, '')
css += r'''

/* Dedicated care-video system */
.care-video-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; margin-top: 22px; }
.care-video-card { overflow: hidden; background: #fff; border: 1px solid var(--line); border-radius: 18px; box-shadow: var(--shadow-sm); }
.care-video-cover { position: relative; width: 100%; aspect-ratio: 16 / 9; border: 0; padding: 0; overflow: hidden; display: block; background: #eaf2ff; }
.care-video-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
.video-cover-fallback { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--blue); }
.video-play-mark { position: absolute; left: 50%; top: 50%; width: 58px; height: 58px; transform: translate(-50%, -50%); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; background: rgba(16,35,63,.86); box-shadow: 0 8px 24px rgba(16,35,63,.28); }
.care-video-card-body { padding: 18px; }
.care-video-card-body h2 { margin-top: 10px; font-size: 20px; line-height: 1.35; }
.care-video-card-body p { margin-top: 8px; color: var(--muted); font-size: 16px; line-height: 1.65; }
.care-video-modal { width: min(920px, calc(100vw - 28px)); }
.care-video-player { margin: 4px 0 18px; }
.video-search-tools { margin-bottom: 0; }
.video-admin-thumb { width: 72px; height: 52px; border-radius: 10px; object-fit: cover; border: 1px solid var(--line); }
.video-cover-preview { aspect-ratio: 16 / 9; object-fit: cover; max-height: 260px; }

@media (max-width: 1000px) { .care-video-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 900px) { .mobile-nav { grid-template-columns: repeat(5, minmax(0, 1fr)); } }
@media (max-width: 680px) { .care-video-grid { grid-template-columns: 1fr; gap: 14px; }.care-video-card-body { padding: 15px; }.care-video-card-body h2 { font-size: 19px; }.care-video-modal { width: calc(100vw - 18px); }.mobile-nav .nav-item span { max-width: 72px; font-size: 11px; } }
'''
write('src/accessibility-overrides.css', css)

# ---------- regression contract ----------
test = read('tests/feature_update_contract.test.ts')
test = test.replace("assert.match(app, /มีวิดีโอ/)\n", '')
test = test.replace("assert.match(app, /youtube-nocookie\\.com\\/embed/)\n", '')
test = test.replace("assert.match(app, /<iframe/)\n", '')
test = test.replace("assert.match(app, /knowledge-mode-tabs/)\n", '')
test = test.replace("assert.match(css, /\\.knowledge-mode-tabs/)\n", '')
test = test.replace("assert.match(css, /\\.youtube-embed/)\n", '')
test += "\nassert.match(types, /export interface CareVideo/)\nassert.match(types, /'videos'/)\nassert.match(types, /'admin-videos'/)\nassert.doesNotMatch(types, /KnowledgeArticle[\\s\\S]*youtubeUrl\\?: string/)\nassert.match(app, /วิดีโอแนะนำการดูแลเท้า/)\nassert.match(app, /function CareVideoPage/)\nassert.match(app, /function VideoManagement/)\nassert.match(app, /youtube-nocookie\\.com\\/embed/)\nassert.match(app, /<iframe/)\nassert.match(css, /\\.care-video-grid/)\nassert.match(css, /repeat\\(5/)\nconsole.log('Dedicated care video system contract passed')\n"
write('tests/feature_update_contract.test.ts', test)

print('Applied dedicated care-video system rebuild')
