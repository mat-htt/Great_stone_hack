import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Search } from 'lucide-react'
import { api, fmtDate, media } from '../api'
import { Avatar } from '../components/Mascots'
import { Head } from './Admin'

const STATE: Record<string, [string, string]> = {
  ok: ['Без замечаний', 'b-ok'], advised: ['Есть советы', 'b-warn'], declined: ['Оставлено как есть', 'b-soft'], ai: ['Улучшено AI', 'b-info'], ordered: ['В заказе', 'b-primary'],
}
const ACTOR: Record<string, string> = { user: 'Клиент', robot: 'Робот', cat: 'Кот', ai: 'AI-движок', system: 'Система', manager: 'Менеджер' }
const SCENARIOS = [
  ['Фото размыто', 'Робот советует «Чёткость». Клиент может принять или оставить — заказ не блокируется.'],
  ['Мало пикселей для формата', 'Робот считает dpi под конкретную рамку и предлагает нейросетевое увеличение FSRCNN ×2/×4 или рамку поменьше.'],
  ['Лицо попадает под обрез', 'YuNet находит лица, проверка видит, что лицо обрезано кадром, Кот предлагает «Лица в кадр».'],
  ['Дубли серийной съёмки', 'Перцептивный хеш находит почти одинаковые кадры, в книгу идёт лучший — остальные можно вернуть.'],
  ['Тёмный кадр', 'Совет «Магия»: мягкая автокоррекция. Отказ записывается в журнал.'],
  ['Пустая рамка', 'Единственное обязательное исправление — иначе в печати будет белое место.'],
  ['Внешняя нейросеть недоступна', 'Шлюз автоматически переключается на встроенный движок, в журнале AI-задач — «фолбэк».'],
  ['Нет сети у клиента', 'Черновик сохраняется на телефоне, фото ставятся в очередь, повтор заказа не создаёт дубль.'],
]

