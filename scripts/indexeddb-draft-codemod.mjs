import fs from 'node:fs'

function replaceOnce(source, before, after, label) {
  const index = source.indexOf(before)
  if (index < 0) throw new Error(`Missing codemod target: ${label}`)
  if (source.indexOf(before, index + before.length) >= 0) throw new Error(`Codemod target is not unique: ${label}`)
  return source.slice(0, index) + after + source.slice(index + before.length)
}

const path = 'src/App.tsx'
let source = fs.readFileSync(path, 'utf8')

source = replaceOnce(source,
  "import { clearExaminationDraft, readExaminationDraft, saveExaminationDraft } from './services/draftStorage'",
  "import { clearExaminationDraft, readExaminationDraft, saveExaminationDraft, type ExaminationDraftSnapshot } from './services/draftStorage'",
  'draft storage import')

source = replaceOnce(source,
`function PatientPages({ profile, page, setPage, examStage, setExamStage, examinations: patientExaminations, knowledgeArticles: patientKnowledge, diseaseRecords: patientDiseases, integrations, onExamCompleted, showToast }: { profile: Profile; page: Page; setPage: (page: Page) => void; examStage: ExamStage; setExamStage: (stage: ExamStage) => void; examinations: Examination[]; knowledgeArticles: KnowledgeArticle[]; diseaseRecords: Disease[]; integrations: RuntimeIntegrations; onExamCompleted: (exam: Examination) => void; showToast: (text: string) => void }) {
  if (page === 'exam') return <ExaminationFlow profile={profile} diseaseRecords={patientDiseases} integrations={integrations} stage={examStage} setStage={setExamStage} onHome={() => setPage('home')} onCompleted={onExamCompleted} />
  if (page === 'history') return <HistoryPage examinations={patientExaminations} diseaseRecords={patientDiseases} />
  if (page === 'knowledge') return <KnowledgePage articles={patientKnowledge} diseaseRecords={patientDiseases} showToast={showToast} knowledgeService={integrations.knowledge} />
  return <PatientHome profile={profile} examinations={patientExaminations} articles={patientKnowledge} onStart={() => { setExamStage('intro'); setPage('exam') }} onResume={() => { const draft = readExaminationDraft(); if (draft) { setExamStage(draft.stage); setPage('exam') } }} onHistory={() => setPage('history')} onKnowledge={() => setPage('knowledge')} />
}

function PatientHome({ profile, examinations: patientExaminations, articles, onStart, onResume, onHistory, onKnowledge }: { profile: Profile; examinations: Examination[]; articles: KnowledgeArticle[]; onStart: () => void; onResume: () => void; onHistory: () => void; onKnowledge: () => void }) {
  const latest = patientExaminations[0]
  const hasDraft = Boolean(readExaminationDraft())
`,
`function PatientPages({ profile, page, setPage, examStage, setExamStage, examinations: patientExaminations, knowledgeArticles: patientKnowledge, diseaseRecords: patientDiseases, integrations, onExamCompleted, showToast }: { profile: Profile; page: Page; setPage: (page: Page) => void; examStage: ExamStage; setExamStage: (stage: ExamStage) => void; examinations: Examination[]; knowledgeArticles: KnowledgeArticle[]; diseaseRecords: Disease[]; integrations: RuntimeIntegrations; onExamCompleted: (exam: Examination) => void; showToast: (text: string) => void }) {
  const [hasDraft, setHasDraft] = useState(false)
  useEffect(() => {
    let cancelled = false
    void readExaminationDraft().then((draft) => {
      if (!cancelled) setHasDraft(Boolean(draft))
    }).catch(() => {
      if (!cancelled) setHasDraft(false)
    })
    return () => { cancelled = true }
  }, [page])

  if (page === 'exam') return <ExaminationFlow profile={profile} diseaseRecords={patientDiseases} integrations={integrations} stage={examStage} setStage={setExamStage} onHome={() => setPage('home')} onCompleted={onExamCompleted} />
  if (page === 'history') return <HistoryPage examinations={patientExaminations} diseaseRecords={patientDiseases} />
  if (page === 'knowledge') return <KnowledgePage articles={patientKnowledge} diseaseRecords={patientDiseases} showToast={showToast} knowledgeService={integrations.knowledge} />
  return <PatientHome profile={profile} examinations={patientExaminations} articles={patientKnowledge} hasDraft={hasDraft} onStart={() => { setExamStage('intro'); setPage('exam') }} onResume={() => { void readExaminationDraft().then((draft) => { if (draft) { setExamStage(draft.stage); setPage('exam') } }) }} onHistory={() => setPage('history')} onKnowledge={() => setPage('knowledge')} />
}

function PatientHome({ profile, examinations: patientExaminations, articles, hasDraft, onStart, onResume, onHistory, onKnowledge }: { profile: Profile; examinations: Examination[]; articles: KnowledgeArticle[]; hasDraft: boolean; onStart: () => void; onResume: () => void; onHistory: () => void; onKnowledge: () => void }) {
  const latest = patientExaminations[0]
`,
  'PatientPages async draft state')

