import fs from 'node:fs'

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before)
  if (first < 0) throw new Error(`Missing codemod target: ${label}`)
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`Codemod target is not unique: ${label}`)
  return source.slice(0, first) + after + source.slice(first + before.length)
}

function replaceCount(source, before, after, expected, label) {
  const pieces = source.split(before)
  const found = pieces.length - 1
  if (found !== expected) throw new Error(`Expected ${expected} matches for ${label}, found ${found}`)
  return pieces.join(after)
}

const appPath = 'src/App.tsx'
let app = fs.readFileSync(appPath, 'utf8')
app = replaceOnce(app,
`  const [patientExaminations, setPatientExaminations] = useState<Examination[]>([])
  const [patientKnowledge, setPatientKnowledge] = useState<KnowledgeArticle[]>([])
  const [patientDiseases, setPatientDiseases] = useState<Disease[]>([])
`,
`  const [patientExaminations, setPatientExaminations] = useState<Examination[]>([])
  const [patientKnowledge, setPatientKnowledge] = useState<KnowledgeArticle[]>([])
  const [patientDiseases, setPatientDiseases] = useState<Disease[]>([])
  const [historyThumbnailsLoaded, setHistoryThumbnailsLoaded] = useState(false)
  const [patientKnowledgeMode, setPatientKnowledgeMode] = useState<'none' | 'featured' | 'full'>('none')
`, 'patient lazy-loading state')

app = replaceOnce(app,
`  const loadPatientExaminations = useCallback(async () => {
    if (!integrations?.repository.listForCurrentUser) return
    try {
      setPatientExaminations(await integrations.repository.listForCurrentUser())
    } catch {
      // Keep the authenticated shell usable; the backend can expose a retry UI later.
    }
  }, [integrations])
`,
`  const loadPatientExaminations = useCallback(async (includeThumbnails = false) => {
    if (!integrations?.repository.listForCurrentUser) return
    try {
      const rows = await integrations.repository.listForCurrentUser(includeThumbnails)
      setPatientExaminations((current) => {
        if (includeThumbnails || !current.length) return rows
        const existingThumbnails = new Map(current.map((exam) => [exam.id, exam.thumbnails]))
        return rows.map((exam) => ({ ...exam, thumbnails: existingThumbnails.get(exam.id) ?? exam.thumbnails }))
      })
      if (includeThumbnails) setHistoryThumbnailsLoaded(true)
    } catch {
      // Keep the authenticated shell usable; navigation remains available for retry.
    }
  }, [integrations])
`, 'lightweight patient history loader')

app = replaceOnce(app,
`  const loadPatientKnowledge = useCallback(async () => {
    if (!integrations?.knowledge) return
    try {
      const content = await integrations.knowledge.listPublished()
      setPatientKnowledge(content.articles)
      setPatientDiseases(content.diseases)
    } catch {
      // Keep the patient shell usable with the last known content if the API is unavailable.
    }
  }, [integrations])
`,
`  const loadPatientKnowledge = useCallback(async (featuredOnly = false) => {
    if (!integrations?.knowledge) return
    try {
      const content = await integrations.knowledge.listPublished(featuredOnly ? { limit: 1, includeDiseaseImages: false } : undefined)
      setPatientKnowledge((current) => featuredOnly && current.length > content.articles.length ? current : content.articles)
      setPatientDiseases((current) => content.diseases.map((disease) => ({
        ...disease,
        referenceImage: disease.referenceImage ?? current.find((item) => item.id === disease.id)?.referenceImage,
      })))
      setPatientKnowledgeMode((current) => featuredOnly && current === 'full' ? 'full' : featuredOnly ? 'featured' : 'full')
    } catch {
      // Keep the patient shell usable with the last known content if the API is unavailable.
    }
  }, [integrations])
`, 'featured knowledge loader')

app = replaceCount(app,
`      if (nextProfile.role === 'user') {
        void loadPatientExaminations()
        void loadPatientKnowledge()
      }
`,
`      if (nextProfile.role === 'user') {
        void loadPatientExaminations(false)
        void loadPatientKnowledge(true)
      }
`, 1, 'restored session patient bootstrap')