export default function Pipeline() {
  const { photoId } = useParams()
  const nav = useNavigate()
  const [stats, setStats] = useState<any>(null)
  const [items, setItems] = useState<any[]>([])
  const [q, setQ] = useState('')
  const [trace, setTrace] = useState<any>(null)
  const load = () => api<{ items: any[] }>(`/api/admin/pipeline/photos${q ? `?q=${encodeURIComponent(q)}` : ''}`).then((r) => setItems(r.items))
  useEffect(() => { api('/api/admin/pipeline/stats').then(setStats); load() }, [])
  useEffect(() => { if (photoId) api(`/api/admin/pipeline/photos/${photoId}`).then(setTrace); else setTrace(null) }, [photoId])

  return (
    <div>
      <Head title="Конвейер фото" crumbs={[{ label: 'Конвейер фото' }]} sub="Путь каждого снимка: загрузка → анализ → советы Кота и Робота → решение клиента → AI-обработка → макет → заказ." />
      {stats && (
        <div className="panel" style={{ marginBottom: 14 }}>
          <div className="row" style={{ gap: 0, overflowX: 'auto' }}>
            {stats.stages.map((s: any, i: number) => (
              <div key={s.id} style={{ flex: '1 0 110px', padding: '4px 14px', borderLeft: i ? '1px solid var(--line)' : 0 }}>
                <div className="t-xs muted">{s.title}</div><div style={{ fontSize: 24, fontWeight: 800 }} className="num">{s.value}</div>
              </div>
            ))}
          </div>
          {stats.advice.length > 0 && (
            <div className="row wrap t-sm" style={{ marginTop: 12, gap: 8 }}>
              {stats.advice.map((a: any) => <span key={a.code} className="badge b-soft">{a.code}: показан {a.shown} · принят {a.accepted} · отказ {a.declined}</span>)}
            </div>
          )}
        </div>
      )}
      <div className="panels" style={{ marginTop: 0 }}>
        <div className="panel span-5" style={{ padding: 10, maxHeight: '78vh', overflowY: 'auto' }}>
          <form className="row" style={{ padding: 6 }} onSubmit={(e) => { e.preventDefault(); load() }}>
            <input className="input sm" placeholder="Имя файла" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Поиск фото" />
            <button className="icon-btn plain" aria-label="Найти"><Search size={17} /></button>
          </form>
          {items.map((p) => (
            <button key={p.id} onClick={() => nav(`/admin/pipeline/${p.id}`)} className="list-row" style={{ borderRadius: 14, background: photoId === p.id ? 'var(--primary-soft)' : undefined }}>
              <img src={media(p.thumb)} alt="" style={{ width: 46, height: 46, borderRadius: 12, objectFit: 'cover' }} />
              <div className="grow"><div className="t-sm ellipsis" style={{ fontWeight: 650 }}>{p.filename}</div>
                <div className="t-xs muted ellipsis">{p.owner} · {p.events} событий{p.versions ? ` · ${p.versions} версии` : ''}</div></div>
              <span className={`badge ${STATE[p.state][1]}`}>{STATE[p.state][0]}</span>
            </button>
          ))}
        </div>
        <div className="span-7 stack" style={{ gap: 14 }}>
          {!trace ? (
            <div className="panel">
              <h2 className="t-h2" style={{ marginBottom: 12 }}>Какие ситуации бывают</h2>
              <div className="stack" style={{ gap: 10 }}>
                {SCENARIOS.map(([t, d]) => <div key={t}><b>{t}</b><div className="t-sm muted">{d}</div></div>)}
              </div>
              <div className="t-sm muted" style={{ marginTop: 14 }}>Выберите фото слева, чтобы увидеть его полную историю.</div>
            </div>
          ) : (
            <>
              <div className="panel row" style={{ alignItems: 'flex-start', gap: 16 }}>
                <div style={{ position: 'relative', width: 240, flexShrink: 0 }}>
                  <img src={media(trace.photo.thumb)} alt="" style={{ width: '100%', borderRadius: 14 }} />
                  {(trace.analysis.faces || []).map((f: any, i: number) => (
                    <div key={i} title={`лицо ${Math.round((f.score || 0) * 100)}%`} style={{ position: 'absolute', left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%`, border: '2px solid var(--primary)', borderRadius: 6 }} />
                  ))}
                </div>
                <div className="grow stack" style={{ gap: 8 }}>
                  <h2 className="t-h3 ellipsis">{trace.photo.filename}</h2>
                  <div className="t-sm muted">{trace.owner} · {trace.analysis.width}×{trace.analysis.height}</div>
                  <Metric label="Резкость" v={trace.analysis.sharpness} />
                  <Metric label="Экспозиция" v={1 - Math.min(1, Math.abs(trace.analysis.brightness - 128) / 110)} />
                  <Metric label="Оценка кадра" v={trace.analysis.score} />
                  <div className="t-sm">Лиц найдено: <b>{trace.analysis.faces.length}</b> · хеш <code className="kbd">{trace.analysis.phash}</code></div>
                  {trace.project && <div className="t-sm">Проект: <b>{trace.project.title}</b> ({trace.project.status}){trace.orders.map((o: any) => <span key={o.id}> · <Link className="link" to="/admin/orders">{o.number}</Link></span>)}</div>}
                </div>
              </div>
              {trace.versions.length > 0 && (
                <div className="panel">
                  <h3 className="t-h3" style={{ marginBottom: 10 }}>Версии после AI</h3>
                  <div className="row" style={{ overflowX: 'auto', gap: 10 }}>
                    <Version src={trace.photo.thumb} label="Оригинал" />
                    {trace.versions.map((v: any) => <Version key={v.id} src={v.thumb} label={v.ai_tool} />)}
                  </div>
                </div>
              )}
              <div className="panel">
                <h3 className="t-h3" style={{ marginBottom: 12 }}>История</h3>
                <div className="tl">
                  {trace.events.map((e: any) => (
                    <div key={e.id} className="tl-i done">
                      <div className="tl-dot" style={{ background: 'var(--surface)', overflow: 'hidden' }}>{['cat', 'robot'].includes(e.actor) ? <Avatar who={e.actor} size={26} /> : <span className="t-xs" style={{ color: 'var(--text)' }}>{ACTOR[e.actor]?.[0]}</span>}</div>
                      <div>
                        <div style={{ fontWeight: 650 }}>{e.title}</div>
                        <div className="t-xs muted">{ACTOR[e.actor] || e.actor} · {fmtDate(e.created_at, true)}{e.details?.model ? ` · ${e.details.model}` : ''}{e.details?.duration_ms ? ` · ${e.details.duration_ms} мс` : ''}{e.details?.optional ? ' · необязательно' : ''}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Metric({ label, v }: { label: string; v: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, v)) * 100)
  return <div><div className="between t-xs"><span className="muted">{label}</span><b>{pct}%</b></div><div className="progress"><div style={{ width: `${pct}%`, background: pct < 30 ? 'var(--warning)' : 'var(--success)' }} /></div></div>
}
function Version({ src, label }: { src: string; label: string }) {
  return <div style={{ flexShrink: 0, textAlign: 'center' }}><img src={media(src)} alt="" style={{ width: 110, height: 110, borderRadius: 12, objectFit: 'cover' }} /><div className="t-xs muted" style={{ marginTop: 4 }}>{label}</div></div>
}
