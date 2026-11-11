import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Clock, FileImage, Printer, Truck } from 'lucide-react'
import { api, money, track, type Product, type Quote } from '../api'
import { Say } from '../components/Mascots'
import { TopBar, useDebounced } from '../components/ui'
import { errorText, useApp } from '../store'
import { ProductArt } from './Home'

export default function ProductPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const { toast } = useApp()
  const [p, setP] = useState<Product | null>(null)
  const [opts, setOpts] = useState<Record<string, string>>({})
  const [pages, setPages] = useState(20)
  const [q, setQ] = useState<Quote | null>(null)
  const [err, setErr] = useState('')
  const dOpts = useDebounced(JSON.stringify({ opts, pages }), 250)

  useEffect(() => {
    api<Product>(`/api/catalog/${id}`).then((x) => {
      setP(x)
      setOpts({ size: x.specs.sizes[0]?.id, cover: x.specs.covers?.[0]?.id || '', paper: x.specs.papers?.[0]?.id || '' })
      setPages(x.specs.pages?.included || 20)
      track('product_view', { product: x.id })
    }).catch((e) => setErr(errorText(e)))
  }, [id])

  useEffect(() => {
    if (!p) return
    api<Quote>('/api/quote', { method: 'POST', json: { product_id: p.id, options: opts, pages, photos: p.kind === 'prints' ? 10 : 30 } })
      .then(setQ).catch(() => setQ(null))
  }, [dOpts, p])

  if (err) return <div className="phone"><TopBar back title="Продукт" /><div className="page"><div className="card pill-bad">{err}</div></div></div>
  if (!p) return <div className="phone"><TopBar back /><div className="page"><div className="skeleton" style={{ height: 300 }} /></div></div>

  const start = () => {
    if (p.specs.shared) return nav(`/create?product=${p.id}&size=${opts.size}&shared=1`)
    nav(`/create?product=${p.id}&size=${opts.size}&cover=${opts.cover}&paper=${opts.paper}`)
  }
  const Opt = ({ name, label, list }: { name: string; label: string; list?: { id: string; label: string; add_minor?: number }[] }) =>
    list && list.length > 1 ? (
      <div className="field">
        <label>{label}</label>
        <div className="row wrap" style={{ gap: 8 }}>
          {list.map((o) => (
            <button key={o.id} className={`chip ${opts[name] === o.id ? 'active' : ''}`} onClick={() => setOpts({ ...opts, [name]: o.id })} aria-pressed={opts[name] === o.id}>
              {o.label}{o.add_minor ? ` +${money(o.add_minor)}` : ''}
            </button>
          ))}
        </div>
      </div>
    ) : null

  return (
    <div className="phone">
      <TopBar back title={p.title} />
      <main className="page no-tab stack" style={{ gap: 18 }}>
        <ProductArt product={p} height={260} />
        <div>
          <h1 className="h1">{p.title}</h1>
          <p className="muted" style={{ margin: '6px 0 0' }}>{p.description}</p>
        </div>
        <div className="row wrap small muted" style={{ gap: 14 }}>
          <span className="row" style={{ gap: 6 }}><Printer size={16} /> Производство {p.production_days} {p.production_days === 1 ? 'день' : 'дня'}</span>
          <span className="row" style={{ gap: 6 }}><Truck size={16} /> Доставка 0–3 дня</span>
          <span className="row" style={{ gap: 6 }}><Clock size={16} /> Сборка ~5 минут</span>
        </div>
        <Opt name="size" label="Формат" list={p.specs.sizes} />
        <Opt name="cover" label="Обложка" list={p.specs.covers} />
        <Opt name="paper" label="Бумага" list={p.specs.papers} />
        {p.specs.pages && (
          <div className="field">
            <label htmlFor="pages">Страниц: {pages} (в цене {p.specs.pages.included})</label>
            <input id="pages" type="range" min={p.specs.pages.min} max={p.specs.pages.max} step={2} value={pages} onChange={(e) => setPages(+e.target.value)} style={{ accentColor: 'var(--coral)' }} />
          </div>
        )}
        {p.specs.requirements && (
          <div className="card flat row small" style={{ alignItems: 'flex-start' }}><FileImage size={18} color="var(--coral)" style={{ flexShrink: 0, marginTop: 2 }} /><span>{p.specs.requirements}</span></div>
        )}
        <Say who={p.specs.shared ? 'cat' : 'robot'} hand={!!p.specs.shared}>
          {p.specs.shared ? 'Создайте альбом и пришлите ссылку в чат класса — каждый загрузит свои фото, а я соберу всё в одну книгу!'
            : 'Не переживайте о качестве: перед заказом я проверю каждое фото и подскажу, что улучшить.'}
        </Say>
      </main>
      <div className="fixed-cta">
        <button className="btn btn-primary btn-lg btn-block" onClick={start}>
          {p.specs.shared ? 'Создать общий альбом' : 'Выбрать фото'}{q ? ` · ${money(q.subtotal_minor)}` : ''}
        </button>
      </div>
    </div>
  )
}
