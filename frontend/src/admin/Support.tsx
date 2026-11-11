import { useEffect, useState } from 'react'
import { Loader2, Send, Sparkles } from 'lucide-react'
import { api, fmtDate, type Ticket } from '../api'
import { Cat } from '../components/Mascots'
import { errorText, useApp } from '../store'
import { Head } from './Admin'

export default function Support() {
  const { toast } = useApp()
  const [status, setStatus] = useState('open')
  const [items, setItems] = useState<Ticket[]>([])
  const [sel, setSel] = useState<Ticket | null>(null)
  const [text, setText] = useState('')
  const [drafting, setDrafting] = useState(false)
  const [meta, setMeta] = useState('')

  const load = () => api<{ items: Ticket[] }>(`/api/admin/tickets${status ? `?status=${status}` : ''}`).then((r) => {
    setItems(r.items)
    if (sel) setSel(r.items.find((t) => t.id === sel.id) || sel)
  })
  useEffect(() => { load() }, [status])

  const draft = async () => {
    if (!sel) return
    setDrafting(true)
    try {
      const r = await api<{ text: string; _meta: any }>(`/api/admin/tickets/${sel.id}/draft`, { method: 'POST' })
      setText(r.text); setMeta(`${r._meta.provider === 'builtin' ? 'шаблон' : r._meta.model}${r._meta.status === 'fallback' ? ' · резервный режим' : ''}`)
    } catch (e) { toast({ title: errorText(e), kind: 'bad' }) } finally { setDrafting(false) }
  }
  const send = async () => {
    if (!sel || !text.trim()) return
    try { await api(`/api/support/${sel.id}/messages`, { method: 'POST', json: { text } }); setText(''); setMeta(''); load(); toast({ title: 'Ответ отправлен клиенту' }) }
    catch (e) { toast({ title: errorText(e), kind: 'bad' }) }
  }

  return (
    <div>
      <Head title="Поддержка" sub="Обращения привязаны к заказам. AI готовит черновик — отправляет только оператор." />
      <div className="row" style={{ marginBottom: 14 }}>
        {[['open', 'Ждут ответа'], ['answered', 'Отвечены'], ['', 'Все']].map(([k, l]) => <button key={k} className={`chip ${status === k ? 'active' : ''}`} onClick={() => setStatus(k)}>{l}</button>)}
      </div>
      <div className="panels" style={{ marginTop: 0 }}>
        <div className="panel span-5" style={{ padding: 8, maxHeight: '75vh', overflowY: 'auto' }}>
          {items.map((t) => (
            <button key={t.id} onClick={() => { setSel(t); setText(''); setMeta('') }} className="row" style={{ width: '100%', textAlign: 'left', padding: 12, borderRadius: 12, border: 0, cursor: 'pointer', background: sel?.id === t.id ? 'var(--coral-50)' : 'transparent', alignItems: 'flex-start' }}>
              <div className="grow">
                <div className="between"><b className="small">{t.topic}</b><span className="tiny muted">{fmtDate(t.created_at, true)}</span></div>
                <div className="small" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.subject}</div>
                <div className="row tiny" style={{ marginTop: 4, gap: 6 }}>{t.order_number && <span className="pill pill-soft">{t.order_number}</span>}{t.overdue && <span className="pill pill-bad">SLA просрочен</span>}</div>
              </div>
            </button>
          ))}
          {!items.length && <div className="empty muted">Нет обращений</div>}
        </div>
        <div className="panel span-7 stack">
          {!sel ? <div className="empty"><Cat size={60} /><div className="muted">Выберите обращение слева</div></div> : (
            <>
              <div className="between"><div className="h3">{sel.topic} {sel.order_number && <span className="muted small">· {sel.order_number}</span>}</div><span className="pill pill-soft">{sel.status}</span></div>
              <div className="stack" style={{ gap: 8, maxHeight: 340, overflowY: 'auto' }}>
                {sel.messages.map((m) => (
                  <div key={m.id} style={{ alignSelf: m.author_role === 'client' ? 'flex-start' : 'flex-end', maxWidth: '80%' }}>
                    <div className="bubble" style={m.author_role !== 'client' ? { background: 'var(--green)', color: '#fff', borderRadius: '18px 18px 6px 18px' } : {}}>{m.text}</div>
                    <div className="tiny muted">{m.author_name} · {fmtDate(m.created_at, true)}</div>
                  </div>
                ))}
              </div>
              <textarea className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ответ клиенту" rows={5} />
              {meta && <div className="tiny muted">Черновик AI ({meta}). Проверьте перед отправкой.</div>}
              <div className="row">
                <button className="btn btn-ghost" onClick={draft} disabled={drafting}>{drafting ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />} AI-черновик</button>
                <div style={{ flex: 1 }} />
                <button className="btn btn-primary" onClick={send} disabled={!text.trim()}><Send size={16} /> Отправить</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
