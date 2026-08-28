from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding='utf-8')


def replace_block(path: str, start_marker: str, end_marker: str, new_block: str) -> None:
    source = read(path)
    start = source.find(start_marker)
    if start < 0:
        raise RuntimeError(f'{path}: missing start marker {start_marker!r}')
    end = source.find(end_marker, start + len(start_marker))
    if end < 0:
        raise RuntimeError(f'{path}: missing end marker {end_marker!r}')
    write(path, source[:start] + new_block.rstrip() + '\n\n' + source[end:])


knowledge_block = r'''function KnowledgePage({ articles, diseaseRecords, showToast, knowledgeService }: { articles: KnowledgeArticle[]; diseaseRecords: Disease[]; showToast: (text: string) => void; knowledgeService: KnowledgeLibraryService }) {
  const [mode, setMode] = useState<'article' | 'video'>('article')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('ทั้งหมด')
  const [diseaseFilter, setDiseaseFilter] = useState('ทั้งหมด')
  const [severityFilter, setSeverityFilter] = useState('ทั้งหมด')
  const [selected, setSelected] = useState<KnowledgeArticle | null>(null)
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set())
  const [savingId, setSavingId] = useState<string | null>(null)
  useEffect(() => { let cancelled = false; void knowledgeService.listSavedArticleIds().then((ids) => { if (!cancelled) setSavedIds(new Set(ids)) }).catch(() => { if (!cancelled) showToast('โหลดรายการที่บันทึกไว้ไม่สำเร็จ') }); return () => { cancelled = true } }, [knowledgeService, showToast])
  const modeArticles = useMemo(() => articles.filter((article) => mode === 'video' ? Boolean(article.youtubeUrl) : !article.youtubeUrl), [articles, mode])
  const categories = ['ทั้งหมด', ...new Set(modeArticles.map((article) => article.category))]
  const diseaseOptions = ['ทั้งหมด', ...diseaseRecords.map((disease) => disease.id)]
  const severityOptions = ['ทั้งหมด', 'ทุกระดับ', 'เล็กน้อย', 'ปานกลาง', 'รุนแรง'] as const
  const filtered = useMemo(() => modeArticles.filter((article) => (category === 'ทั้งหมด' || article.category === category) && (diseaseFilter === 'ทั้งหมด' || article.diseaseId === diseaseFilter) && (severityFilter === 'ทั้งหมด' || article.severity === severityFilter) && `${article.title} ${article.summary} ${article.diseaseId ?? ''}`.toLowerCase().includes(query.toLowerCase())), [modeArticles, query, category, diseaseFilter, severityFilter])
  const changeMode = (nextMode: 'article' | 'video') => { setMode(nextMode); setCategory('ทั้งหมด'); setQuery(''); setSelected(null) }
  const toggleSaved = async (article: KnowledgeArticle) => {
    const wasSaved = savedIds.has(article.id); const nextSaved = !wasSaved
    setSavedIds((current) => { const next = new Set(current); if (nextSaved) next.add(article.id); else next.delete(article.id); return next })
    setSavingId(article.id)
    try { await knowledgeService.setSaved(article.id, nextSaved); showToast(nextSaved ? 'บันทึกไว้อ่านภายหลังแล้ว' : 'นำออกจากรายการที่บันทึกแล้ว') }
    catch { setSavedIds((current) => { const next = new Set(current); if (wasSaved) next.add(article.id); else next.delete(article.id); return next }); showToast('บันทึกรายการไม่สำเร็จ ระบบคืนสถานะเดิมแล้ว') }
    finally { setSavingId(null) }
  }
  return <div className="page knowledge-page"><PageTitle eyebrow="ความรู้สำหรับการดูแล" title="คำแนะนำการดูแลเท้า" description="คำแนะนำและวิดีโอที่อ่านง่ายสำหรับการดูแลเท้าอย่างต่อเนื่อง" /><div className="knowledge-mode-tabs" role="tablist" aria-label="รูปแบบคำแนะนำ"><button role="tab" aria-selected={mode === 'article'} className={mode === 'article' ? 'active' : ''} type="button" onClick={() => changeMode('article')}><BookOpen size={21} />คำแนะนำการดูแลเท้า</button><button role="tab" aria-selected={mode === 'video'} className={mode === 'video' ? 'active' : ''} type="button" onClick={() => changeMode('video')}><Video size={21} />วิดีโอแนะนำ</button></div><div className="knowledge-tools"><label className="search-field"><Search size={20} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={mode === 'video' ? 'ค้นหาวิดีโอแนะนำ' : 'ค้นหา เช่น ผิวแห้ง หนังด้าน'} aria-label="ค้นหาคำแนะนำการดูแลเท้า" /></label><div className="category-chips" aria-label="กรองตามหมวดหมู่">{categories.map((item) => <button className={category === item ? 'active' : ''} type="button" key={item} onClick={() => setCategory(item)}>{item}</button>)}</div><div className="knowledge-filter-row"><label><span>ภาวะ</span><select aria-label="กรองตามภาวะ" value={diseaseFilter} onChange={(event) => setDiseaseFilter(event.target.value)}>{diseaseOptions.map((id) => <option value={id} key={id}>{id === 'ทั้งหมด' ? id : `${id} · ${diseaseRecords.find((disease) => disease.id === id)?.name ?? id}`}</option>)}</select></label><label><span>ระดับความรุนแรง</span><select aria-label="กรองตามระดับความรุนแรง" value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)}>{severityOptions.map((severity) => <option value={severity} key={severity}>{severity}</option>)}</select></label></div></div>{filtered.length ? <div className="article-grid">{filtered.map((article, index) => <article className={`article-card tone-${article.tone}`} key={article.id}><div className="article-visual">{article.image ? <img src={article.image} alt="" /> : article.youtubeUrl ? <Video size={34} /> : <HeartPulse size={30} />}<span>{index + 1}</span>{article.youtubeUrl ? <i className="video-badge"><Video size={14} />มีวิดีโอ</i> : null}</div><div className="article-body"><div><span className="category-label">{article.category}</span><span>{article.severity} · {article.readTime}</span></div><h2>{article.title}</h2><p>{article.summary}</p><button className="card-link" type="button" onClick={() => setSelected(article)}>{article.youtubeUrl ? 'ดูวิดีโอและคำแนะนำ' : 'อ่านคำแนะนำ'} <ChevronRight size={18} /></button></div></article>)}</div> : <div className="empty-state">{mode === 'video' ? <Video size={32} /> : <Search size={32} />}<h2>{mode === 'video' ? 'ยังไม่มีวิดีโอแนะนำ' : 'ยังไม่พบหัวข้อนี้'}</h2><p>{mode === 'video' ? 'เมื่อผู้ดูแลเพิ่มลิงก์ YouTube วิดีโอจะแสดงในส่วนนี้' : 'ลองค้นด้วยคำที่สั้นลง หรือเลือก “ทั้งหมด” เพื่อดูคำแนะนำที่มี'}</p>{mode === 'article' ? <button className="button button-secondary" type="button" onClick={() => { setQuery(''); setCategory('ทั้งหมด'); setDiseaseFilter('ทั้งหมด'); setSeverityFilter('ทั้งหมด') }}>ดูคำแนะนำทั้งหมด</button> : null}</div>}{selected ? <ArticleModal article={selected} saved={savedIds.has(selected.id)} saving={savingId === selected.id} onClose={() => setSelected(null)} onSaved={() => void toggleSaved(selected)} /> : null}</div>
}'''

