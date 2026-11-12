import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, money, track, type Product, type Quote } from '../api'
import { Say } from '../components/Mascots'
import { productImage } from '../components/Mockup'
import View3D from '../components/View3D'
import { byOccasion, DesignCard, OCCASIONS, TopBar, useDebounced, useDesigns } from '../components/ui'
import INSPO from '../inspo.json'
import { errorText } from '../store'

export default function ProductPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const designs = useDesigns()
  const [p, setP] = useState<Product | null>(null)
  const [opts, setOpts] = useState<Record<string, string>>({})
  const [pages, setPages] = useState(20)
  const [q, setQ] = useState<Quote | null>(null)
  const [err, setErr] = useState('')
  const [occ, setOcc] = useState('Все')
  const [view, setView] = useState<'3d' | 'photo'>('3d')
  const key = useDebounced(JSON.stringify({ opts, pages }), 200)

  useEffect(() => {
    api<Product>(`/api/catalog/${id}`).then((x) => {
      setP(x)
      setOpts({ size: x.specs.sizes[0]?.id, cover: x.specs.covers?.[0]?.id || '', paper: x.specs.papers?.[0]?.id || '', color: x.specs.colors?.[0]?.id || '', template: x.specs.template || 'clean' })
      setPages(x.specs.pages?.included || 20)
      track('product_view', { product: x.id })
    }).catch((e) => setErr(errorText(e)))
  }, [id])
  useEffect(() => {
    if (!p) return
    api<Quote>('/api/quote', { method: 'POST', json: { product_id: p.id, options: opts, pages, photos: p.kind === 'prints' ? 10 : 1 } }).then(setQ).catch(() => setQ(null))
  }, [key, p])

  if (err) return <div className="screen"><TopBar back /><div className="content"><div className="card">{err}</div></div></div>
  if (!p) return <div className="screen"><TopBar back /><div className="content"><div className="skeleton" style={{ height: 320 }} /></div></div>

  const designable = p.kind === 'book' || p.kind === 'card'
  const start = () => {
    const qs = new URLSearchParams({ product: p.id, ...Object.fromEntries(Object.entries(opts).filter(([, v]) => v)), ...(p.specs.shared ? { shared: '1' } : {}) })
    nav(`/create?${qs}`)
  }
  const Choice = ({ name, label, list }: { name: string; label: string; list?: { id: string; label: string; add_minor?: number }[] }) =>
    list && list.length > 1 ? (
      <div className="field"><span className="label">{label}</span>
        <div className="seg">{list.map((o) => <button key={o.id} className={opts[name] === o.id ? 'active' : ''} onClick={() => setOpts({ ...opts, [name]: o.id })}>{o.label}{o.add_minor ? ` +${money(o.add_minor)}` : ''}</button>)}</div>
      </div>
    ) : null

  return (
    <div className="screen">
      <TopBar back />
      <main className="content no-dock stack" style={{ gap: 20 }}>
        <div style={{ marginTop: -6, position: 'relative' }}>
          {view === '3d'
            ? <View3D product={p} options={opts} images={[]} design={designs.find((d) => d.id === opts.template)} title={p.title} height={320} />
            : <img src={productImage(p.id)} alt={p.title} style={{ width: '100%', height: 320, objectFit: 'cover', borderRadius: 'var(--r-xl)', display: 'block' }} />}
          {(
            <div className="seg glass" style={{ position: 'absolute', top: 10, left: 10, width: 'auto', padding: 3 }}>
              <button className={view === '3d' ? 'active' : ''} onClick={() => setView('3d')}>3D</button>
              <button className={view === 'photo' ? 'active' : ''} onClick={() => setView('photo')}>Фото</button>
            </div>
          )}
        </div>
        <div>
          <h1 className="t-h1">{p.title}</h1>
          <p className="muted" style={{ margin: '8px 0 0' }}>{p.description}</p>
          <div className="row t-sm muted" style={{ marginTop: 10, gap: 16 }}><span>Производство {p.production_days} дн.</span><span>Доставка по Беларуси</span></div>
        </div>
        <Choice name="size" label="Формат" list={p.specs.sizes} />
        <Choice name="cover" label={p.kind === 'book' ? 'Обложка' : 'Вариант'} list={p.specs.covers} />
        <Choice name="paper" label="Бумага" list={p.specs.papers} />
        {p.specs.pages && (
          <div className="field"><span className="label">Страниц: {pages} (в цене {p.specs.pages.included})</span>
            <input type="range" min={p.specs.pages.min} max={p.specs.pages.max} step={2} value={pages} onChange={(e) => setPages(+e.target.value)} aria-label="Число страниц" />
          </div>
        )}
        {p.specs.colors && p.specs.colors.length > 1 && (p.kind !== 'book' || ['fabric', 'leather'].includes(opts.cover)) && (
          <div className="field"><span className="label">Цвет: {p.specs.colors.find((c) => c.id === opts.color)?.label}</span>
            <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
              {p.specs.colors.map((c) => (
                <button key={c.id} onClick={() => setOpts({ ...opts, color: c.id })} aria-label={c.label} aria-pressed={opts.color === c.id} title={c.label}
                  style={{ width: 38, height: 38, borderRadius: '50%', border: 0, cursor: 'pointer', background: c.hex, boxShadow: `inset 0 0 0 1px rgba(0,0,0,.15), 0 0 0 ${opts.color === c.id ? 3 : 0}px var(--surface), 0 0 0 ${opts.color === c.id ? 5.5 : 0}px var(--primary)`, transition: 'box-shadow .2s' }} />
              ))}
            </div>
          </div>
        )}
        {designable && designs.length > 0 && (
          <div className="field"><span className="label">Дизайн</span>
            <div className="hscroll" style={{ gap: 8 }}>{OCCASIONS.map((o) => <button key={o} className={`chip ${occ === o ? 'active' : ''}`} onClick={() => setOcc(o)}>{o[0].toUpperCase() + o.slice(1)}</button>)}</div>
            <div className="hscroll" style={{ gap: 12 }}>
              {byOccasion(designs, occ).map((d) => <div key={d.id} style={{ width: 112 }}><DesignCard d={d} on={opts.template === d.id} onClick={() => setOpts({ ...opts, template: d.id })} /></div>)}
            </div>
          </div>
        )}
        {p.kind === 'book' && (
          <div className="field"><span className="label">Идеи из каталога picPac</span>
            <div className="hscroll" style={{ gap: 10 }}>
              {INSPO.map((i) => (
                <button key={i.design} className="inspo" onClick={() => { setOpts({ ...opts, template: i.design }); setOcc('Все') }} aria-label={`Взять стиль «${i.title}»`}>
                  <img src={i.img} alt="" loading="lazy" /><span>{i.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <Say who={p.specs.shared ? 'cat' : 'robot'}>
          {p.specs.shared ? 'Создайте альбом и отправьте ссылку в чат — каждый добавит свои фото, а я соберу общую книгу.'
            : 'Перед заказом проверю каждое фото и подскажу, что можно улучшить. Улучшать или нет — решаете вы.'}
        </Say>
      </main>
      <div className="bottom-cta">
        <button className="btn btn-primary btn-lg btn-block" onClick={start}>
          {p.specs.shared ? 'Создать общий альбом' : 'Выбрать фото'}{q ? ` · ${money(q.subtotal_minor)}` : ''}
        </button>
      </div>
    </div>
  )
}