app = replaceCount(app,
`    if (nextProfile.role === 'user') {
      void loadPatientExaminations()
      void loadPatientKnowledge()
    }
`,
`    if (nextProfile.role === 'user') {
      void loadPatientExaminations(false)
      void loadPatientKnowledge(true)
    }
`, 1, 'login patient bootstrap')

app = replaceOnce(app,
`    setPatientExaminations([])
    setPatientKnowledge([])
    setPatientDiseases([])
`,
`    setPatientExaminations([])
    setPatientKnowledge([])
    setPatientDiseases([])
    setHistoryThumbnailsLoaded(false)
    setPatientKnowledgeMode('none')
`, 'logout patient cache reset')

app = replaceOnce(app,
`  const goTo = (nextPage: Page) => {
    setPage(nextPage)
    setProfileOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
`,
`  const goTo = (nextPage: Page) => {
    setPage(nextPage)
    setProfileOpen(false)
    if (profile?.role === 'user') {
      if (nextPage === 'history' && !historyThumbnailsLoaded) void loadPatientExaminations(true)
      if (nextPage === 'knowledge' && patientKnowledgeMode !== 'full') void loadPatientKnowledge(false)
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
`, 'navigation-triggered patient loading')
fs.writeFileSync(appPath, app)

const contractsPath = 'src/services/contracts.ts'
let contracts = fs.readFileSync(contractsPath, 'utf8')
contracts = replaceOnce(contracts,
`  listForCurrentUser?(): Promise<Examination[]>`,
`  listForCurrentUser?(includeThumbnails?: boolean): Promise<Examination[]>`, 'history contract')
contracts = replaceOnce(contracts,
`  listPublished(): Promise<{ articles: KnowledgeArticle[]; diseases: Disease[] }>`,
`  listPublished(options?: { limit?: number; includeDiseaseImages?: boolean }): Promise<{ articles: KnowledgeArticle[]; diseases: Disease[] }>`, 'knowledge contract')
fs.writeFileSync(contractsPath, contracts)

const adaptersPath = 'src/services/httpAdapters.ts'
let adapters = fs.readFileSync(adaptersPath, 'utf8')
adapters = replaceOnce(adapters,
`  async listForCurrentUser(): Promise<Examination[]> {
    const response = await this.client.get<Examination[] | { examinations?: Examination[] }>('/v1/examinations')
    return Array.isArray(response) ? response : response.examinations ?? []
  }
`,
`  async listForCurrentUser(includeThumbnails = false): Promise<Examination[]> {
    const path = includeThumbnails ? '/v1/examinations?includeThumbnails=true' : '/v1/examinations'
    const response = await this.client.get<Examination[] | { examinations?: Examination[] }>(path)
    return Array.isArray(response) ? response : response.examinations ?? []
  }
`, 'history HTTP adapter')
adapters = replaceOnce(adapters,
`  async listPublished(): Promise<{ articles: import('../types.ts').KnowledgeArticle[]; diseases: import('../types.ts').Disease[] }> {
    const response = await this.client.get<{ articles?: import('../types.ts').KnowledgeArticle[]; diseases?: import('../types.ts').Disease[] } | import('../types.ts').KnowledgeArticle[]>('/v1/knowledge')
    if (Array.isArray(response)) return { articles: response, diseases: [] }
    return { articles: response.articles ?? [], diseases: normalizeDiseaseList(response.diseases) }
  }
`,
`  async listPublished(options?: { limit?: number; includeDiseaseImages?: boolean }): Promise<{ articles: import('../types.ts').KnowledgeArticle[]; diseases: import('../types.ts').Disease[] }> {
    const query = new URLSearchParams()
    if (options?.limit) query.set('limit', String(options.limit))
    if (options?.includeDiseaseImages === false) query.set('includeDiseaseImages', 'false')
    const path = query.size ? \`/v1/knowledge?\${query}\` : '/v1/knowledge'
    const response = await this.client.get<{ articles?: import('../types.ts').KnowledgeArticle[]; diseases?: import('../types.ts').Disease[] } | import('../types.ts').KnowledgeArticle[]>(path)
    if (Array.isArray(response)) return { articles: response, diseases: [] }
    return { articles: response.articles ?? [], diseases: normalizeDiseaseList(response.diseases) }
  }
`, 'knowledge HTTP adapter')
fs.writeFileSync(adaptersPath, adapters)

console.log('Performance codemod applied successfully')
