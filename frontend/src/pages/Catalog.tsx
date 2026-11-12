import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Search } from 'lucide-react'
import { api, money, type Category, type Product } from '../api'
import { productImage } from '../components/Mockup'
import { Dock, TopBar } from '../components/ui'

export default function Catalog() {
  const [params, setParams] = useSearchParams()
  const [items, setItems] = useState<Product[] | null>(null)
  const [cats, setCats] = useState<Category[]>([])
  const [q, setQ] = useState('')
  const [err, setErr] = useState('')
  const cat = params.get('c') || 'all'
  useEffect(() => { api<{ items: Product[]; categories: Category[] }>('/api/catalog').then((r) => { setItems(r.items); setCats(r.categories) }).catch((e) => setErr(e.message)) }, [])
  const shown = useMemo(() => (items || []).filter((p) => (cat === 'all' || p.category === cat) &&
    (!q || (p.title + p.subtitle).toLowerCase().includes(q.toLowerCase()))), [items, cat, q])

  return (
    <div className="screen">
      <TopBar title={<span className="t-h1">Каталог</span>} left />
      <main className="content">
        <label className="search" style={{ cursor: 'text' }}><Search size={20} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Кружка, фотокнига, открытка…" aria-label="Поиск по каталогу"
            style={{ border: 0, background: 'none', outline: 'none', flex: 1, fontSize: 16, color: 'var(--text)' }} />
        </label>
        <div className="hscroll" style={{ marginTop: 14 }}>
          <button className={`chip ${cat === 'all' ? 'active' : ''}`} onClick={() => setParams({})}>Всё</button>
          {cats.map((c) => <button key={c.id} className={`chip ${cat === c.id ? 'active' : ''}`} onClick={() => setParams({ c: c.id })}>{c.name}</button>)}
        </div>
        {err && <div className="card b-bad" role="alert">{err}</div>}
        <div className="grid2" style={{ marginTop: 4 }}>
          {!items && !err && [0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 230 }} />)}
          {shown.map((p) => (
            <Link key={p.id} to={`/catalog/${p.id}`} className="card p0" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="center" style={{ height: 150, background: 'radial-gradient(90% 90% at 50% 100%, var(--primary-soft), var(--surface-2))', position: 'relative' }}>
                <img src={productImage(p.id)} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                {p.badge && <span className="badge b-primary" style={{ position: 'absolute', top: 10, left: 10 }}>{p.badge}</span>}
              </div>
              <div style={{ padding: '12px 14px 14px' }}>
                <div className="t-h3" style={{ fontSize: 15.5 }}>{p.title}</div>
                <div className="t-xs muted" style={{ minHeight: 32, marginTop: 2 }}>{p.subtitle}</div>
                <div style={{ fontWeight: 800, marginTop: 6 }}>от {money(p.base_price_minor)}{p.kind === 'prints' ? '/шт' : ''}</div>
              </div>
            </Link>
          ))}
        </div>
        {items && !shown.length && <div className="empty muted">Ничего не нашли — попробуйте другое слово</div>}
      </main>
      <Dock />
    </div>
  )
}
