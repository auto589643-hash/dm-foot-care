import fs from 'node:fs'

const path = 'src/App.tsx'
let source = fs.readFileSync(path, 'utf8')

function replaceOnce(label, search, replacement) {
  const index = source.indexOf(search)
  if (index < 0) throw new Error(`Missing target: ${label}`)
  source = source.slice(0, index) + replacement + source.slice(index + search.length)
}

replaceOnce(
  'begin analysis prestarts draft',
`  const beginAnalysis = () => {
    setAnalysisError('')
    setProcessStep(0)
    setStage('processing')
  }`,
`  const beginAnalysis = () => {
    setAnalysisError('')
    setProcessStep(0)
    setStage('processing')
    void ensureExaminationDraft()
  }`,
)

replaceOnce(
  'analysis effect waits for in-flight draft without function dependency',
  "    void Promise.all([ensureExaminationDraft(), photosToBlobs(capturedPhotos)]).then(([draftReady, images]) => {",
  "    const draftReadyJob = examinationIdRef.current ? Promise.resolve(true) : (draftJobRef.current ?? Promise.resolve(false))\n    void Promise.all([draftReadyJob, photosToBlobs(capturedPhotos)]).then(([draftReady, images]) => {",
)

replaceOnce(
  'lint-safe progress drift',
`  const targetProgress = Math.min(92, 18 + current * 25)
  const [analysisProgress, setAnalysisProgress] = useState(targetProgress)
  useEffect(() => {
    setAnalysisProgress((value) => Math.max(value, targetProgress))
    if (error || !online) return
    const timer = window.setInterval(() => {
      setAnalysisProgress((value) => Math.min(94, value + (value < 70 ? 3 : value < 88 ? 2 : 1)))
    }, 480)
    return () => window.clearInterval(timer)
  }, [error, online, targetProgress])`,
`  const targetProgress = Math.min(92, 18 + current * 25)
  const [driftProgress, setDriftProgress] = useState(18)
  const analysisProgress = Math.max(targetProgress, driftProgress)
  useEffect(() => {
    if (error || !online) return
    const timer = window.setInterval(() => {
      setDriftProgress((value) => {
        const currentProgress = Math.max(value, targetProgress)
        return Math.min(94, currentProgress + (currentProgress < 70 ? 3 : currentProgress < 88 ? 2 : 1))
      })
    }, 480)
    return () => window.clearInterval(timer)
  }, [error, online, targetProgress])`,
)

replaceOnce(
  'reset progress component per analysis attempt',
  "if (stage === 'processing') return <ProcessingScreen current={processStep} error={analysisError}",
  "if (stage === 'processing') return <ProcessingScreen key={analysisAttempt} current={processStep} error={analysisError}",
)

fs.writeFileSync(path, source)
console.log('Applied UX lint fixes')
