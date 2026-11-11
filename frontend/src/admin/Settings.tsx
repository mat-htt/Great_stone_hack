import { useEffect, useState } from 'react'
import { api, fmtDate, money } from '../api'
import { errorText, useApp } from '../store'
import { Head } from './Admin'

export default function Settings() {
  const { toast } = useApp()
  const [cat, setCat] = useState<any>(null)
  const [users, setUsers] = useState<any>(null)
  const [sim, setSim] = useState<any>(null)
  const load = () => {
    api('/api/admin/catalog').then(setCat)
    api('/api/admin/users').then(setUsers)
    api('/api/admin/simulator').then(setSim)
  }
  useEffect(() => { load() }, [])
  const patch = async (id: string, body: any) => {
    try { await api(`/api/admin/catalog/${id}`, { method: 'PUT', json: body }); load(); toast({ title: 'Каталог обновлён', body: 'Приложение получит изменения через API сразу' }) }
    catch (e) { toast({ title: errorText(e), kind: 'bad' }) }
  }
  const setSimState = async (body: any) => { setSim(await api('/api/admin/simulator', { method: 'PUT', json: { ...sim, ...body } })) }
  return (
    <div>
      <Head title="Настройки" sub="Каталог и цены (отдаются в приложение через API), демо-линия производства, пользователи." />
      <div className="panels" style={{ marginTop: 0 }}>
        <div className="panel span-7">
          <div className="h3" style={{ marginBottom: 10 }}>Каталог</div>
          <table className="t">
            <thead><tr><th>Продукт</th><th>Базовая цена, BYN</th><th>Дней</th><th>Активен</th></tr></thead>
            <tbody>{cat?.products.map((p: any) => (
              <tr key={p.id}><td><b>{p.title}</b><div className="tiny muted">{p.id}</div></td>
                <td><input className="input sm" style={{ width: 110 }} type="number" step="0.01" min="0.01" defaultValue={(p.base_price_minor / 100).toFixed(2)}
                  onBlur={(e) => { const v = Math.round(parseFloat(e.target.value) * 100); if (v && v !== p.base_price_minor) patch(p.id, { base_price_minor: v }) }} aria-label="Цена" /></td>
                <td className="num">{p.production_days}</td>
                <td><button className={`switch ${p.active ? 'on' : ''}`} onClick={() => patch(p.id, { active: !p.active })} aria-label="Активен" /></td></tr>
            ))}</tbody>
          </table>
          <div className="h3" style={{ margin: '18px 0 8px' }}>Промокоды</div>
          <div className="stack small" style={{ gap: 6 }}>{cat?.promos.map((c: any) => <div key={c.code} className="row"><code className="kbd">{c.code}</code><span className="grow">{c.description}</span><span className="muted">{c.kind === 'percent' ? `${c.value}%` : c.kind === 'fixed' ? money(c.value) : 'доставка'}</span></div>)}</div>
        </div>
        <div className="panel span-5 stack">
          <div className="h3">Демо-линия производства</div>
          <div className="small muted">Имитирует сканирование штрих-кодов на этапах: печать → ламинация → переплёт → ОТК → доставка. Двигает только реальные (не синтетические) заказы.</div>
          {sim && (
            <div className="row">
              <button className={`switch ${sim.enabled ? 'on' : ''}`} onClick={() => setSimState({ enabled: !sim.enabled })} aria-label="Демо-линия" />
              <span className="grow">{sim.enabled ? 'Включена' : 'Выключена'}</span>
              <select className="input sm" style={{ width: 130 }} value={sim.interval} onChange={(e) => setSimState({ interval: +e.target.value })} aria-label="Интервал">
                {[10, 25, 60, 300].map((s) => <option key={s} value={s}>каждые {s} с</option>)}
              </select>
            </div>
          )}
          <div className="divider" />
          <div className="h3">Пользователи</div>
          <div className="small muted">Синтетических клиентов для аналитики: {users?.synthetic}</div>
          <div className="stack small" style={{ gap: 6, maxHeight: 320, overflowY: 'auto' }}>
            {users?.items.map((u: any) => <div key={u.id} className="row"><span className={`pill ${u.role === 'admin' ? 'pill-dark' : u.role === 'operator' ? 'pill-info' : 'pill-soft'}`}>{u.role}</span><span className="grow">{u.email || (u.is_guest ? 'гость' : '—')} {u.deleted && <span className="muted">(удалён)</span>}</span><span className="tiny muted">{fmtDate(u.created_at)}</span></div>)}
          </div>
        </div>
      </div>
    </div>
  )
}
