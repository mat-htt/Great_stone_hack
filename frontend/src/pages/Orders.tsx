import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, MessageCircle } from 'lucide-react'
import { api, fmtDate, money, type Order } from '../api'
import { Robot } from '../components/Mascots'
import { MiniProgress, Dock, TopBar } from '../components/ui'

export default function Orders() {
  const [items, setItems] = useState<Order[] | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    const load = () => api<{ items: Order[] }>('/api/orders').then((r) => setItems(r.items)).catch((e) => setErr(e.message))
    load()
    const t = setInterval(load, 8000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="screen">
      <TopBar title={<span className="t-h1">Заказы</span>} left />
      <main className="content stack">
        {err && <div className="card b-bad" role="alert">{err}</div>}
        {!items && !err && [0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 110 }} />)}
        {items?.length === 0 && (
          <div className="empty"><Robot size={84} /><div className="t-h3">Заказов пока нет</div><div className="t-sm muted">Соберите первую книгу — это займёт пару минут</div>
            <Link to="/create" className="btn btn-primary">Создать</Link></div>
        )}
        {items?.map((o) => (
          <Link key={o.id} to={`/orders/${o.id}`} className="card stack" style={{ gap: 10 }}>
            <div className="between">
              <div><div className="t-h3">{o.snapshot?.title || 'Заказ'}</div><div className="t-sm muted">{o.number} · {fmtDate(o.created_at)}</div></div>
              <ChevronRight size={20} color="var(--muted)" />
            </div>
            <MiniProgress status={o.status} stage={o.stage} />
            <div className="between t-sm">
              <span className={`badge ${o.status === 'completed' ? 'b-ok' : o.status === 'needs_fix' ? 'b-bad' : 'b-soft'}`}>{o.stage_label || o.status_label}</span>
              <span className="row" style={{ gap: 10 }}>
                {typeof o.tickets === 'number' && o.tickets > 0 && <span className="row muted" style={{ gap: 4 }}><MessageCircle size={14} />{o.tickets}</span>}
                <b className="num">{money(o.total_minor)}</b>
              </span>
            </div>
          </Link>
        ))}
      </main>
      <Dock />
    </div>
  )
}
