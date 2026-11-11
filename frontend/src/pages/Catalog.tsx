import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Clock } from 'lucide-react'
import { api, money, type Product } from '../api'
import { TabBar, TopBar } from '../components/ui'
import { ProductArt } from './Home'

export default function Catalog() {
  const [items, setItems] = useState<Product[] | null>(null)
  const [error, setError] = useState('')
  const [cat, setCat] = useState('Все')
  useEffect(() => { api<{ items: Product[] }>('/api/catalog').then((r) => setItems(r.items)).catch((e) => setError(e.message)) }, [])
  const cats = ['Все', ...Array.from(new Set((items || []).map((p) => p.category)))]
  const shown = (items || []).filter((p) => cat === 'Все' || p.category === cat)
  return (
    <div className="phone">
      <TopBar title="Каталог" left />
      <main className="page">
        <div className="hscroll" style={{ paddingTop: 0 }}>
          {cats.map((c) => <button key={c} className={`chip ${c === cat ? 'active' : ''}`} onClick={() => setCat(c)}>{c}</button>)}
        </div>
        {error && <div className="card pill-bad" role="alert">{error}</div>}
        {!items && !error && <div className="grid2" style={{ marginTop: 8 }}>{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 220 }} />)}</div>}
        <div className="grid2" style={{ marginTop: 8 }}>
          {shown.map((p, i) => (
            <motion.div key={p.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <Link to={`/catalog/${p.id}`} style={{ display: 'block' }}>
                <ProductArt product={p} height={168} />
                <div className="h3" style={{ marginTop: 10 }}>{p.title}</div>
                <div className="small muted" style={{ minHeight: 36 }}>{p.subtitle}</div>
                <div className="between" style={{ marginTop: 4 }}>
                  <b>{p.kind === 'prints' ? `от ${money(p.base_price_minor)}/шт` : `от ${money(p.base_price_minor)}`}</b>
                  <span className="small muted row" style={{ gap: 4 }}><Clock size={13} />{p.production_days} д.</span>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </main>
      <TabBar />
    </div>
  )
}
