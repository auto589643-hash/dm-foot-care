from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding='utf-8')


def replace_once(path: str, old: str, new: str) -> None:
    source = read(path)
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected one match, found {count}: {old[:100]!r}')
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


app_block = r'''function getYoutubeEmbedUrl(value?: string): string | null {
  if (!value) return null
  try {
    const parsed = new URL(value)
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
    let videoId = ''
    if (host === 'youtu.be') {
      videoId = parsed.pathname.split('/').filter(Boolean)[0] ?? ''
    } else if (host === 'youtube.com' || host === 'm.youtube.com') {
      videoId = parsed.searchParams.get('v') ?? ''
      if (!videoId) {
        const segments = parsed.pathname.split('/').filter(Boolean)
        if (['embed', 'shorts', 'live'].includes(segments[0] ?? '')) videoId = segments[1] ?? ''
      }
    }
    if (!/^[A-Za-z0-9_-]{6,32}$/.test(videoId)) return null
    return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?rel=0&playsinline=1`
  } catch {
    return null
  }
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
  return <div className="page knowledge-page"><PageTitle eyebrow="ความรู้สำหรับการดูแล" title="คำแนะนำการดูแลเท้า" description="คำแนะนำที่อ่านง่าย พร้อมวิดีโอประกอบในบางหัวข้อ" /><div className="knowledge-tools"><label className="search-field"><Search size={20} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหา เช่น ผิวแห้ง หนังด้าน" aria-label="ค้นหาคำแนะนำการดูแลเท้า" /></label><div className="category-chips" aria-label="กรองตามหมวดหมู่">{categories.map((item) => <button className={category === item ? 'active' : ''} type="button" key={item} onClick={() => setCategory(item)}>{item}</button>)}</div><div className="knowledge-filter-row"><label><span>ภาวะ</span><select aria-label="กรองตามภาวะ" value={diseaseFilter} onChange={(event) => setDiseaseFilter(event.target.value)}>{diseaseOptions.map((id) => <option value={id} key={id}>{id === 'ทั้งหมด' ? id : `${id} · ${diseaseRecords.find((disease) => disease.id === id)?.name ?? id}`}</option>)}</select></label><label><span>ระดับความรุนแรง</span><select aria-label="กรองตามระดับความรุนแรง" value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)}>{severityOptions.map((severity) => <option value={severity} key={severity}>{severity}</option>)}</select></label></div></div>{filtered.length ? <div className="article-grid">{filtered.map((article, index) => <article className={`article-card tone-${article.tone}`} key={article.id}><div className="article-visual">{article.image ? <img src={article.image} alt="" /> : <HeartPulse size={30} />}<span>{index + 1}</span>{article.youtubeUrl ? <i className="video-badge"><Video size={14} />มีวิดีโอ</i> : null}</div><div className="article-body"><div><span className="category-label">{article.category}</span><span>{article.severity} · {article.readTime}</span></div><h2>{article.title}</h2><p>{article.summary}</p><button className="card-link" type="button" onClick={() => setSelected(article)}>ดูคำแนะนำ <ChevronRight size={18} /></button></div></article>)}</div> : <div className="empty-state"><Search size={32} /><h2>ยังไม่พบหัวข้อนี้</h2><p>ลองค้นด้วยคำที่สั้นลง หรือเลือก “ทั้งหมด” เพื่อดูคำแนะนำที่มี</p><button className="button button-secondary" type="button" onClick={() => { setQuery(''); setCategory('ทั้งหมด'); setDiseaseFilter('ทั้งหมด'); setSeverityFilter('ทั้งหมด') }}>ดูคำแนะนำทั้งหมด</button></div>}{selected ? <ArticleModal article={selected} saved={savedIds.has(selected.id)} saving={savingId === selected.id} onClose={() => setSelected(null)} onSaved={() => void toggleSaved(selected)} /> : null}</div>
}

function ArticleModal({ article, saved, saving, onClose, onSaved }: { article: KnowledgeArticle; saved: boolean; saving: boolean; onClose: () => void; onSaved: () => void }) {
  const embedUrl = getYoutubeEmbedUrl(article.youtubeUrl)
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><article className="detail-modal article-modal" role="dialog" aria-modal="true" aria-labelledby="article-title"><header><div><span className="eyebrow">{article.category} · {article.severity} · {article.readTime}</span><h2 id="article-title">{article.title}</h2></div><button className="icon-button" type="button" aria-label="ปิด" onClick={onClose}><X size={21} /></button></header><div className={`article-hero tone-${article.tone}`}>{article.image ? <img src={article.image} alt="" /> : <HeartPulse size={44} />}</div><p className="article-intro">{article.summary}</p>{embedUrl ? <section className="inline-video-section" aria-label="วิดีโอประกอบคำแนะนำ"><div className="inline-video-heading"><span><Video size={19} /></span><div><strong>วิดีโอประกอบคำแนะนำ</strong><small>รับชม YouTube ได้โดยไม่ออกจาก DM Foot Care</small></div></div><div className="youtube-embed"><iframe src={embedUrl} title={`วิดีโอ ${article.title}`} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /></div></section> : null}{article.care.length ? <><h3>ทำตามขั้นตอนนี้</h3><ol className="care-steps">{article.care.map((step, index) => <li key={`${index}-${step}`}><span>{index + 1}</span>{step}</li>)}</ol></> : null}{article.treatment ? <section className="article-guidance"><h3>การรักษา</h3><p>{article.treatment}</p></section> : null}{article.recommendation ? <section className="article-guidance"><h3>คำแนะนำเพิ่มเติม</h3><p>{article.recommendation}</p></section> : null}<div className="review-explainer"><Info size={19} /><p>คำแนะนำทั่วไปอาจไม่เหมาะกับทุกคน หากมีอาการผิดปกติควรปรึกษาแพทย์</p></div><button className={saving ? 'button button-secondary action-pending' : 'button button-secondary'} type="button" disabled={saving} onClick={onSaved}>{saving ? 'กำลังบันทึก…' : saved ? 'นำออกจากรายการที่บันทึก' : 'บันทึกไว้อ่านภายหลัง'}</button></article></div>
}'''

