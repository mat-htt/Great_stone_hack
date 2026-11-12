import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Check, Copy, MessageCircle, RotateCcw, Send, Truck } from 'lucide-react'
import { api, fmtDate, media, money, type Order, type Ticket } from '../api'
import { Avatar } from '../components/Mascots'
import { Mockup } from '../components/Mockup'
import { flowIndex, ORDER_FLOW, Sheet, TopBar } from '../components/ui'
import { errorText, useApp } from '../store'
import TelegramSheet, { useTelegram } from '../components/Telegram'

const TOPICS = ['Сроки', 'Качество печати', 'Изменить заказ', 'Оплата', 'Другое']

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
  const tg = useTelegram()
  const [tgOpen, setTgOpen] = useState(false)
  const fresh = params.get('new') === '1'
  const load = () => api<Order>(`/api/orders/${id}`).then(setO).catch((e) => setErr(errorText(e)))
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t) }, [id])

  if (err) return <div className="screen"><TopBar back="/orders" /><div className="content"><div className="card">{err}</div></div></div>
  if (!o) return <div className="screen"><TopBar back="/orders" /><div className="content"><div className="skeleton" style={{ height: 320 }} /></div></div>
  const idx = flowIndex(o.status, o.stage)
  const tickets = (o.tickets as Ticket[]) || []
  const last = o.events?.[o.events.length - 1]
  const send = async () => { try { await api('/api/support', { method: 'POST', json: { order_id: o.id, topic, text: msg } }); setMsg(''); setSupport(false); load(); toast({ title: 'Сообщение отправлено', mascot: 'robot' }) } catch (e) { toast({ title: errorText(e), kind: 'bad' }) } }
  const answer = async (t: Ticket) => { if (!reply[t.id]?.trim()) return; await api(`/api/support/${t.id}/messages`, { method: 'POST', json: { text: reply[t.id] } }); setReply({ ...reply, [t.id]: '' }); load() }
  const repeat = async () => { try { const r = await api<{ project_id: string }>(`/api/orders/${o.id}/repeat`, { method: 'POST' }); nav(`/editor/${r.project_id}`) } catch (e) { toast({ title: errorText(e), kind: 'bad' }) } }

  return (
    <div className="screen">
      <TopBar back="/orders" title={o.number} />
      <main className="content no-dock stack" style={{ gap: 14 }}>
        {fresh && <Confetti />}
        <motion.div className="card" initial={fresh ? { scale: .94, opacity: 0 } : false} animate={{ scale: 1, opacity: 1 }}
          style={{ background: 'radial-gradient(90% 120% at 100% 0%, var(--glow-1), transparent 60%), var(--surface)' }}>
          <div className="row" style={{ gap: 14 }}>
            {o.project?.cover_photo_id ? <Mockup kind="book" src={media(`/api/media/${o.project.cover_photo_id}?size=thumb`)} size={84} /> : null}
            <div className="grow">
              <div className="t-sm muted">{fresh ? 'Заказ оформлен' : o.status_label}</div>
              <h1 className="t-h2">{o.snapshot?.title}</h1>
              {o.eta && <div className="t-sm muted">Готов примерно {fmtDate(o.eta)}</div>}
            </div>
          </div>
          <div className="say" style={{ marginTop: 14 }}><Avatar who="robot" size={40} /><div className="bubble" style={{ background: 'var(--fill)', boxShadow: 'none' }}>{last?.message || 'Заказ принят.'}</div></div>
        </motion.div>

        <section className="card">
          <h2 className="t-h3" style={{ marginBottom: 14 }}>Где сейчас заказ</h2>
          <div className="tl">
            {ORDER_FLOW.map((s, i) => {
              const ev = o.events?.slice().reverse().find((e) => (e.stage || e.status) === s.key)
              const st = i < idx || o.status === 'completed' ? 'done' : i === idx ? 'now' : ''
              return (
                <div key={s.key} className={`tl-i ${st}`}>
                  <div className="tl-dot">{st === 'done' && <Check size={14} strokeWidth={3} />}</div>
                  <div><div style={{ fontWeight: st ? 650 : 450, color: st ? 'var(--text)' : 'var(--muted)' }}>{s.label}</div>{ev && <div className="t-xs muted">{fmtDate(ev.created_at, true)}</div>}</div>
                </div>
              )
            })}
          </div>
          {o.track_number && <div className="card flat row" style={{ marginTop: 6 }}><Truck size={18} /><span className="grow t-sm">Трек-номер <b>{o.track_number}</b></span>
            <button className="icon-btn plain" aria-label="Копировать" onClick={() => navigator.clipboard.writeText(o.track_number!).then(() => toast({ title: 'Скопировано' }))}><Copy size={15} /></button></div>}
        </section>

        {tg.state && !tg.state.linked && !["completed", "cancelled"].includes(o.status) && (
          <button className="card row" onClick={() => setTgOpen(true)} style={{ border: 0, width: "100%", textAlign: "left", cursor: "pointer", gap: 12 }}>
            <Send size={20} style={{ color: "var(--primary)" }} /><span className="grow"><b>Сообщать статусы в Telegram?</b><div className="t-sm muted">Робот напишет, когда заказ будет готов к выдаче или поедет к вам</div></span>
          </button>
        )}

        <section className="card">
          <h2 className="t-h3" style={{ marginBottom: 8 }}>Состав и сумма</h2>
          {(o.snapshot?.lines || []).map((l: any, i: number) => <div key={i} className="price-line"><span className="muted">{l.label}</span><span className="num">{money(l.amount_minor)}</span></div>)}
          {o.discount_minor > 0 && <div className="price-line" style={{ color: 'var(--primary-strong)' }}><span>Скидка {o.promo_code}</span><span className="num">−{money(o.discount_minor)}</span></div>}
          <div className="price-line"><span className="muted">Доставка</span><span className="num">{o.delivery_minor ? money(o.delivery_minor) : 'бесплатно'}</span></div>
          <div className="price-total"><span>Итого</span><span className="num">{money(o.total_minor)}</span></div>
        </section>

        <section className="stack" style={{ gap: 10 }}>
          <div className="between"><h2 className="t-h2">Поддержка</h2><button className="btn btn-secondary btn-sm" onClick={() => setSupport(true)}><MessageCircle size={15} /> Написать</button></div>
          {!tickets.length && <div className="t-sm muted">Вопрос по заказу? Сообщение сразу привяжется к нему.</div>}
          {tickets.map((t) => (
            <div key={t.id} className="card stack" style={{ gap: 8 }}>
              <div className="between"><b className="t-sm">{t.topic}</b><span className={`badge ${t.status === 'answered' ? 'b-ok' : 'b-warn'}`}>{t.status === 'answered' ? 'есть ответ' : 'ждёт ответа'}</span></div>
              {t.messages.map((m) => (
                <div key={m.id} style={{ alignSelf: m.author_role === 'client' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                  <div className="bubble" style={m.author_role === 'client' ? { background: 'var(--primary)', color: 'var(--primary-ink)', borderRadius: '20px 20px 6px 20px' } : { background: 'var(--fill)', boxShadow: 'none' }}>{m.text}</div>
                  <div className="t-xs muted" style={{ marginTop: 2, textAlign: m.author_role === 'client' ? 'right' : 'left' }}>{m.author_name} · {fmtDate(m.created_at, true)}</div>
                </div>
              ))}
              <form className="row" onSubmit={(e) => { e.preventDefault(); answer(t) }}>
                <input className="input" style={{ height: 44 }} value={reply[t.id] || ''} onChange={(e) => setReply({ ...reply, [t.id]: e.target.value })} placeholder="Ответить" aria-label="Ответ" />
                <button className="icon-btn" style={{ background: 'var(--primary)', color: 'var(--primary-ink)' }} aria-label="Отправить"><Send size={16} /></button>
              </form>
            </div>
          ))}
        </section>
        <button className="btn btn-secondary btn-block" onClick={repeat}><RotateCcw size={18} /> Заказать ещё раз</button>
      </main>

      <TelegramSheet open={tgOpen} onClose={() => setTgOpen(false)} tg={tg} />
      <Sheet open={support} onClose={() => setSupport(false)} label="Сообщение в поддержку">
        <form className="stack" onSubmit={(e) => { e.preventDefault(); send() }}>
          <h2 className="t-h2">Чем помочь?</h2>
          <div className="row wrap" style={{ gap: 6 }}>{TOPICS.map((t) => <button type="button" key={t} className={`chip ${t === topic ? 'active' : ''}`} onClick={() => setTopic(t)}>{t}</button>)}</div>
          <textarea className="input" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Опишите вопрос" required minLength={2} />
          <button className="btn btn-primary btn-block" disabled={msg.trim().length < 2}>Отправить</button>
        </form>
      </Sheet>
    </div>
  )
}

function Confetti() {
  return (
    <div aria-hidden style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 90, overflow: 'hidden' }}>
      {Array.from({ length: 34 }).map((_, i) => (
        <motion.div key={i} style={{ position: 'absolute', top: -20, left: `${(i * 37) % 100}%`, width: 9, height: 14, borderRadius: 3, background: ['var(--primary)', 'var(--glow-1)', 'var(--glow-3)', 'var(--text)'][i % 4] }}
          initial={{ y: -20, rotate: 0, opacity: 1 }} animate={{ y: '110vh', rotate: 360 + i * 20, opacity: [1, 1, 0] }} transition={{ duration: 2.4 + (i % 5) * .3, delay: (i % 8) * .07, ease: 'easeIn' }} />
      ))}
    </div>
  )
}