replace_block('src/App.tsx', 'function KnowledgePage({ articles, diseaseRecords, showToast, knowledgeService }:', 'function ArticleModal({ article, saved, saving, onClose, onSaved }:', knowledge_block)

css = read('src/accessibility-overrides.css')
anchor = ".registration-success { max-width: 520px; }\n\n"
tabs_css = """.registration-success { max-width: 520px; }\n\n.knowledge-mode-tabs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 0 0 22px; padding: 6px; border: 1px solid var(--line); background: #fff; border-radius: 16px; box-shadow: var(--shadow-sm); }\n.knowledge-mode-tabs button { min-height: 54px; border: 0; border-radius: 12px; background: transparent; color: var(--muted); font: inherit; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; gap: 9px; cursor: pointer; }\n.knowledge-mode-tabs button.active { background: var(--blue-soft); color: var(--blue-dark); box-shadow: inset 0 0 0 1px #cfe0ff; }\n\n"""
if css.count(anchor) != 1:
    raise RuntimeError('CSS registration-success anchor mismatch')
css = css.replace(anchor, tabs_css, 1)
mobile_anchor = "  .page-title p, .page-lead, .article-card p, .knowledge-callout p { font-size: 16px; }\n"
mobile_tabs = mobile_anchor + "  .knowledge-mode-tabs { grid-template-columns: 1fr 1fr; }\n  .knowledge-mode-tabs button { padding: 8px; font-size: 14px; line-height: 1.35; }\n"
if css.count(mobile_anchor) != 1:
    raise RuntimeError('CSS mobile anchor mismatch')
css = css.replace(mobile_anchor, mobile_tabs, 1)
write('src/accessibility-overrides.css', css)

test = read('tests/feature_update_contract.test.ts')
if "assert.doesNotMatch(app, /knowledge-mode-tabs/)" not in test:
    raise RuntimeError('Expected inline-video contract assertion not found')
test = test.replace("assert.doesNotMatch(app, /knowledge-mode-tabs/)\n", "assert.match(app, /knowledge-mode-tabs/)\nassert.match(app, /วิดีโอแนะนำ/)\nassert.match(app, /มีวิดีโอ/)\n")
if "assert.doesNotMatch(css, /\\.knowledge-mode-tabs/)" not in test:
    raise RuntimeError('Expected inline-video CSS contract assertion not found')
test = test.replace("assert.doesNotMatch(css, /\\.knowledge-mode-tabs/)\n", "assert.match(css, /\\.knowledge-mode-tabs/)\n")
write('tests/feature_update_contract.test.ts', test)

print('Restored split knowledge/video tabs while keeping inline YouTube playback')
