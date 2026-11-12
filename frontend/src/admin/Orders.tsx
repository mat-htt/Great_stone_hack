import { useEffect, useState } from 'react'
import { ChevronRight, Search } from 'lucide-react'
import { api, fmtDate, money, type Order } from '../api'
import { flowIndex, MiniProgress, ORDER_FLOW, Sheet } from '../components/ui'
import { errorText, useApp } from '../store'
import { Head } from './Admin'

const FILTERS = [['', 'Все'], ['accepted', 'Приняты'], ['moderation', 'Модерация'], ['production', 'Производство'], ['needs_fix', 'Нужна правка'], ['shipped', 'Доставка'], ['completed', 'Завершены']]

export default function AdminOrders() {
  const { toast } = useApp()
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [onlyApp, setOnlyApp] = useState(true)
  const [data, setData] = useState<{ items: Order[]; counts: Record<string, number> } | null>(null)
  const [open, setOpen] = useState<Order | null>(null)
  const [msg, setMsg] = useState('')
  const [sim, setSim] = useState<{ enabled: boolean; interval: number } | null>(null)

  const load = () => api(`/api/admin/orders?${new URLSearchParams({ status, q, only_app: String(onlyApp) })}`).then(setData).catch((e) => toast({ title: errorText(e), kind: 'bad' }))
  useEffect(() => { load() }, [status, onlyApp])
  useEffect(() => { api('/api/admin/simulator').then(setSim).catch(() => {}) }, [])
  useEffect(() => { const t = setInterval(load, 7000); return () => clearInterval(t) }, [status, q, onlyApp])

  const openOrder = async (o: Order) => setOpen(await api(`/api/admin/orders/${o.id}`))
  const act = async (body: any) => {
    try { const r = await api<Order>(`/api/admin/orders/${open!.id}/advance`, { method: 'POST', json: body }); setOpen({ ...open!, ...r }); setMsg(''); load(); toast({ title: `Статус: ${r.stage_label || r.status_label}` }) }
    catch (e) { toast({ title: errorText(e), kind: 'bad' }) }
  }

  return (
    <div>
      <Head title="Заказы и модерация" sub="Сканеры линии двигают заказы по этапам; оператор может модерировать и вмешиваться вручную."
        right={sim && <div className="row t-sm"><span className="muted">Демо-линия</span><span className={`badge ${sim.enabled ? 'b-ok' : 'b-soft'}`}>{sim.enabled ? `сканирует каждые ${sim.interval} с` : 'на паузе'}</span></div>} />
      <div className="row wrap" style={{ marginBottom: 14 }}>
        {FILTERS.map(([k, l]) => <button key={k} className={`chip ${status === k ? 'active' : ''}`} onClick={() => setStatus(k)}>{l}{k && data?.counts?.[k] ? ` · ${data.counts[k]}` : ''}</button>)}
        <div style={{ flex: 1 }} />
        <label className="row t-sm"><button className={`switch ${onlyApp ? 'on' : ''}`} onClick={() => setOnlyApp(!onlyApp)} aria-label="Только приложение" />Только приложение</label>
        <form className="row" onSubmit={(e) => { e.preventDefault(); load() }}>
          <input className="input sm" style={{ width: 200 }} placeholder="Номер заказа" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Поиск" />
          <button className="icon-btn" aria-label="Найти"><Search size={18} /></button>
        </form>
      </div>
      <div className="panel" style={{ padding: 0, overflow: 'auto' }}>
        <table className="t">
          <thead><tr><th>Заказ</th><th>Клиент</th><th>Продукт</th><th style={{ width: 180 }}>Этап</th><th>Сумма</th><th>Создан</th><th /></tr></thead>
          <tbody>
            {data?.items.map((o) => (
              <tr key={o.id} onClick={() => openOrder(o)} style={{ cursor: 'pointer' }}>
                <td><b>{o.number}</b><div className="t-xs muted">{o.channel}</div></td>
                <td>{o.customer}</td>
                <td className="t-sm">{o.snapshot?.title}</td>
                <td><div className="t-sm" style={{ marginBottom: 4 }}>{o.stage_label || o.status_label}</div><MiniProgress status={o.status} stage={o.stage} /></td>
                <td className="num">{money(o.total_minor)}</td>
                <td className="t-sm">{fmtDate(o.created_at, true)}</td>
                <td><ChevronRight size={16} color="var(--muted)" /></td>
              </tr>
            ))}
            {data?.items.length === 0 && <tr><td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 30 }}>Заказов нет</td></tr>}
          </tbody>
        </table>
      </div>

      <Sheet open={!!open} onClose={() => setOpen(null)} label="Заказ">
        {open && (
          <div className="stack">
            <div className="between"><div className="t-h2">{open.number}</div><span className="badge b-primary">{open.stage_label || open.status_label}</span></div>
            <div className="t-sm muted">{open.snapshot?.title} · {open.snapshot?.pages ? `${open.snapshot.pages} стр. · ` : ''}{open.snapshot?.photos} фото · {money(open.total_minor)}</div>
            {open.snapshot?.preflight_score !== undefined && <div className="t-sm">Оценка Робота перед заказом: <b>{open.snapshot.preflight_score}/100</b>{open.snapshot.warnings_accepted ? ' · клиент принял предупреждения' : ''}</div>}
            <div className="row wrap" style={{ gap: 4 }}>
              {ORDER_FLOW.map((s, i) => <span key={s.key} className={`badge ${i <= flowIndex(open.status, open.stage) ? 'b-bad' : 'b-soft'}`}>{s.label}</span>)}
            </div>
            <div className="row wrap">
              <button className="btn btn-primary" onClick={() => act({})} disabled={['completed', 'cancelled'].includes(open.status)}>Следующий этап →</button>
              {open.status === 'moderation' && <button className="btn btn-secondary" onClick={() => act({ status: 'needs_fix', message: msg })}>Вернуть на правку</button>}
              {!['completed', 'cancelled'].includes(open.status) && <button className="btn btn-secondary" onClick={() => act({ status: 'cancelled', message: msg || 'Отменён оператором' })}>Отменить</button>}
            </div>
            <input className="input" placeholder="Комментарий клиенту (обязателен для «правки»)" value={msg} onChange={(e) => setMsg(e.target.value)} />
            <div className="t-h3">История</div>
            <div className="stack" style={{ gap: 6 }}>
              {open.events?.slice().reverse().map((e, i) => <div key={i} className="t-sm row" style={{ alignItems: 'flex-start' }}><span className="muted" style={{ width: 110, flexShrink: 0 }}>{fmtDate(e.created_at, true)}</span><span><b>{e.label}</b> · {e.message} <span className="muted">({e.actor})</span></span></div>)}
            </div>
            {Array.isArray(open.tickets) && open.tickets.length > 0 && <div className="t-sm">Обращений по заказу: <b>{open.tickets.length}</b> — см. «Поддержка»</div>}
          </div>
        )}
      </Sheet>
    </div>
  )
}
