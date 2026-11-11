import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Link, useNavigate } from 'react-router-dom'
import { Bell, ChevronRight, Sparkles, Users, Wand2 } from 'lucide-react'
import { api, fmtDate, media, money, track, type Memory, type Order, type Product, type Project } from '../api'
import { Cat, Logo, Robot, Say } from '../components/Mascots'
import { Img, MiniProgress, Sheet, TabBar } from '../components/ui'
import { errorText, useApp } from '../store'

export default function Home() {
  const { user, unread, toast, refreshNotifications } = useApp()
  const nav = useNavigate()
  const [memories, setMemories] = useState<Memory[] | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [drafts, setDrafts] = useState<Project[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [notifs, setNotifs] = useState<any[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    api<{ memories: Memory[] }>('/api/memories').then((r) => setMemories(r.memories)).catch(() => setMemories([]))
    api<{ items: Order[] }>('/api/orders').then((r) => setOrders(r.items)).catch(() => {})
    api<{ items: Project[] }>('/api/projects').then((r) => setDrafts(r.items.filter((p) => p.status === 'draft'))).catch(() => {})
    api<{ items: Product[] }>('/api/catalog').then((r) => setProducts(r.items)).catch(() => {})
  }, [])

  const active = orders.find((o) => !['completed', 'cancelled'].includes(o.status))

  const fromMemory = async (m: Memory) => {
    setBusy(m.id)
    track('memory_opened', { count: m.count })
    try {
      const p = await api<Project>('/api/projects', { method: 'POST', json: { product_id: 'photobook-premium', photo_ids: m.photo_ids, title: m.title, auto: true } })
      track('project_created', { from: 'memory' })
      nav(`/magic/${p.id}`)
    } catch (e) { toast({ title: errorText(e), kind: 'bad' }) } finally { setBusy(null) }
  }

  const skinemsya = async () => {
    setBusy('shared')
    try {
      const p = await api<Project>('/api/projects', { method: 'POST', json: { product_id: 'graduation', title: 'Выпускной 11 «Б»', auto: false } })
      await api(`/api/projects/${p.id}/share`, { method: 'POST' })
      track('share_created')
      nav(`/editor/${p.id}?share=1`)
    } catch (e) { toast({ title: errorText(e), kind: 'bad' }) } finally { setBusy(null) }
  }

  const openNotifs = () => {
    api<{ items: any[] }>('/api/notifications').then((r) => setNotifs(r.items))
    api('/api/notifications/read', { method: 'POST' }).then(refreshNotifications)
  }

  const firstName = user?.is_guest ? '' : `, ${user?.name?.split(' ')[0]}`
  return (
    <div className="phone">
      <header className="topbar left">
        <div className="title"><Logo size={28} /></div>
        <button className="icon-btn" aria-label="Уведомления" onClick={openNotifs} style={{ position: 'relative' }}>
          <Bell size={20} />
          {unread > 0 && <span style={{ position: 'absolute', top: 7, right: 8, width: 9, height: 9, borderRadius: 5, background: 'var(--coral)', boxShadow: '0 0 0 2px var(--paper)' }} />}
        </button>
      </header>
      <main className="page">
        <h1 className="h1" style={{ marginTop: 4 }}>Привет{firstName}!</h1>
        <div style={{ marginTop: 14 }}>
          <Say who="cat" hand>
            {memories === null ? 'Листаю вашу галерею…' : memories.length
              ? `Нашёл ${memories.length} ${plural(memories.length, 'воспоминание', 'воспоминания', 'воспоминаний')}. Собрать книгу?`
              : 'Покажите мне фото — я найду в них истории!'}
          </Say>
        </div>

        {active && (
          <Link to={`/orders/${active.id}`} className="card" style={{ display: 'block', marginTop: 18 }}>
            <div className="between">
              <div className="row"><Robot size={40} mood="scan" /><div><div className="h3">{active.snapshot?.title || 'Заказ'}</div>
                <div className="small muted">{active.number} · {active.stage_label || active.status_label}</div></div></div>
              <ChevronRight size={20} color="var(--muted)" />
            </div>
            <div style={{ marginTop: 12 }}><MiniProgress status={active.status} stage={active.stage} /></div>
            {active.eta && <div className="small muted" style={{ marginTop: 8 }}>Готовность ориентировочно {fmtDate(active.eta)}</div>}
          </Link>
        )}

        <section className="section">
          <div className="section-head"><h2 className="h2">Воспоминания</h2><span className="small muted">из вашей галереи</span></div>
          {memories === null ? (
            <div className="hscroll">{[0, 1].map((i) => <div key={i} className="skeleton" style={{ width: 250, height: 300 }} />)}</div>
          ) : memories.length ? (
            <div className="hscroll">
              {memories.map((m, i) => (
                <motion.button key={m.id} className="card pad-0" style={{ width: 252, border: 0, textAlign: 'left', cursor: 'pointer', padding: 0 }}
                  initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }} onClick={() => fromMemory(m)} disabled={!!busy}>
                  <div style={{ position: 'relative', height: 210 }}>
                    <Img src={`/api/media/${m.cover_id}?size=thumb`} style={{ height: '100%' }} />
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,transparent 45%,rgba(0,0,0,.55))' }} />
                    <div style={{ position: 'absolute', left: 14, bottom: 12, color: '#fff' }}>
                      <div className="hand" style={{ fontSize: 30 }}>{m.title}</div>
                      <div className="small" style={{ opacity: .9 }}>{m.subtitle} · {m.count} фото</div>
                    </div>
                  </div>
                  <div className="between" style={{ padding: '12px 14px' }}>
                    <div className="row" style={{ gap: -6 }}>
                      {m.preview_ids.slice(1, 4).map((id, k) => (
                        <img key={id} src={media(`/api/media/${id}?size=thumb`)} alt="" style={{ width: 30, height: 30, borderRadius: 8, objectFit: 'cover', marginLeft: k ? -8 : 0, border: '2px solid #fff' }} />
                      ))}
                    </div>
                    <span className="btn btn-primary btn-sm">{busy === m.id ? 'Кот собирает…' : <><Sparkles size={15} /> Книга за минуту</>}</span>
                  </div>
                </motion.button>
              ))}
            </div>
          ) : (
            <Link to="/create" className="card stack" style={{ alignItems: 'center', textAlign: 'center', padding: 24 }}>
              <Cat size={64} mood="wow" />
              <div className="h3">Здесь появятся ваши истории</div>
              <div className="small muted">Загрузите фото — я сгруппирую их по поездкам и праздникам</div>
              <span className="btn btn-primary btn-sm">Добавить фото</span>
            </Link>
          )}
        </section>

        <section className="section grid2">
          <Link to="/create" className="card card-coral" style={{ minHeight: 170, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative', overflow: 'hidden' }}>
            <Wand2 size={26} />
            <div><div className="h3" style={{ color: '#fff' }}>Книга за 1 минуту</div><div className="small" style={{ opacity: .9 }}>Кот отберёт и разложит</div></div>
          </Link>
          <button className="card card-yellow" onClick={skinemsya} disabled={!!busy} style={{ minHeight: 170, border: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', textAlign: 'left', cursor: 'pointer' }}>
            <Users size={26} />
            <div><div className="h3">Скинемся на&nbsp;альбом</div><div className="small" style={{ opacity: .75 }}>Класс, свадьба, команда — фото от всех</div></div>
          </button>
        </section>

        {drafts.length > 0 && (
          <section className="section">
            <div className="section-head"><h2 className="h2">Продолжить</h2></div>
            <div className="stack" style={{ gap: 10 }}>
              {drafts.slice(0, 3).map((d) => (
                <Link key={d.id} to={`/editor/${d.id}`} className="card row" style={{ padding: 10 }}>
                  {d.cover_photo_id ? <Img src={`/api/media/${d.cover_photo_id}?size=thumb`} style={{ width: 56, height: 56, borderRadius: 12, flexShrink: 0 }} />
                    : <div className="center" style={{ width: 56, height: 56, borderRadius: 12, background: 'var(--sand)' }}><Cat size={36} /></div>}
                  <div className="grow"><div className="h3" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.title}</div>
                    <div className="small muted">{d.pages_count} стр. · {d.role === 'member' ? `альбом ${d.owner_name}` : 'черновик сохранён'}</div></div>
                  <ChevronRight size={20} color="var(--muted)" />
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="section">
          <div className="section-head"><h2 className="h2">Что напечатаем?</h2><Link to="/catalog" className="link small">Весь каталог</Link></div>
          <div className="hscroll">
            {products.map((p) => (
              <Link key={p.id} to={`/catalog/${p.id}`} style={{ width: 150 }}>
                <ProductArt product={p} height={150} />
                <div className="h3" style={{ marginTop: 8, fontSize: 15 }}>{p.title}</div>
                <div className="small muted">от {money(p.base_price_minor * (p.kind === 'prints' ? 1 : 1))}</div>
              </Link>
            ))}
          </div>
        </section>
      </main>
      <TabBar />

      <Sheet open={notifs !== null} onClose={() => setNotifs(null)} label="Уведомления">
        <div className="h2" style={{ marginBottom: 12 }}>Уведомления</div>
        <div className="stack" style={{ gap: 8 }}>
          {(notifs || []).length === 0 && <div className="empty"><Robot size={56} /><div className="muted">Пока тихо</div></div>}
          {(notifs || []).map((n) => (
            <Link key={n.id} to={n.link || '#'} className="card row" style={{ padding: 12, alignItems: 'flex-start' }} onClick={() => setNotifs(null)}>
              {n.mascot === 'cat' ? <Cat size={34} /> : <Robot size={34} />}
              <div className="grow"><div className="h3" style={{ fontSize: 15 }}>{n.title}</div><div className="small muted">{n.body}</div>
                <div className="tiny muted" style={{ marginTop: 4 }}>{fmtDate(n.created_at, true)}</div></div>
            </Link>
          ))}
        </div>
      </Sheet>
    </div>
  )
}

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few
  return many
}

const ART: Record<string, { bg: string; shot: string }> = {
  'photobook-premium': { bg: 'var(--coral)', shot: 'sea_00.jpg' },
  'photobook-lite': { bg: 'var(--mint)', shot: 'lake_01.jpg' },
  graduation: { bg: 'var(--yellow)', shot: 'grad_02.jpg' },
  prints: { bg: 'var(--sky)', shot: 'garden_03.jpg' },
  canvas: { bg: 'var(--blush)', shot: 'sea_06.jpg' },
  calendar: { bg: 'var(--lilac)', shot: 'city_01.jpg' },
  magnets: { bg: 'var(--sand)', shot: 'garden_00.jpg' },
}

export function ProductArt({ product, height = 160 }: { product: Product; height?: number }) {
  const a = ART[product.id] || { bg: 'var(--sand)', shot: 'sea_00.jpg' }
  const src = `/api/gallery/file/${a.shot}`
  const k = product.kind
  return (
    <div style={{ height, borderRadius: 20, background: a.bg, position: 'relative', overflow: 'hidden', display: 'grid', placeItems: 'center' }}>
      {k === 'book' && (
        <div style={{ width: '58%', aspectRatio: product.id === 'graduation' ? '0.72' : '1', borderRadius: '3px 8px 8px 3px', overflow: 'hidden', boxShadow: '8px 12px 24px rgba(0,0,0,.25), inset 6px 0 0 rgba(0,0,0,.15)', transform: 'rotate(-6deg)' }}>
          <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      )}
      {k === 'prints' && [0, 1, 2].map((i) => (
        <div key={i} className="polaroid" style={{ position: 'absolute', width: '42%', padding: '5px 5px 14px', transform: `rotate(${[-12, 4, 14][i]}deg) translate(${[-30, 0, 30][i]}%, ${[4, -6, 6][i]}%)` }}>
          <img src={`/api/gallery/file/${['garden_03.jpg', 'sea_02.jpg', 'lake_04.jpg'][i]}`} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover' }} />
        </div>
      ))}
      {k === 'wall' && (
        <div style={{ width: '70%', aspectRatio: '1.33', boxShadow: '0 14px 24px rgba(0,0,0,.25)', border: '4px solid #fff', borderRadius: 2 }}>
          <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      )}
      {k === 'calendar' && (
        <div style={{ width: '56%', background: '#fff', borderRadius: 6, padding: 6, boxShadow: '0 12px 22px rgba(0,0,0,.2)', transform: 'rotate(3deg)' }}>
          <div style={{ height: 6, display: 'flex', justifyContent: 'space-around', marginTop: -10 }}>{[0, 1, 2, 3, 4].map((i) => <span key={i} style={{ width: 4, height: 10, background: '#555', borderRadius: 2 }} />)}</div>
          <img src={src} alt="" style={{ width: '100%', aspectRatio: '1.4', objectFit: 'cover', borderRadius: 3 }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginTop: 5 }}>{Array.from({ length: 14 }).map((_, i) => <span key={i} style={{ height: 4, background: i === 9 ? 'var(--coral)' : '#e5e0d8', borderRadius: 1 }} />)}</div>
        </div>
      )}
      {product.badge && <span className="pill pill-dark" style={{ position: 'absolute', top: 10, left: 10 }}>{product.badge}</span>}
    </div>
  )
}
