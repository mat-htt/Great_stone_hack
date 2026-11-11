import { useEffect, useState } from 'react'
import { api, fmtDate } from '../api'
import { Head } from './Admin'

export default function Audit() {
  const [items, setItems] = useState<any[]>([])
  const [action, setAction] = useState('')
  const [result, setResult] = useState('')
  useEffect(() => {
    const q = new URLSearchParams({ ...(action ? { action } : {}), ...(result ? { result } : {}) })
    api<{ items: any[] }>(`/api/admin/audit?${q}`).then((r) => setItems(r.items))
  }, [action, result])
  return (
    <div>
      <Head title="Журнал аудита" sub="Кто, когда, что сделал, с каким объектом и результатом. Включая отказы в доступе." />
      <div className="row wrap" style={{ marginBottom: 14 }}>
        <input className="input sm" style={{ width: 240 }} placeholder="Действие (order, ai, login…)" value={action} onChange={(e) => setAction(e.target.value)} aria-label="Фильтр действия" />
        {[['', 'Все'], ['ok', 'Успех'], ['denied', 'Отказано'], ['error', 'Ошибки']].map(([k, l]) => <button key={k} className={`chip ${result === k ? 'active' : ''}`} onClick={() => setResult(k)}>{l}</button>)}
      </div>
      <div className="panel" style={{ padding: 0, overflow: 'auto' }}>
        <table className="t">
          <thead><tr><th>Время</th><th>Пользователь</th><th>Роль</th><th>Действие</th><th>Объект</th><th>Результат</th><th>Детали</th></tr></thead>
          <tbody>{items.map((a) => (
            <tr key={a.id}>
              <td className="small">{fmtDate(a.created_at, true)}</td><td className="small">{a.user}</td><td className="small">{a.role}</td>
              <td><code className="kbd">{a.action}</code></td><td className="small">{a.object}</td>
              <td><span className={`pill ${a.result === 'ok' ? 'pill-ok' : a.result === 'denied' ? 'pill-bad' : 'pill-warn'}`}>{a.result}</span></td>
              <td className="tiny muted" style={{ maxWidth: 280, wordBreak: 'break-word' }}>{Object.keys(a.details || {}).length ? JSON.stringify(a.details) : ''}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  )
}
