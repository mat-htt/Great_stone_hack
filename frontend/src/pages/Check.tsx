import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useNavigate, useParams } from 'react-router-dom'
import { CheckCircle2, Loader2, Sparkles } from 'lucide-react'
import { api, media, track, type Issue, type Photo, type Preflight, type Project } from '../api'
import { Avatar, Mascot } from '../components/Mascots'
import { TopBar } from '../components/ui'
import { errorText, useApp } from '../store'

const AI_FIX: Record<string, { tool: string; params?: any }> = { upscale: { tool: 'upscale', params: { scale: 4 } }, text_clarity: { tool: 'text_clarity' }, auto_enhance: { tool: 'auto_enhance' } }

export default function Check() {
  const { id } = useParams()
  const nav = useNavigate()
  const { toast } = useApp()
  const [pf, setPf] = useState<Preflight | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [scan, setScan] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [ignored, setIgnored] = useState<string[]>(() => { try { return JSON.parse(sessionStorage.getItem(`ign:${id}`) || '[]') } catch { return [] } })
  const load = async () => { const [p, f] = await Promise.all([api<Project>(`/api/projects/${id}`), api<Preflight>(`/api/projects/${id}/preflight`)]); setProject(p); setPf(f) }
  useEffect(() => { const t0 = Date.now(); load().catch((e) => toast({ title: errorText(e), kind: 'bad' })).finally(() => setTimeout(() => setScan(false), Math.max(0, 1400 - (Date.now() - t0)))) }, [id])
  useEffect(() => { try { sessionStorage.setItem(`ign:${id}`, JSON.stringify(ignored)) } catch { /* noop */ } }, [ignored])

  const photos: Record<string, Photo> = Object.fromEntries((project?.photos || []).map((p) => [p.id, p]))
  const list = (pf?.issues || []).filter((i) => !ignored.includes(i.id))
  const crit = list.filter((i) => i.severity === 'critical')
  const recs = list.filter((i) => i.severity !== 'critical')

  const fix = async (i: Issue, action: string) => {
    if (action === 'ignore') {
      setIgnored((x) => [...x, i.id])
      if (i.photo_id) api(`/api/photos/${i.photo_id}/advice`, { method: 'POST', json: { code: i.code, decision: 'declined' } }).catch(() => {})
      return
    }
    setBusy(i.id + action)
    try {
      if (AI_FIX[action] && i.photo_id) { await api(`/api/ai/photos/${i.photo_id}/apply`, { method: 'POST', json: { ...AI_FIX[action], project_id: id, replace: true } }); api(`/api/photos/${i.photo_id}/advice`, { method: 'POST', json: { code: i.code, decision: 'accepted' } }).catch(() => {}) }
      else if (action === 'focus_faces') await api(`/api/projects/${id}/fit-faces`, { method: 'POST' })
      else if (['autofill', 'compact', 'auto_cover'].includes(action)) await api(`/api/projects/${id}/relayout`, { method: 'POST', json: { mode: action === 'autofill' ? 'spacious' : action === 'auto_cover' ? 'cover' : 'compact' } })
      else { nav(`/editor/${id}`); return }
      await load()
    } catch (e) { toast({ title: errorText(e), kind: 'bad' }) } finally { setBusy(null) }
  }
  const fixAll = async () => { setBusy('all'); for (const i of list) { const a = i.fixes.find((f) => AI_FIX[f.action] || f.action === 'focus_faces'); if (a) await fix(i, a.action) } setBusy(null) }

  return (
    <div className="screen">
      <TopBar back={`/editor/${id}`} title="Проверка перед печатью" />
      <main className="content no-dock">
        <AnimatePresence mode="wait">
          {scan || !pf ? (
            <motion.div key="s" exit={{ opacity: 0 }} className="stack check-center" style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 14 }}>
              <div className="scan" style={{ borderRadius: 40, padding: 10 }}><Mascot pose="robot-book" size={200} /></div>
              <h2 className="t-h2">Робот проверяет каждую страницу</h2>
              <div className="t-sm muted">Разрешение для печати, резкость, лица на краю кадра, пустые рамки</div>
            </motion.div>
          ) : (
            <motion.div key="r" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={'stack' + (list.length ? '' : ' check-center')} style={{ gap: 14, justifyContent: list.length ? undefined : 'center' }}>
              <div className="card row" style={{ gap: 14 }}>
                <Avatar who="robot" size={56} />
                <div className="grow">
                  <h2 className="t-h2">{crit.length ? 'Нужно заполнить' : recs.length ? 'Можно печатать' : 'Всё идеально'}</h2>
                  <div className="t-sm muted">{crit.length ? 'Есть пустые места — без них книга не соберётся.' : recs.length ? `${recs.length} ${recs.length === 1 ? 'совет' : 'совета'} — по желанию. Заказ можно оформить как есть.` : 'Каждая страница готова к печати.'}</div>
                </div>
              </div>
              {list.some((i) => i.fixes.some((f) => AI_FIX[f.action] || f.action === 'focus_faces')) && (
                <button className="btn btn-secondary btn-block" onClick={fixAll} disabled={!!busy}>{busy === 'all' ? <><Loader2 size={18} className="spin" /> Улучшаю…</> : <><Sparkles size={18} /> Применить все советы</>}</button>
              )}
              {list.map((i) => {
                const ph = i.photo_id ? photos[i.photo_id] : null
                return (
                  <motion.div layout key={i.id} className="card">
                    <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
                      {ph ? <img src={media(ph.thumb)} alt="" style={{ width: 54, height: 54, borderRadius: 14, objectFit: 'cover' }} /> : <span style={{ width: 54, height: 54, borderRadius: 14, background: 'var(--fill)' }} />}
                      <div className="grow">
                        <div className="row" style={{ gap: 8 }}><b>{i.title}</b><span className={`badge ${i.severity === 'critical' ? 'b-bad' : 'b-soft'}`}>{i.severity === 'critical' ? 'обязательно' : 'совет'}</span></div>
                        <div className="t-sm muted" style={{ marginTop: 3 }}>{i.message}{i.page !== null ? ` Стр. ${i.page + 1}.` : ''}</div>
                      </div>
                    </div>
                    <div className="row wrap" style={{ marginTop: 12, gap: 6 }}>
                      {i.fixes.map((f) => <button key={f.action} className={`chip ${AI_FIX[f.action] || f.action === 'focus_faces' ? 'accent' : ''}`} disabled={!!busy} onClick={() => fix(i, f.action)}>{busy === i.id + f.action && <Loader2 size={14} className="spin" />}{f.label}</button>)}
                    </div>
                  </motion.div>
                )
              })}
              {!list.length && <div className="empty"><CheckCircle2 size={44} color="var(--success)" /><div className="t-h3">Замечаний нет</div></div>}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
      {!scan && pf && (
        <div className="bottom-cta">
          <button className="btn btn-primary btn-lg btn-block" disabled={crit.length > 0} onClick={() => { track('preflight_passed'); nav(`/checkout/${id}`) }}>
            {crit.length ? 'Заполните пустые места' : 'Оформить заказ'}
          </button>
        </div>
      )}
    </div>
  )
}
