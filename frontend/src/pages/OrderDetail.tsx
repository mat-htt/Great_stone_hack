import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Check, Copy, MessageCircle, Package, RotateCcw, Send, Truck } from 'lucide-react'
import { api, fmtDate, media, money, type Order, type Ticket } from '../api'
import { Cat, Robot } from '../components/Mascots'
import { Book3D, flowIndex, ORDER_FLOW, Sheet, TopBar } from '../components/ui'
import { errorText, useApp } from '../store'

const TOPICS = ['Сроки доставки', 'Качество печати', 'Изменить заказ', 'Оплата', 'Другое']

export default function OrderDetail() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const { toast } = useApp()
  const [o, setO] = useState<Order | null>(null)
  const [err, setErr] = useState('')
  const [support, setSupport] = useState(false)
  const [topic, setTopic] = useState(TOPICS[0])
  const [msg, setMsg] = useState('')
  const [reply, setReply] = useState<Record<number, string>>({})
  const isNew = params.get('new') === '1'

  const load = () => api<Order>(`/api/orders/${id}`).then(setO).catch((e) => setErr(errorText(e)))
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t) }, [id])

  if (err) return <div className="phone"><TopBar back="/orders" title="Заказ" /><div className="page"><div className="card pill-bad">{err}</div></div></div>
  if (!o) return <div className="phone"><TopBar back="/orders" title="Заказ" /><div className="page"><div className="skeleton" style={{ height: 320 }} /></div></div>

  const idx = flowIndex(o.status, o.stage)
  const tickets = (o.tickets as Ticket[]) || []
  const lastEvent = o.events?.[o.events.length - 1]

  const send = async () => {
    try {
      await api('/api/support', { method: 'POST', json: { order_id: o.id, topic, text: msg } })
      setMsg(''); setSupport(false); load()
      toast({ title: 'Обращение отправлено', body: 'Ответ придёт сюда и в уведомления', mascot: 'robot' })
    } catch (e) { toast({ title: errorText(e), kind: 'bad' }) }
  }
  const sendReply = async (t: Ticket) => {
    if (!reply[t.id]?.trim()) return
    try { await api(`/api/support/${t.id}/messages`, { method: 'POST', json: { text: reply[t.id] } }); setReply({ ...reply, [t.id]: '' }); load() }
    catch (e) { toast({ title: errorText(e), kind: 'bad' }) }
  }
  const repeat = async () => {
    try { const r = await api<{ project_id: string }>(`/api/orders/${o.id}/repeat`, { method: 'POST' }); nav(`/editor/${r.project_id}`) }
    catch (e) { toast({ title: errorText(e), kind: 'bad' }) }
  }

  return (
    <div className="phone">
      <TopBar back="/orders" title={o.number} />
      <main className="page no-tab stack" style={{ gap: 16 }}>
        {isNew && <Confetti />}
        <motion.div className="card card-green stack" style={{ gap: 14, position: 'relative', overflow: 'hidden' }} initial={isNew ? { scale: 0.9, opacity: 0 } : false} animate={{ scale: 1, opacity: 1 }}>
          <div className="row" style={{ gap: 14 }}>
            <Book3D coverUrl={o.project?.cover_photo_id ? media(`/api/media/${o.project.cover_photo_id}?size=thumb`) : undefined} width={78} color="#DD5757" />
            <div className="grow">
              <div className="small" style={{ opacity: .8 }}>{isNew ? 'Заказ оформлен!' : o.status_label}</div>
              <div className="h2" style={{ color: '#fff' }}>{o.snapshot?.title}</div>
              <div className="small" style={{ opacity: .8 }}>{o.eta ? `Готовность ~ ${fmtDate(o.eta)}` : ''}</div>
            </div>
          </div>
          <div className="mascot-line"><Robot size={40} mood={o.status === 'production' ? 'scan' : 'happy'} />
            <div className="bubble dark" style={{ background: 'rgba(255,255,255,.12)' }}>{lastEvent?.message || 'Заказ принят.'}</div></div>
        </motion.div>

        <section className="card">
          <div className="h3" style={{ marginBottom: 14 }}>Где сейчас заказ</div>
          <div className="timeline">
            {ORDER_FLOW.map((s, i) => {
              const ev = o.events?.slice().reverse().find((e) => (e.stage || e.status) === s.key)
              const state = i < idx || o.status === 'completed' ? 'done' : i === idx ? 'current' : ''
              return (
                <div key={s.key} className={`tl-item ${state}`}>
                  <div className={`tl-dot ${state === 'current' ? 'pulse' : ''}`}>{state === 'done' && <Check size={15} strokeWidth={3} />}</div>
                  <div>
                    <div style={{ fontWeight: state ? 600 : 400, color: state ? 'var(--ink)' : 'var(--muted)' }}>{s.label}
                      {s.sub && <span className="tiny muted"> · производство</span>}</div>
                    {ev && <div className="small muted">{fmtDate(ev.created_at, true)}</div>}
                  </div>
                </div>
              )
            })}
          </div>
          {o.status === 'needs_fix' && <div className="card" style={{ background: 'var(--coral-50)', boxShadow: 'none', marginTop: 8 }}>{lastEvent?.message}</div>}
          {o.track_number && (
            <div className="row card flat" style={{ padding: 12, marginTop: 6 }}>
              <Truck size={18} color="var(--coral)" /><span className="grow small">Трек-номер <b>{o.track_number}</b></span>
              <button className="icon-btn" style={{ width: 34, height: 34 }} aria-label="Копировать трек" onClick={() => navigator.clipboard.writeText(o.track_number!).then(() => toast({ title: 'Скопировано' }))}><Copy size={15} /></button>
            </div>
          )}
        </section>

        <section className="card">
          <div className="h3" style={{ marginBottom: 8 }}>Состав и сумма</div>
          {(o.snapshot?.lines || []).map((l: any, i: number) => <div key={i} className="price-line"><span className="muted">{l.label}</span><span className="num">{money(l.amount_minor)}</span></div>)}
          {o.discount_minor > 0 && <div className="price-line" style={{ color: 'var(--coral)' }}><span>Скидка {o.promo_code}</span><span className="num">−{money(o.discount_minor)}</span></div>}
          <div className="price-line"><span className="muted">Доставка</span><span className="num">{o.delivery_minor ? money(o.delivery_minor) : 'бесплатно'}</span></div>
          <div className="price-total"><span>Итого</span><span className="num">{money(o.total_minor)}</span></div>
          <div className="small muted" style={{ marginTop: 6 }}>{o.snapshot?.pages ? `${o.snapshot.pages} стр. · ` : ''}{o.snapshot?.photos} фото · {o.snapshot?.payment || 'Тестовая оплата'}</div>
        </section>

        <section className="stack" style={{ gap: 10 }}>
          <div className="between"><div className="h2">Поддержка</div><button className="btn btn-sm btn-ghost" onClick={() => setSupport(true)}><MessageCircle size={15} /> Написать</button></div>
          {tickets.length === 0 && <div className="small muted">Вопрос по этому заказу? Обращение сразу будет привязано к нему.</div>}
          {tickets.map((t) => (
            <div key={t.id} className="card stack" style={{ gap: 8 }}>
              <div className="between"><b className="small">{t.topic}</b><span className={`pill ${t.status === 'answered' ? 'pill-ok' : t.status === 'closed' ? 'pill-soft' : 'pill-warn'}`}>{t.status === 'open' ? 'ждёт ответа' : t.status === 'answered' ? 'есть ответ' : 'закрыто'}</span></div>
              {t.messages.map((m) => (
                <div key={m.id} style={{ alignSelf: m.author_role === 'client' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                  <div className="bubble" style={m.author_role === 'client' ? { background: 'var(--coral)', color: '#fff', borderRadius: '18px 18px 6px 18px' } : {}}>{m.text}</div>
                  <div className="tiny muted" style={{ marginTop: 2, textAlign: m.author_role === 'client' ? 'right' : 'left' }}>{m.author_name} · {fmtDate(m.created_at, true)}</div>
                </div>
              ))}
              <form className="row" onSubmit={(e) => { e.preventDefault(); sendReply(t) }}>
                <input className="input grow" style={{ height: 42 }} value={reply[t.id] || ''} onChange={(e) => setReply({ ...reply, [t.id]: e.target.value })} placeholder="Ответить…" aria-label="Ответ" />
                <button className="icon-btn" aria-label="Отправить" style={{ background: 'var(--coral)', color: '#fff' }}><Send size={16} /></button>
              </form>
            </div>
          ))}
        </section>

        <button className="btn btn-soft btn-block" onClick={repeat}><RotateCcw size={18} /> Заказать ещё такую же</button>
        <div className="row small muted" style={{ justifyContent: 'center' }}><Package size={14} /> {o.delivery_method === 'pickup' ? 'Самовывоз' : o.delivery_address}</div>
      </main>

      <Sheet open={support} onClose={() => setSupport(false)} label="Обращение">
        <form className="stack" onSubmit={(e) => { e.preventDefault(); send() }}>
          <div className="row"><Cat size={44} /><div><div className="h2">Чем помочь?</div><div className="small muted">Заказ {o.number}</div></div></div>
          <div className="row wrap" style={{ gap: 6 }}>{TOPICS.map((t) => <button type="button" key={t} className={`chip ${t === topic ? 'active' : ''}`} onClick={() => setTopic(t)}>{t}</button>)}</div>
          <textarea className="input" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Опишите вопрос" required minLength={2} />
          <button className="btn btn-primary btn-block" disabled={msg.trim().length < 2}>Отправить</button>
        </form>
      </Sheet>
    </div>
  )
}

function Confetti() {
  const pieces = Array.from({ length: 36 })
  const colors = ['#DD5757', '#FFE36E', '#364C49', '#C6DBD7', '#E89A6F']
  return (
    <div aria-hidden style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 90, overflow: 'hidden' }}>
      {pieces.map((_, i) => (
        <motion.div key={i} style={{ position: 'absolute', top: -20, left: `${(i * 37) % 100}%`, width: 9, height: 14, borderRadius: 2, background: colors[i % colors.length] }}
          initial={{ y: -20, rotate: 0, opacity: 1 }} animate={{ y: '110vh', rotate: 360 + i * 20, opacity: [1, 1, 0] }}
          transition={{ duration: 2.4 + (i % 5) * 0.3, delay: (i % 8) * 0.08, ease: 'easeIn' }} />
      ))}
    </div>
  )
}