replace_block('src/App.tsx', 'function KnowledgePage({ articles, diseaseRecords, showToast, knowledgeService }:', 'function DoctorPages({ page, setPage, showToast, adminService, auditLogger }:', app_block)

css = read('src/accessibility-overrides.css')
for line in [
    ".knowledge-mode-tabs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 0 0 22px; padding: 6px; border: 1px solid var(--line); background: #fff; border-radius: 16px; box-shadow: var(--shadow-sm); }\n",
    ".knowledge-mode-tabs button { min-height: 54px; border: 0; border-radius: 12px; background: transparent; color: var(--muted); font: inherit; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; gap: 9px; cursor: pointer; }\n",
    ".knowledge-mode-tabs button.active { background: var(--blue-soft); color: var(--blue-dark); box-shadow: inset 0 0 0 1px #cfe0ff; }\n",
    ".video-open-button { margin: 18px 0 10px; text-decoration: none; }\n",
    "  .knowledge-mode-tabs { grid-template-columns: 1fr 1fr; }\n",
    "  .knowledge-mode-tabs button { padding: 8px; font-size: 14px; line-height: 1.35; }\n",
]:
    if line not in css:
        raise RuntimeError(f'CSS expected line not found: {line.strip()}')
    css = css.replace(line, '', 1)
anchor = ".article-visual { position: relative; }\n"
inline_css = """.article-visual { position: relative; }\n.inline-video-section { margin: 20px 0 24px; padding: 14px; border: 1px solid var(--line); border-radius: 16px; background: #f8fbff; }\n.inline-video-heading { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }\n.inline-video-heading > span { width: 38px; height: 38px; border-radius: 11px; display: inline-flex; align-items: center; justify-content: center; background: var(--blue-soft); color: var(--blue); flex: 0 0 auto; }\n.inline-video-heading div { display: grid; gap: 1px; }\n.inline-video-heading strong { color: var(--ink); font-size: 16px; }\n.inline-video-heading small { color: var(--muted); font-size: 13px; }\n.youtube-embed { position: relative; width: 100%; aspect-ratio: 16 / 9; overflow: hidden; border-radius: 12px; background: #0b1220; }\n.youtube-embed iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }\n"""
if css.count(anchor) != 1:
    raise RuntimeError('CSS article-visual anchor mismatch')
css = css.replace(anchor, inline_css, 1)
write('src/accessibility-overrides.css', css)

test = read('tests/feature_update_contract.test.ts')
test = test.replace("assert.match(app, /วิดีโอแนะนำ/)\n", "assert.match(app, /มีวิดีโอ/)\nassert.match(app, /youtube-nocookie\\.com\\/embed/)\nassert.match(app, /<iframe/)\nassert.doesNotMatch(app, /knowledge-mode-tabs/)\nassert.doesNotMatch(app, /เปิดวิดีโอ YouTube/)\n")
test = test.replace("assert.match(css, /\\.knowledge-mode-tabs/)\n", "assert.match(css, /\\.youtube-embed/)\nassert.match(css, /\\.inline-video-section/)\nassert.doesNotMatch(css, /\\.knowledge-mode-tabs/)\n")
write('tests/feature_update_contract.test.ts', test)

print('Applied inline YouTube recommendation update')
