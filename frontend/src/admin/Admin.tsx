import { useEffect, useState } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Activity, Bot, ClipboardList, Database, Headset, Images, LogOut, Package, Palette, ScrollText, Settings2, Smartphone } from 'lucide-react'
import { api } from '../api'
import { Avatar, Logo } from '../components/Mascots'
import { useApp } from '../store'
import Pulse from './Pulse'
import AdminOrders from './Orders'
import Support from './Support'
import AiStudio from './AiStudio'
import Decisions from './Decisions'
import Audit from './Audit'
import Settings from './Settings'
import Pipeline from './Pipeline'
import Themes from './Themes'
import DbAdmin from './DbAdmin'

const SECTIONS: { group: string; admin?: boolean; items: { to: string; label: string; icon: any }[] }[] = [
  { group: 'Работа', items: [
    { to: '/admin', label: 'Обзор', icon: Activity }, { to: '/admin/pipeline', label: 'Конвейер фото', icon: Images },
    { to: '/admin/orders', label: 'Заказы', icon: Package }, { to: '/admin/support', label: 'Поддержка', icon: Headset },
    { to: '/admin/decisions', label: 'Решения', icon: ClipboardList }] },
  { group: 'Управление', admin: true, items: [
    { to: '/admin/ai', label: 'AI-шлюз', icon: Bot }, { to: '/admin/themes', label: 'Темы оформления', icon: Palette },
    { to: '/admin/db', label: 'База данных', icon: Database }, { to: '/admin/audit', label: 'Аудит', icon: ScrollText },
    { to: '/admin/settings', label: 'Настройки', icon: Settings2 }] },
]

export default function Admin() {
  const { user, logout } = useApp()
  const isAdmin = user?.role === 'admin'
  const loc = useLocation()
  const [counts, setCounts] = useState<Record<string, number>>({})
  useEffect(() => { api<{ open: number }>('/api/admin/tickets?status=open').then((r) => setCounts({ '/admin/support': r.open })).catch(() => {}) }, [loc.pathname])
  return (
    <div className="adm">
      <aside className="adm-side">
        <div className="row logo-row" style={{ padding: '4px 12px 10px' }}><Logo size={24} /><span className="t-xs muted" style={{ fontWeight: 700 }}>Studio</span></div>
        {SECTIONS.filter((s) => !s.admin || isAdmin).map((s) => (
          <div key={s.group} style={{ display: 'contents' }}>
            <div className="adm-group">{s.group}</div>
            {s.items.map((it) => (
              <NavLink key={it.to} to={it.to} end={it.to === '/admin'} className={({ isActive }) => `adm-nav ${isActive ? 'active' : ''}`}>
                <it.icon size={18} />{it.label}{counts[it.to] ? <span className="cnt">{counts[it.to]}</span> : null}
              </NavLink>
            ))}
          </div>
        ))}
        {!isAdmin && <div className="t-xs muted side-foot" style={{ padding: '14px 12px' }}>Менеджеру недоступны AI-шлюз, темы, база данных и аудит.</div>}
        <div style={{ flex: 1 }} />
        <div className="side-foot" style={{ display: 'contents' }}>
          <Link to="/" className="adm-nav"><Smartphone size={18} />Открыть приложение</Link>
          <button className="adm-nav" style={{ background: 'none', border: 0, cursor: 'pointer', textAlign: 'left' }} onClick={() => { logout(); location.assign('/welcome') }}><LogOut size={18} />Выйти</button>
        </div>
      </aside>
      <main className="adm-main">
        <Routes>
          <Route index element={<Pulse />} />
          <Route path="pipeline" element={<Pipeline />} />
          <Route path="pipeline/:photoId" element={<Pipeline />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="support" element={<Support />} />
          <Route path="decisions" element={<Decisions />} />
          {isAdmin && <Route path="ai" element={<AiStudio />} />}
          {isAdmin && <Route path="themes" element={<Themes />} />}
          {isAdmin && <Route path="db" element={<DbAdmin />} />}
          {isAdmin && <Route path="db/:model" element={<DbAdmin />} />}
          {isAdmin && <Route path="audit" element={<Audit />} />}
          {isAdmin && <Route path="settings" element={<Settings />} />}
          <Route path="*" element={<Navigate to="/admin" />} />
        </Routes>
      </main>
    </div>
  )
}

export function RoleBadge() {
  const { user } = useApp()
  const admin = user?.role === 'admin'
  return (
    <span className="role-badge"><Avatar who={admin ? 'robot' : 'cat'} size={28} />{user?.name}
      <span className="rb" style={admin ? { background: 'var(--primary)', color: 'var(--primary-ink)' } : { background: 'color-mix(in srgb, var(--info) 15%, transparent)', color: 'var(--info)' }}>{admin ? 'Администратор' : 'Менеджер'}</span>
    </span>
  )
}

export function Head({ title, sub, right, crumbs }: { title: string; sub?: string; right?: React.ReactNode; crumbs?: { to?: string; label: string }[] }) {
  return (
    <div className="adm-top">
      <div style={{ minWidth: 0 }}>
        <div className="crumbs"><Link to="/admin">Studio</Link>{(crumbs || []).map((c, i) => <span key={i}> / {c.to ? <Link to={c.to}>{c.label}</Link> : c.label}</span>)}</div>
        <h1 className="t-h1">{title}</h1>{sub && <div className="muted t-sm" style={{ marginTop: 4, maxWidth: 720 }}>{sub}</div>}
      </div>
      <div className="row wrap">{right}<RoleBadge /></div>
    </div>
  )
}
