import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { api, fmtDate } from '../api'
import { Sheet } from '../components/ui'
import { errorText, useApp } from '../store'
import { Head } from './Admin'

const STATUS: Record<string, string> = { new: 'Новое', in_progress: 'В работе', done: 'Выполнено', cancelled: 'Отменено' }
const PRIO: Record<string, string> = { high: 'Высокий', medium: 'Средний', low: 'Низкий' }

export default function Decisions() {
  const [items, setItems] = useState<any[]>([])
  const [edit, setEdit] = useState<any>(null)
  const load = () => api<{ items: any[] }>('/api/admin/decisions').then((r) => setItems(r.items))
  useEffect(() => { load() }, [])
  return (
    <div>
      <Head title="Реестр решений" sub="От сигнала к действию: проблема → причина → действие → владелец → срок. Связано с KPI «Пульса»."
        right={<button className="btn btn-dark btn-sm" onClick={() => setEdit({ kpi: '', problem: '', priority: 'medium', status: 'new' })}><Plus size={15} /> Решение</button>} />
      <div className="panel" style={{ padding: 0, overflow: 'auto' }}>
        <table className="t">
          <thead><tr><th>Проблема</th><th>Действие</th><th>Владелец</th><th>Срок</th><th>Приоритет</th><th>Статус</th></tr></thead>
          <tbody>
            {items.map((d) => (
              <tr key={d.id} onClick={() => setEdit(d)} style={{ cursor: 'pointer' }}>
                <td><b>{d.problem}</b><div className="tiny muted">{d.kpi} · {d.cause}</div></td>
                <td className="small">{d.action || '—'}</td><td className="small">{d.owner || '—'}</td>
                <td className="small">{d.due ? fmtDate(d.due) : '—'}</td>
                <td><span className={`pill ${d.priority === 'high' ? 'pill-bad' : d.priority === 'medium' ? 'pill-warn' : 'pill-soft'}`}>{PRIO[d.priority]}</span></td>
                <td><span className={`pill ${d.status === 'done' ? 'pill-ok' : 'pill-info'}`}>{STATUS[d.status]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Sheet open={!!edit} onClose={() => setEdit(null)} label="Решение">
        {edit && <DecisionForm initial={edit} onDone={() => { setEdit(null); load() }} />}
      </Sheet>
    </div>
  )
}

export function DecisionForm({ initial, onDone }: { initial: any; onDone: () => void }) {
  const { toast } = useApp()
  const [f, setF] = useState<any>({ impact: '', cause: '', action: '', owner: '', ...initial, due: initial.due ? initial.due.slice(0, 10) : '' })
  const save = async () => {
    try {
      const body = { ...f, due: f.due ? new Date(f.due + 'T18:00:00+03:00').toISOString() : null }
      delete body.id; delete body.history; delete body.created_at
      await api(initial.id ? `/api/admin/decisions/${initial.id}` : '/api/admin/decisions', { method: initial.id ? 'PUT' : 'POST', json: body })
      onDone()
    } catch (e) { toast({ title: errorText(e), kind: 'bad' }) }
  }
  const F = (k: string, label: string) => <div className="field"><label>{label}</label><input className="input" value={f[k] || ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); save() }}>
      <div className="h2">{initial.id ? 'Карточка решения' : 'Новое решение'}</div>
      {F('problem', 'Проблема')}{F('impact', 'Влияние')}{F('cause', 'Причина')}{F('action', 'Действие')}{F('owner', 'Владелец')}
      <div className="row">
        <div className="field grow"><label>Срок</label><input className="input" type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></div>
        <div className="field grow"><label>Приоритет</label><select className="input" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>{Object.entries(PRIO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div className="field grow"><label>Статус</label><select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      </div>
      <button className="btn btn-primary btn-block">Сохранить</button>
      {initial.history?.length > 0 && (
        <div className="stack small" style={{ gap: 4 }}><b>История</b>{initial.history.slice().reverse().map((h: any, i: number) => <div key={i} className="muted">{fmtDate(h.at, true)} · {h.by} · {h.change}</div>)}</div>
      )}
    </form>
  )
}
