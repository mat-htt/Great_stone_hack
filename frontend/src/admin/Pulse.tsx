import { useEffect, useState } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Database, Plus, Sparkles } from 'lucide-react'
import { api, fmtDate, money } from '../api'
import { Robot } from '../components/Mascots'
import { Sheet } from '../components/ui'
import { errorText, useApp } from '../store'
import { Head } from './Admin'
import { DecisionForm } from './Decisions'

interface Kpi { id: string; title: string; value: number; unit: string; formula: string; source: string; status: string | null; target: number | null
  updated_at: string; format: string; prev: number; delta: number | null }

const ORDER = ['revenue', 'orders', 'avg_check', 'margin', 'on_time', 'defect', 'new_clients', 'active_clients', 'repeat', 'sla', 'conversion', 'load', 'ai_saved', 'ai_saved_byn']
const GOOD_DOWN = new Set(['defect', 'frt', 'load'])
const tooltipStyle = { borderRadius: 12, border: 0, boxShadow: '0 8px 24px rgba(0,0,0,.12)', fontFamily: 'Jost' }

export const fmtKpi = (k: Kpi, v = k.value) => k.format === 'money' ? money(v) : `${v.toLocaleString('ru-RU')} ${k.unit}`

export default function Pulse() {
  const { toast } = useApp()
  const [days, setDays] = useState(30)
  const [product, setProduct] = useState('')
  const [channel, setChannel] = useState('')
  const [d, setD] = useState<any>(null)
  const [kpi, setKpi] = useState<Kpi | null>(null)
  const [decision, setDecision] = useState<any>(null)
  const [products, setProducts] = useState<any[]>([])

  useEffect(() => { api<{ items: any[] }>('/api/catalog').then((r) => setProducts(r.items)) }, [])
  useEffect(() => {
    setD(null)
    const q = new URLSearchParams({ days: String(days), ...(product ? { product } : {}), ...(channel ? { channel } : {}) })
    api(`/api/admin/overview?${q}`).then(setD).catch((e) => toast({ title: errorText(e), kind: 'bad' }))
  }, [days, product, channel])

  return (
    <div>
      <Head title="Пульс розницы" sub="Заказы, клиенты, производство и AI — в одном окне. Клик по KPI — формула и источник."
        right={
          <div className="row wrap">
            <div className="seg" style={{ background: 'var(--fill)' }}>
              {[7, 30, 90, 365].map((x) => <button key={x} className={days === x ? 'active' : ''} onClick={() => setDays(x)} style={{ padding: '0 12px' }}>{x === 365 ? 'Год' : `${x} д`}</button>)}
            </div>
            <select className="input sm" style={{ width: 190 }} value={product} onChange={(e) => setProduct(e.target.value)} aria-label="Продукт">
              <option value="">Все продукты</option>{products.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
            <select className="input sm" style={{ width: 150 }} value={channel} onChange={(e) => setChannel(e.target.value)} aria-label="Канал">
              <option value="">Все каналы</option>{['app', 'web', 'instagram', 'partner'].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        } />
      {!d ? <div className="kpi-grid">{Array.from({ length: 12 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 104 }} />)}</div> : (
        <>
          {d.alerts.length > 0 && (
            <div className="panel row wrap" style={{ marginBottom: 14, background: 'var(--primary-soft)', boxShadow: 'none', gap: 14 }}>
              <Robot size={44} mood="alert" />
              <div className="grow stack" style={{ gap: 4 }}>
                {d.alerts.map((a: any) => (
                  <div key={a.kpi} className="row wrap" style={{ gap: 8 }}><AlertTriangle size={16} color="var(--primary)" /><span className="grow">{a.message}</span>
                    <button className="btn btn-sm btn-primary" onClick={() => setDecision({ kpi: a.kpi, problem: a.message, priority: 'high', status: 'new' })}><Plus size={14} /> Решение</button></div>
                ))}
              </div>
            </div>
          )}
          <div className="kpi-grid">
            {ORDER.filter((k) => d.kpis[k]).map((k) => {
              const x: Kpi = d.kpis[k]
              const up = (x.delta ?? 0) >= 0
              const good = GOOD_DOWN.has(k) ? !up : up
              return (
                <button key={k} className="kpi" onClick={() => setKpi(x)}>
                  {x.status && <span className={`st st-${x.status}`} />}
                  <div className="t-sm muted">{x.title}</div>
                  <div className="v num">{fmtKpi(x)}</div>
                  <div className="row t-sm" style={{ gap: 6 }}>
                    {x.delta !== null && <span className="row" style={{ gap: 2, color: good ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>{up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{Math.abs(x.delta)}%</span>}
                    {x.target !== null && <span className="muted">цель {x.target}{x.unit}</span>}
                  </div>
                </button>
              )
            })}
          </div>
          <div className="panels">
            <div className="panel span-8">
              <div className="between"><div className="t-h3">Оборот и заказы по дням</div><span className="t-sm muted">BYN</span></div>
              <div style={{ height: 260, marginTop: 10 }}>
                <ResponsiveContainer>
                  <AreaChart data={d.series.map((s: any) => ({ ...s, revenue: s.revenue / 100 }))}>
                    <defs><linearGradient id="rv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--primary)" stopOpacity={0.35} /><stop offset="1" stopColor="var(--primary)" stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid stroke="rgba(54,76,73,.08)" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={(v) => v.slice(5).split('-').reverse().join('.')} tick={{ fontSize: 11 }} minTickGap={24} />
                    <YAxis tick={{ fontSize: 11 }} width={44} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: any, n: any) => n === 'revenue' ? [`${v.toFixed(2)} BYN`, 'Оборот'] : [v, 'Заказы']} />
                    <Area type="monotone" dataKey="revenue" stroke="var(--primary)" strokeWidth={2.5} fill="url(#rv)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="panel span-4">
              <div className="t-h3">Воронка приложения</div>
              <div className="stack" style={{ gap: 8, marginTop: 12 }}>
                {d.funnel.map((f: any, i: number) => {
                  const max = d.funnel[0].value || 1
                  const prev = i ? d.funnel[i - 1].value : f.value
                  return (
                    <div key={f.id}>
                      <div className="between t-sm"><span>{f.title}</span><b className="num">{f.value}{i > 0 && prev ? <span className="muted" style={{ fontWeight: 400 }}> · {Math.round(f.value / prev * 100)}%</span> : null}</b></div>
                      <div className="progress" style={{ height: 10 }}><div style={{ width: `${(f.value / max) * 100}%`, background: i === d.funnel.length - 1 ? 'var(--text)' : 'var(--primary)' }} /></div>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="panel span-6">
              <div className="between"><div className="t-h3">Прогноз спроса и мощность · 4 недели</div><span className="t-sm muted">заказов/нед</span></div>
              <div style={{ height: 230, marginTop: 10 }}>
                <ResponsiveContainer>
                  <ComposedChart data={d.forecast}>
                    <CartesianGrid stroke="rgba(54,76,73,.08)" vertical={false} />
                    <XAxis dataKey="week" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} width={30} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: any, n: any) => [v, n === 'forecast' ? 'Прогноз' : 'Мощность']} />
                    <Bar dataKey="forecast" radius={[8, 8, 0, 0]}>{d.forecast.map((w: any, i: number) => <Cell key={i} fill={w.deficit > 0 ? 'var(--primary)' : 'var(--text)'} />)}</Bar>
                    <Line dataKey="capacity" stroke="var(--warning)" strokeWidth={2.5} strokeDasharray="6 4" dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="t-sm muted">Метод: тот же период год назад × тренд последних 8 недель ({d.forecast[0]?.trend}). Красным — недели с дефицитом.</div>
            </div>
            <div className="panel span-6">
              <div className="t-h3">Производство сейчас</div>
              <div style={{ height: 230, marginTop: 10 }}>
                <ResponsiveContainer>
                  <BarChart data={d.queue} layout="vertical" margin={{ left: 10 }}>
                    <XAxis type="number" hide /><YAxis type="category" dataKey="title" width={110} tick={{ fontSize: 12 }} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [v, 'заказов']} />
                    <Bar dataKey="value" fill="var(--text)" radius={[0, 8, 8, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="panel span-6">
              <div className="t-h3">Выручка по продуктам</div>
              <div className="stack" style={{ gap: 10, marginTop: 12 }}>
                {d.products.map((p: any) => {
                  const total = d.products.reduce((a: number, b: any) => a + b.value, 0) || 1
                  return (
                    <div key={p.title}>
                      <div className="between t-sm"><span>{p.title}</span><b className="num">{money(p.value)} · {Math.round(p.value / total * 100)}%</b></div>
                      <div className="progress"><div style={{ width: `${p.value / total * 100}%`, background: 'var(--text)' }} /></div>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="panel span-6">
              <div className="row"><Database size={18} color="var(--text)" /><div className="t-h3">Источники данных и свежесть</div></div>
              <table className="t" style={{ marginTop: 8 }}>
                <thead><tr><th>Источник</th><th>Строк</th><th>Обновлён</th><th>Дубли</th></tr></thead>
                <tbody>{d.sources.map((s: any) => (
                  <tr key={s.id}><td>{s.title}</td><td className="num">{s.rows.toLocaleString('ru-RU')}</td><td className="t-sm">{fmtDate(s.fresh_at, true)}</td>
                    <td>{s.duplicates ? <span className="badge b-bad">{s.duplicates}</span> : <span className="badge b-ok">0</span>}</td></tr>
                ))}</tbody>
              </table>
              <div className="row t-sm" style={{ marginTop: 10, gap: 6 }}><Sparkles size={14} color="var(--primary)" /> AI-шлюз за период сэкономил {d.kpis.ai_saved.value} ч ручной ретуши ≈ {money(d.kpis.ai_saved_byn.value)}</div>
            </div>
          </div>
        </>
      )}

      <Sheet open={!!kpi} onClose={() => setKpi(null)} label="KPI">
        {kpi && (
          <div className="stack">
            <div className="t-h2">{kpi.title}</div>
            <div className="t-display num">{fmtKpi(kpi)}</div>
            <div className="card flat stack t-sm" style={{ gap: 6 }}>
              <div><b>Формула:</b> {kpi.formula}</div>
              <div><b>Источник:</b> {kpi.source}</div>
              <div><b>Предыдущий период:</b> {fmtKpi(kpi, kpi.prev)} {kpi.delta !== null && `(${kpi.delta > 0 ? '+' : ''}${kpi.delta}%)`}</div>
              {kpi.target !== null && <div><b>Цель:</b> {kpi.target}{kpi.unit}</div>}
              <div><b>Обновлено:</b> {fmtDate(kpi.updated_at, true)}</div>
            </div>
            {kpi.status === 'red' && <button className="btn btn-primary" onClick={() => { setDecision({ kpi: kpi.id, problem: `${kpi.title}: ${fmtKpi(kpi)} при цели ${kpi.target}${kpi.unit}`, priority: 'high', status: 'new' }); setKpi(null) }}>Создать карточку решения</button>}
          </div>
        )}
      </Sheet>
      <Sheet open={!!decision} onClose={() => setDecision(null)} label="Решение">
        {decision && <DecisionForm initial={decision} onDone={() => { setDecision(null); toast({ title: 'Решение добавлено в реестр', mascot: 'robot' }) }} />}
      </Sheet>
    </div>
  )
}
