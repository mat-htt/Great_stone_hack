import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bell, ChevronRight, Search } from 'lucide-react'
import { api, fmtDate, media, track, type Memory, type Order, type Project } from '../api'
import { Avatar, Logo, Mascot } from '../components/Mascots'
import { Dock, MiniProgress, Sheet, plural } from '../components/ui'
import { errorText, useApp } from '../store'

// Фото изделий — с picpac.by (официальные снимки продукции «Фотопринта»)
const TILES = [
  { id: 'book-premium', title: 'Фотокниги', sub: 'Кот соберёт за минуту', img: '/products/premiumb.webp', big: true },
  { id: 'prints-classic', title: 'Фотопечать', sub: 'от 0,65 BYN', img: '/products/phpotob.webp' },
  { id: 'book-lite', title: 'Книги Lite', sub: 'от 56 BYN', img: '/products/liteb.webp' },
  { id: 'prints-mini', title: 'Мини-снимки', sub: 'от 0,49 BYN', img: '/products/digitalb.webp' },
]

export default function Home() {
  const { user, unread, toast, refreshNotifications } = useApp()
  const nav = useNavigate()
  const [memories, setMemories] = useState<Memory[] | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [drafts, setDrafts] = useState<Project[]>([])
  const [notifs, setNotifs] = useState<any[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    api<{ memories: Memory[] }>('/api/memories').then((r) => setMemories(r.memories)).catch(() => setMemories([]))
    api<{ items: Order[] }>('/api/orders').then((r) => setOrders(r.items)).catch(() => {})
    api<{ items: Project[] }>('/api/projects').then((r) => setDrafts(r.items.filter((p) => p.status === 'draft'))).catch(() => {})
  }, [])

  const active = orders.find((o) => !['completed', 'cancelled'].includes(o.status))
  const hour = new Date().getHours()
  const hello = hour < 6 ? 'Доброй ночи' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер'

  const fromMemory = async (m: Memory) => {
    setBusy(m.id)
    try {
      const p = await api<Project>('/api/projects', { method: 'POST', json: { product_id: 'book-classic', photo_ids: m.photo_ids, title: m.title, auto: true, options: { template: 'travel' } } })
      track('project_created', { from: 'memory' })
      nav(`/magic/${p.id}`)
    } catch (e) { toast({ title: errorText(e), kind: 'bad' }) } finally { setBusy(null) }
  }
  const openNotifs = () => {
    api<{ items: any[] }>('/api/notifications').then((r) => setNotifs(r.items))
    api('/api/notifications/read', { method: 'POST' }).then(refreshNotifications)
  }

  return (
    <div className="screen">
      <header className="topbar left" style={{ background: 'none', position: 'relative' }}>
        <div className="title"><Logo size={26} /></div>
        <button className="icon-btn" aria-label="Уведомления" onClick={openNotifs} style={{ position: 'relative' }}>
          <Bell size={20} />{unread > 0 && <span style={{ position: 'absolute', top: 9, right: 10, width: 9, height: 9, borderRadius: 5, background: 'var(--primary)' }} />}
        </button>
      </header>
      <main className="content">
        <h1 className="t-h1" style={{ marginTop: 6 }}>{hello}{user && !user.is_guest ? `, ${user.name.split(' ')[0]}` : ''}</h1>
        <button className="search" style={{ marginTop: 16 }} onClick={() => nav('/catalog')}><Search size={20} />Что напечатаем?</button>

        <section className="tiles" style={{ marginTop: 14 }} aria-label="Сервисы">
          {TILES.map((t) => (
            <button key={t.id} className={`tile photo ${t.big ? 'big' : ''}`} onClick={() => nav(`/catalog/${t.id}`)} style={{ backgroundImage: `url(${t.img})` }}>
              <div><div className="tile-title">{t.title}</div><div className="tile-sub">{t.sub}</div></div>
            </button>
          ))}
          <button className="tile" onClick={() => nav('/catalog?c=gifts')}>
            <div><div className="tile-title">Подарки</div><div className="tile-sub">кружки, пазлы, открытки</div></div>
            <div className="tile-art" style={{ right: -6, bottom: -14 }}><Mascot pose="robot-book" size={92} /></div>
          </button>
          <button className="tile accent" style={{ gridColumn: 'span 2' }} onClick={() => nav('/catalog/grad-school-11')}>
            <div style={{ maxWidth: '46%' }}><div className="tile-title">Скинемся на&nbsp;альбом</div><div className="tile-sub" style={{ marginTop: 4 }}>Класс, садик, свадьба — фото от всех по ссылке</div></div>
            <div className="tile-art" style={{ right: -10, bottom: -6 }}><Mascot pose="duo-cables" size={210} /></div>
          </button>
        </section>

        <section className="section">
          <div className="section-head"><h2 className="t-h2">Воспоминания</h2>{memories?.length ? <span className="t-sm muted">нашёл Кот</span> : null}</div>
          {memories === null ? <div className="hscroll">{[0, 1].map((i) => <div key={i} className="skeleton" style={{ width: 240, height: 290 }} />)}</div>
            : memories.length ? (
              <div className="hscroll">
                {memories.map((m) => (
                  <button key={m.id} onClick={() => fromMemory(m)} disabled={!!busy}
                    style={{ position: 'relative', width: 236, height: 300, borderRadius: 'var(--r-lg)', overflow: 'hidden', border: 0, padding: 0, cursor: 'pointer', boxShadow: 'var(--shadow-1)', textAlign: 'left' }}>
                    <img src={media(`/api/media/${m.cover_id}?size=thumb`)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <div className="glass" style={{ position: 'absolute', left: 8, right: 8, bottom: 8, borderRadius: 20, padding: '12px 14px', color: 'var(--text)' }}>
                      <div className="t-h3 ellipsis">{m.title}</div>
                      <div className="t-xs muted">{m.count} {plural(m.count, 'фото', 'фото', 'фото')} · {m.subtitle}</div>
                      <div className="btn btn-primary btn-sm" style={{ marginTop: 10, width: '100%' }}>{busy === m.id ? 'Кот собирает…' : 'Собрать книгу'}</div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <Link to="/create" className="card row" style={{ gap: 14 }}>
                <Mascot pose="cat-point" size={74} />
                <div className="grow"><div className="t-h3">Загрузите фото</div><div className="t-sm muted">Кот разложит их по поездкам и праздникам</div></div>
                <ChevronRight size={20} className="muted" />
              </Link>
            )}
        </section>

        {drafts.length > 0 && (
          <section className="section">
            <div className="section-head"><h2 className="t-h2">Черновики</h2></div>
            <div className="list">
              {drafts.slice(0, 3).map((d) => (
                <Link key={d.id} to={`/editor/${d.id}`} className="list-row">
                  {d.cover_photo_id ? <img src={media(`/api/media/${d.cover_photo_id}?size=thumb`)} alt="" style={{ width: 48, height: 48, borderRadius: 14, objectFit: 'cover' }} />
                    : <span style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--fill)' }} />}
                  <div className="grow"><div className="t-h3 ellipsis">{d.title}</div><div className="t-sm muted">{d.role === 'member' ? `альбом ${d.owner_name}` : 'сохранено автоматически'}</div></div>
                  <ChevronRight size={18} className="muted" />
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>

      {active && (
        <Link to={`/orders/${active.id}`} className="glass" style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 'calc(env(safe-area-inset-bottom) + 96px)', width: 'min(440px, calc(100% - 24px))', borderRadius: 24, padding: '10px 14px 12px 10px', zIndex: 39, boxShadow: 'var(--shadow-2)' }}>
          <div className="row" style={{ gap: 12 }}>
            <Avatar who="robot" size={42} />
            <div className="grow"><div className="t-sm" style={{ fontWeight: 700 }}>{active.stage_label || active.status_label}</div>
              <div className="t-xs muted ellipsis">{active.snapshot?.title} · {active.eta ? `готов ~${fmtDate(active.eta)}` : active.number}</div></div>
            <ChevronRight size={18} className="muted" />
          </div>
          <div style={{ marginTop: 8, paddingLeft: 54 }}><MiniProgress status={active.status} stage={active.stage} /></div>
        </Link>
      )}
      <Dock />

      <Sheet open={notifs !== null} onClose={() => setNotifs(null)} label="Уведомления">
        <h2 className="t-h1" style={{ marginBottom: 12 }}>Уведомления</h2>
        <div className="list">
          {(notifs || []).length === 0 && <div className="empty muted">Пока тихо</div>}
          {(notifs || []).map((n) => (
            <Link key={n.id} to={n.link || '#'} className="list-row" onClick={() => setNotifs(null)}>
              <Avatar who={n.mascot === 'cat' ? 'cat' : 'robot'} size={38} />
              <div className="grow"><div className="t-sm" style={{ fontWeight: 700 }}>{n.title}</div><div className="t-sm muted">{n.body}</div></div>
            </Link>
          ))}
        </div>
      </Sheet>
    </div>
  )
}
