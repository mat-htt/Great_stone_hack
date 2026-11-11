import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertOctagon, AlertTriangle, CheckCircle2, Info, Loader2, Wand2 } from 'lucide-react'
import { api, media, track, type Issue, type Photo, type Preflight, type Project } from '../api'
import { Robot } from '../components/Mascots'
import { TopBar } from '../components/ui'
import { errorText, useApp } from '../store'

const AI_FIX: Record<string, { tool: string; params?: any }> = {
  upscale: { tool: 'upscale', params: { scale: 4 } }, text_clarity: { tool: 'text_clarity' }, auto_enhance: { tool: 'auto_enhance' },
}

export default function Check() {
  const { id } = useParams()
  const nav = useNavigate()
  const { toast } = useApp()
  const [pf, setPf] = useState<Preflight | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [scanning, setScanning] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [ignored, setIgnored] = useState<string[]>(() => { try { return JSON.parse(sessionStorage.getItem(`ign:${id}`) || '[]') } catch { return [] } })

  const load = async () => {
    const [p, f] = await Promise.all([api<Project>(`/api/projects/${id}`), api<Preflight>(`/api/projects/${id}/preflight`)])
    setProject(p); setPf(f)
    return f
  }
  useEffect(() => {
    const t0 = Date.now()
    load().then(() => setTimeout(() => setScanning(false), Math.max(0, 1600 - (Date.now() - t0)))).catch((e) => { toast({ title: errorText(e), kind: 'bad' }); setScanning(false) })
  }, [id])
  useEffect(() => { try { sessionStorage.setItem(`ign:${id}`, JSON.stringify(ignored)) } catch { /* noop */ } }, [ignored])

  const photos: Record<string, Photo> = Object.fromEntries((project?.photos || []).map((p) => [p.id, p]))
  const issues = (pf?.issues || []).filter((i) => !ignored.includes(i.id))
  const crit = issues.filter((i) => i.severity === 'critical')
  const warns = issues.filter((i) => i.severity === 'warning')

  const fix = async (issue: Issue, action: string) => {
    if (action === 'ignore') { setIgnored((x) => [...x, issue.id]); return }
    setBusy(issue.id + action)
    try {
      if (AI_FIX[action] && issue.photo_id) {
        await api(`/api/ai/photos/${issue.photo_id}/apply`, { method: 'POST', json: { ...AI_FIX[action], project_id: id, replace: true } })
        track('ai_used', { tool: AI_FIX[action].tool, from: 'preflight' })
      } else if (action === 'autofill') await api(`/api/projects/${id}/relayout`, { method: 'POST', json: { mode: 'spacious' } })
      else if (action === 'compact') await api(`/api/projects/${id}/relayout`, { method: 'POST', json: { mode: 'compact' } })
      else if (action === 'auto_cover') await api(`/api/projects/${id}/relayout`, { method: 'POST', json: { mode: 'cover' } })
      else if (action === 'smaller_template' && issue.page !== null && project) {
        const layout = structuredClone(project.layout)
        const pg = layout.pages[issue.page]
        const ids = pg.slots.map((s) => s.photo_id)
        pg.template = 'quad'
        pg.slots = Array.from({ length: 4 }).map((_, i) => ({ photo_id: ids[i] ?? null, crop: { x: 0.5, y: 0.45, zoom: 1 } }))
        const free = project.photos.filter((p) => !layout.pages.some((x) => x.slots.some((s) => s.photo_id === p.id)))
        pg.slots.forEach((s) => { if (!s.photo_id && free.length) s.photo_id = free.shift()!.id })
        pg.template = pg.slots.filter((s) => s.photo_id).length >= 4 ? 'quad' : 'frame'
        if (pg.template === 'frame') pg.slots = [pg.slots[0]]
        await api(`/api/projects/${id}`, { method: 'PUT', json: { layout, revision: project.revision } })
      } else { nav(`/editor/${id}`); return }
      await load()
      toast({ title: 'Исправлено', mascot: 'robot' })
    } catch (e) { toast({ title: errorText(e), kind: 'bad' }) } finally { setBusy(null) }
  }

  const fixAll = async () => {
    setBusy('all')
    try {
      for (const i of issues) {
        const a = i.fixes.find((f) => AI_FIX[f.action] || ['autofill', 'auto_cover'].includes(f.action))
        if (a) await fix(i, a.action)
      }
      await load()
    } finally { setBusy(null) }
  }

  const proceed = () => { track('preflight_passed'); nav(`/checkout/${id}`) }
  const score = pf ? Math.max(0, 100 - crit.length * 18 - warns.length * 6) : 0

  return (
    <div className="phone">
      <TopBar back={`/editor/${id}`} title="Проверка Робота" />
      <main className="page no-tab">
        <AnimatePresence mode="wait">
          {scanning || !pf ? (
            <motion.div key="scan" exit={{ opacity: 0 }} className="stack" style={{ alignItems: 'center', textAlign: 'center', paddingTop: 30, gap: 18 }}>
              <div className="scanbox card-green" style={{ width: 220, height: 220, display: 'grid', placeItems: 'center' }}>
                <Robot size={120} mood="scan" />
                <div className="scanline" />
              </div>
              <div className="h2">Проверяю каждую страницу…</div>
              <div className="small muted">Разрешение для печати, резкость, пустые места, обложка</div>
            </motion.div>
          ) : (
            <motion.div key="res" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="stack" style={{ gap: 16 }}>
              <div className="card row" style={{ gap: 16 }}>
                <Gauge value={score} />
                <div className="grow">
                  <div className="h2">{crit.length ? 'Нужно поправить' : warns.length ? 'Почти идеально' : 'Готово к печати!'}</div>
                  <div className="small muted">{pf.pages} стр. · {pf.photos} фото · {crit.length} критичных · {warns.length} советов</div>
                </div>
              </div>
              <div className="mascot-line">
                <Robot size={48} mood={crit.length ? 'alert' : 'happy'} />
                <div className="bubble">{crit.length ? 'Это напечатается плохо — давайте исправим. Многое я могу сделать сам.'
                  : warns.length ? 'Можно заказывать, но я бы улучшил пару кадров — одной кнопкой.' : 'Каждый разворот проверен. Можно отправлять в печать!'}</div>
              </div>
              {issues.some((i) => i.fixes.some((f) => AI_FIX[f.action])) && (
                <button className="btn btn-dark btn-block" onClick={fixAll} disabled={!!busy}>
                  {busy === 'all' ? <><Loader2 className="spin" size={18} /> Исправляю…</> : <><Wand2 size={18} /> Исправить всё автоматически</>}
                </button>
              )}
              <div className="stack" style={{ gap: 10 }}>
                {issues.map((i) => {
                  const Icon = i.severity === 'critical' ? AlertOctagon : i.severity === 'warning' ? AlertTriangle : Info
                  const color = i.severity === 'critical' ? 'var(--bad)' : i.severity === 'warning' ? 'var(--warn)' : 'var(--blue)'
                  const ph = i.photo_id ? photos[i.photo_id] : null
                  return (
                    <motion.div layout key={i.id} className="card" style={{ borderLeft: `4px solid ${color}` }}>
                      <div className="row" style={{ alignItems: 'flex-start' }}>
                        {ph ? <img src={media(ph.thumb)} alt="" style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
                          : <div className="center" style={{ width: 56, height: 56, borderRadius: 10, background: 'var(--sand)', flexShrink: 0 }}><Icon size={22} color={color} /></div>}
                        <div className="grow">
                          <div className="row" style={{ gap: 6 }}><Icon size={16} color={color} /><b>{i.title}</b>{i.page !== null && <span className="small muted">· стр. {i.page + 1}</span>}</div>
                          <div className="small" style={{ marginTop: 3 }}>{i.message}</div>
                        </div>
                      </div>
                      <div className="row wrap" style={{ marginTop: 10, gap: 6 }}>
                        {i.fixes.map((f) => (
                          <button key={f.action} className={`chip ${AI_FIX[f.action] ? 'coral' : ''}`} disabled={!!busy} onClick={() => fix(i, f.action)}>
                            {busy === i.id + f.action ? <Loader2 className="spin" size={14} /> : AI_FIX[f.action] ? <Wand2 size={14} /> : null}{f.label}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )
                })}
                {!issues.length && (
                  <div className="empty"><CheckCircle2 size={44} color="var(--ok)" /><div className="h3">Замечаний нет</div></div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
      {!scanning && pf && (
        <div className="fixed-cta">
          <button className="btn btn-primary btn-lg btn-block" disabled={crit.length > 0} onClick={proceed}>
            {crit.length ? `Исправьте критичное (${crit.length})` : warns.length ? 'Заказать как есть' : 'Оформить заказ'}
          </button>
        </div>
      )}
    </div>
  )
}

function Gauge({ value }: { value: number }) {
  const r = 30, c = 2 * Math.PI * r
  const color = value >= 85 ? 'var(--ok)' : value >= 60 ? 'var(--warn)' : 'var(--bad)'
  return (
    <svg width="76" height="76" viewBox="0 0 76 76" role="img" aria-label={`Готовность ${value} из 100`}>
      <circle cx="38" cy="38" r={r} fill="none" stroke="rgba(54,76,73,.1)" strokeWidth="8" />
      <motion.circle cx="38" cy="38" r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" transform="rotate(-90 38 38)"
        strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - value / 100) }} transition={{ duration: 1 }} />
      <text x="38" y="44" textAnchor="middle" fontSize="19" fontWeight="700" fill="var(--ink)" fontFamily="Jost">{value}</text>
    </svg>
  )
}
