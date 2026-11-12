import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useNavigate, useParams } from 'react-router-dom'
import { Shuffle } from 'lucide-react'
import { api, media, type Photo, type Project } from '../api'
import { Mascot } from '../components/Mascots'
import { aspectOf, CoverView, PageView, useDesigns } from '../components/ui'
import { errorText, useApp } from '../store'

interface Rej { id: string; reason: string; label: string }

export default function Magic() {
  const { id } = useParams()
  const nav = useNavigate()
  const { toast } = useApp()
  const designs = useDesigns()
  const [project, setProject] = useState<Project | null>(null)
  const [rejected, setRejected] = useState<Rej[]>([])
  const [phase, setPhase] = useState<'scan' | 'sort' | 'done'>('scan')
  const [ms, setMs] = useState(0)

  useEffect(() => {
    const t0 = performance.now()
    api<Project & { curation: { rejected: Rej[] } }>(`/api/projects/${id}/relayout`, { method: 'POST', json: { mode: 'curate' } })
      .then((p) => { setProject(p); setRejected(p.curation.rejected); setMs(Math.round(performance.now() - t0)) })
      .catch((e) => { toast({ title: errorText(e), kind: 'bad' }); nav(`/editor/${id}`) })
  }, [id])
  useEffect(() => {
    if (!project) return
    const a = setTimeout(() => setPhase('sort'), 1200), b = setTimeout(() => setPhase('done'), 3000)
    return () => { clearTimeout(a); clearTimeout(b) }
  }, [project])

  const photos = useMemo(() => Object.fromEntries((project?.photos || []).map((p) => [p.id, p])), [project]) as Record<string, Photo>
  const removed = rejected.filter((r) => r.reason !== 'limit')
  const used = project ? new Set(project.layout.pages.flatMap((p) => p.slots.map((s) => s.photo_id)).filter(Boolean)).size : 0
  const design = designs.find((d) => d.id === project?.options.template)
  const cover = project?.layout.cover?.photo_id
  const shuffle = async () => { const p = await api<Project>(`/api/projects/${id}/relayout`, { method: 'POST', json: { mode: 'shuffle' } }); setProject(p) }

  return (
    <div className="screen">
      <main className="content no-dock" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 20px)' }}>
        <AnimatePresence mode="wait">
          {phase !== 'done' ? (
            <motion.div key="w" exit={{ opacity: 0, scale: .97 }} className="stack" style={{ gap: 18 }}>
              <div className="row" style={{ alignItems: 'flex-end' }}>
                <Mascot pose="cat-point" size={110} className="float" />
                <div className="bubble" style={{ marginBottom: 20 }}>{!project ? 'Смотрю ваши фото…' : phase === 'scan' ? 'Выбираю лучшие кадры…' : `Убрал ${removed.length} лишних, раскладываю…`}</div>
              </div>
              <div className="card scan" style={{ padding: 6 }}>
                <div className="grid3" style={{ gridTemplateColumns: 'repeat(5,1fr)', gap: 4 }}>
                  {(project?.photos || Array.from({ length: 20 }).map((_, i) => ({ id: `s${i}` } as Photo))).slice(0, 40).map((p, i) => {
                    const r = rejected.find((x) => x.id === p.id && x.reason !== 'limit')
                    return (
                      <motion.div key={p.id} style={{ aspectRatio: 1, borderRadius: 10, overflow: 'hidden', background: 'var(--fill)' }}
                        initial={{ opacity: 0, scale: .6 }} animate={phase === 'sort' && r ? { opacity: .2, scale: .7, rotate: i % 2 ? 10 : -10 } : { opacity: 1, scale: 1 }}
                        transition={{ delay: (i % 10) * .03, type: 'spring', stiffness: 220, damping: 18 }}>
                        {p.thumb && <img src={media(p.thumb)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                      </motion.div>
                    )
                  })}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div key="d" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="stack" style={{ gap: 18, alignItems: 'center', textAlign: 'center' }}>
              <div className="center" style={{ height: 250, width: '100%', borderRadius: 'var(--r-xl)', background: 'radial-gradient(70% 80% at 50% 100%, var(--glow-1), transparent)' }}>
                {cover && <CoverView design={design} photo={media(`/api/media/${cover}?size=preview`)} title={project?.title} aspect={project ? aspectOf(project.product, project.options.size) : 1} size={210} />}
              </div>
              <h1 className="t-h1">{project?.title}</h1>
              <div className="t-sm muted">{project?.layout.pages.length} страниц · {used} фото из {project?.photos.length}{removed.length ? ` · убрал ${removed.length} дублей и смазанных` : ''} · {(ms / 1000).toFixed(1)} с</div>
              {project && project.layout.pages.length > 1 && (
                <div className="spread" style={{ width: '100%' }}>
                  {[0, 1].map((i) => <PageView key={i} page={project.layout.pages[i]} photos={photos} aspect={aspectOf(project.product, project.options.size)} design={design} />)}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
      {phase === 'done' && (
        <div className="bottom-cta stack" style={{ gap: 8 }}>
          <button className="btn btn-primary btn-lg btn-block" onClick={() => nav(`/editor/${id}`)}>Посмотреть и поправить</button>
          <button className="btn btn-secondary btn-block" onClick={shuffle}><Shuffle size={18} /> Другая раскладка</button>
        </div>
      )}
    </div>
  )
}