source = replaceOnce(source,
`function ExaminationFlow({ profile, diseaseRecords, integrations, stage, setStage, onHome, onCompleted }: { profile: Profile; diseaseRecords: Disease[]; integrations: RuntimeIntegrations; stage: ExamStage; setStage: (stage: ExamStage) => void; onHome: () => void; onCompleted: (exam: Examination) => void }) {
  const [draftHint, setDraftHint] = useState(() => readExaminationDraft())
  const [step, setStep] = useState(() => draftHint?.step ?? 0)
  const [photos, setPhotos] = useState<Partial<Record<FootPosition, string>>>(() => draftHint?.photos ?? {})
`,
`function ExaminationFlow({ profile, diseaseRecords, integrations, stage, setStage, onHome, onCompleted }: { profile: Profile; diseaseRecords: Disease[]; integrations: RuntimeIntegrations; stage: ExamStage; setStage: (stage: ExamStage) => void; onHome: () => void; onCompleted: (exam: Examination) => void }) {
  const [draftHint, setDraftHint] = useState<ExaminationDraftSnapshot | null>(null)
  const [draftLoaded, setDraftLoaded] = useState(false)
  const [step, setStep] = useState(0)
  const [photos, setPhotos] = useState<Partial<Record<FootPosition, string>>>({})
`, 'ExaminationFlow draft initial state')

source = replaceOnce(source,
`  const [analysisAttempt, setAnalysisAttempt] = useState(0)
  const [finalizeError, setFinalizeError] = useState('')

  const ensureExaminationDraft = async (): Promise<boolean> => {
`,
`  const [analysisAttempt, setAnalysisAttempt] = useState(0)
  const [finalizeError, setFinalizeError] = useState('')

  useEffect(() => {
    let cancelled = false
    void readExaminationDraft().then((draft) => {
      if (cancelled) return
      setDraftHint(draft)
      if (draft) {
        setStep(draft.step)
        setPhotos(draft.photos)
      }
    }).catch(() => {
      if (!cancelled) setDraftHint(null)
    }).finally(() => {
      if (!cancelled) setDraftLoaded(true)
    })
    return () => { cancelled = true }
  }, [])

  const ensureExaminationDraft = async (): Promise<boolean> => {
`, 'ExaminationFlow async draft restore effect')

source = replaceOnce(source,
`  useEffect(() => {
    if (stage === 'capture' || stage === 'review') saveExaminationDraft({ stage, step, photos })
    if (stage === 'summary') clearExaminationDraft()
  }, [stage, step, photos])
`,
`  useEffect(() => {
    if (!draftLoaded) return
    if (stage === 'capture' || stage === 'review') void saveExaminationDraft({ stage, step, photos })
    if (stage === 'summary') void clearExaminationDraft()
  }, [draftLoaded, stage, step, photos])
`, 'async draft persistence effect')

source = replaceOnce(source,
`  const reset = () => {
    clearExaminationDraft(); setDraftHint(null); setStep(0); setPhotos({}); setThumbnails({}); setCompletedExam(null); setAiFindings([]); setConfirmedFindings([]); setAnalysisError(''); setFinalizeError(''); setAnalysisAttempt(0); setIsFinalizing(false); thumbnailJobRef.current = null; draftJobRef.current = null; examinationIdRef.current = ''; archiveRef.current = integrations.archive; repositoryRef.current = integrations.repository; thumbnailServiceRef.current = integrations.thumbnails; setStage('intro')
  }

  if (stage === 'intro') return <ExamIntro hasDraft={Boolean(draftHint)} onResume={() => { if (draftHint) { setStep(draftHint.step); setPhotos(draftHint.photos); setStage(draftHint.stage) } }} onStart={() => { clearExaminationDraft(); setDraftHint(null); setStep(0); setPhotos({}); setStage('capture') }} onBack={onHome} />
`,
`  const reset = () => {
    void clearExaminationDraft(); setDraftHint(null); setStep(0); setPhotos({}); setThumbnails({}); setCompletedExam(null); setAiFindings([]); setConfirmedFindings([]); setAnalysisError(''); setFinalizeError(''); setAnalysisAttempt(0); setIsFinalizing(false); thumbnailJobRef.current = null; draftJobRef.current = null; examinationIdRef.current = ''; archiveRef.current = integrations.archive; repositoryRef.current = integrations.repository; thumbnailServiceRef.current = integrations.thumbnails; setStage('intro')
  }

  if (!draftLoaded) return <main className="app-boot" aria-live="polite"><div className="boot-card"><BrandMark /><div className="boot-copy"><strong>DM Foot Care</strong><span>กำลังเปิดข้อมูลการตรวจ…</span></div><div className="boot-progress"><span /></div></div></main>
  if (stage === 'intro') return <ExamIntro hasDraft={Boolean(draftHint)} onResume={() => { if (draftHint) { setStep(draftHint.step); setPhotos(draftHint.photos); setStage(draftHint.stage) } }} onStart={() => { void clearExaminationDraft(); setDraftHint(null); setStep(0); setPhotos({}); setStage('capture') }} onBack={onHome} />
`, 'draft reset/loading/intro')

fs.writeFileSync(path, source)
console.log('IndexedDB draft codemod applied')
