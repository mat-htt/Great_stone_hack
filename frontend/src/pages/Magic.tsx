import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useNavigate, useParams } from 'react-router-dom'
import { BookOpen, Clock, Copy, Droplets, Moon, Shuffle, Sparkles } from 'lucide-react'
import { api, media, type Photo, type Project } from '../api'
import { Cat, Robot } from '../components/Mascots'
import { aspectOf, Book3D, PageView } from '../components/ui'
import { errorText, useApp } from '../store'

interface Rej { id: string; reason: string; label: string }

const REASON_ICON: Record<string, any> = { duplicate: Copy, blurry: Droplets, dark: Moon, limit: Clock }

export default function Magic() {
  const { id } = useParams()
  const nav = useNavigate()
  const { toast } = useApp()
  const [project, setProject] = useState<Project | null>(null)
  const [rejected, setRejected] = useState<Rej[]>([])
  const [phase, setPhase] = useState<'scan' | 'sort' | 'book'>('scan')
  const [t0] = useState(() => performance.now())
  const [ms, setMs] = useState(0)

  useEffect(() => {
    const start = performance.now()
    api<Project & { curation: { rejected: Rej[] } }>(`/api/projects/${id}/relayout`, { method: 'POST', json: { mode: 'curate' } })
      .then((p) => { setProject(p); setRejected(p.curation.rejected); setMs(Math.round(performance.now() - start)) })
      .catch((e) => { toast({ title: errorText(e), kind: 'bad' }); nav(`/editor/${id}`) })
  }, [id])

  useEffect(() => {
    if (!project) return
    const a = setTimeout(() => setPhase('sort'), 1300)
    const b = setTimeout(() => setPhase('book'), 3300)
    return () => { clearTimeout(a); clearTimeout(b) }
  }, [project])

  const photos = useMemo(() => Object.fromEntries((project?.photos || []).map((p) => [p.id, p])), [project]) as Record<string, Photo>
  const rejIds = new Set(rejected.map((r) => r.id))
  const used = project ? project.layout.pages.flatMap((p) => p.slots).filter((s) => s.photo_id).length : 0
  const cover = project?.layout.cover?.photo_id
  const aspect = aspectOf(project?.product, project?.options.size)
  const counts = rejected.reduce<Record<string, number>>((a, r) => ({ ...a, [r.reason]: (a[r.reason] || 0) + 1 }), {})
  const savedMin = 30 + 40 + Math.round((project?.photos.length || 0) * 0.6)

  const shuffle = async () => {
    const p = await api<Project & { curation: any }>(`/api/projects/${id}/relayout`, { method: 'POST', json: { mode: 'shuffle' } })
    setProject(p)
    toast({ title: 'Новая раскладка готова', mascot: 'cat' })
  }

  return (
    <div className="studio">
      <div className="phone" style={{ background: 'transparent' }}>
        <main className="page no-tab" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 24px)' }}>
          <AnimatePresence mode="wait">
            {phase !== 'book' ? (
              <motion.div key="work" exit={{ opacity: 0, scale: 0.96 }} className="stack" style={{ gap: 18 }}>
                <div className="row">
                  <div className="float"><Cat size={64} mood="think" /></div>
                  <div>
                    <div className="eyebrow">Кот-куратор</div>
                    <div className="h2" style={{ color: '#fff' }}>{!project ? 'Изучаю ваши фото…' : phase === 'scan' ? 'Ищу лучшие кадры…' : 'Убираю лишнее и раскладываю…'}</div>
                  </div>
                </div>
                <div className="scanbox" style={{ background: 'var(--night-2)', padding: 6 }}>
                  <div className="grid3" style={{ gridTemplateColumns: 'repeat(5,1fr)' }}>
                    {(project?.photos || Array.from({ length: 20 }).map((_, i) => ({ id: `s${i}` } as Photo))).slice(0, 40).map((p, i) => {
                      const r = rejected.find((x) => x.id === p.id)
                      const Icon = r ? REASON_ICON[r.reason] : null
                      return (
                        <motion.div key={p.id} className="tile" style={{ borderRadius: 6 }}
                          initial={{ opacity: 0, scale: 0.6 }}
                          animate={phase === 'sort' && r ? { opacity: 0.25, scale: 0.7, rotate: i % 2 ? 12 : -12, y: 14 } : { opacity: 1, scale: 1 }}
                          transition={{ delay: phase === 'sort' ? (i % 10) * 0.05 : i * 0.025, type: 'spring', stiffness: 200, damping: 18 }}>
                          {p.thumb ? <img src={media(p.thumb)} alt="" /> : <div className="skeleton" style={{ width: '100%', height: '100%' }} />}
                          {phase === 'sort' && Icon && <span className="pill pill-bad" style={{ position: 'absolute', inset: 'auto 4px 4px auto', padding: 3 }}><Icon size={11} /></span>}
                        </motion.div>
                      )
                    })}
                  </div>
                  {phase === 'scan' && <div className="scanline" />}
                </div>
                {phase === 'sort' && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="row wrap" style={{ gap: 8 }}>
                    {counts.duplicate ? <span className="chip"><Copy size={14} /> дубли: {counts.duplicate}</span> : null}
                    {counts.blurry ? <span className="chip"><Droplets size={14} /> смаз: {counts.blurry}</span> : null}
                    {counts.dark ? <span className="chip"><Moon size={14} /> темнота: {counts.dark}</span> : null}
                    <span className="chip active"><Sparkles size={14} /> в книге: {used}</span>
                  </motion.div>
                )}
              </motion.div>
            ) : (
              <motion.div key="book" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="stack" style={{ gap: 20, alignItems: 'center', textAlign: 'center' }}>
                <div className="eyebrow">Готово за {(ms / 1000).toFixed(1)} с</div>
                <div style={{ padding: '10px 0 6px' }}>
                  <Book3D coverUrl={cover ? media(`/api/media/${cover}?size=thumb`) : undefined} title={project?.title} width={210} color="#DD5757" spin />
                </div>
                <h1 className="h1" style={{ color: '#fff' }}>{project?.title}</h1>
                <div className="row wrap" style={{ justifyContent: 'center', gap: 8 }}>
                  <span className="chip">{project?.layout.pages.length} страниц</span>
                  <span className="chip">{used} фото из {project?.photos.length}</span>
                  {rejected.filter((r) => r.reason !== 'limit').length > 0 && <span className="chip">убрал {rejected.filter((r) => r.reason !== 'limit').length} лишних</span>}
                </div>
                <div className="bubble dark hand" style={{ maxWidth: 330 }}>
                  Мур! Дизайнер потратил бы на это ~{savedMin} минут. Посмотрите — поправим что угодно словами.
                </div>
                {project && project.layout.pages.length > 1 && (
                  <div className="spread" style={{ width: '100%', maxWidth: 380 }}>
                    <PageView page={project.layout.pages[0]} photos={photos} aspect={aspect} />
                    <PageView page={project.layout.pages[1]} photos={photos} aspect={aspect} />
                  </div>
                )}
                <div className="row" style={{ gap: 8 }}><Robot size={34} /><span className="small muted">Робот уже проверяет качество печати</span></div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
        {phase === 'book' && (
          <div className="fixed-cta stack" style={{ gap: 8 }}>
            <button className="btn btn-primary btn-lg btn-block" onClick={() => nav(`/editor/${id}`)}><BookOpen size={20} /> Открыть книгу</button>
            <button className="btn btn-block" style={{ background: 'var(--night-3)', color: '#fff' }} onClick={shuffle}><Shuffle size={18} /> Другая раскладка</button>
          </div>
        )}
      </div>
    </div>
  )
}
