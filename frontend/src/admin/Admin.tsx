import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { Activity, Bot, ClipboardList, Cog, Headset, LogOut, Package, ScrollText, Smartphone } from 'lucide-react'
import { Logo } from '../components/Mascots'
import { useApp } from '../store'
import Pulse from './Pulse'
import AdminOrders from './Orders'
import Support from './Support'
import AiStudio from './AiStudio'
import Decisions from './Decisions'
import Audit from './Audit'
import Settings from './Settings'

export default function Admin() {
  const { user, logout } = useApp()
  const isAdmin = user?.role === 'admin'
  const Item = ({ to, icon, label }: { to: string; icon: any; label: string }) => (
    <NavLink to={to} end={to === '/admin'} className={({ isActive }) => `admin-nav ${isActive ? 'active' : ''}`}>{icon}{label}</NavLink>
  )
  return (
    <div className="admin">
      <aside className="admin-side">
        <div className="logo" style={{ fontFamily: 'var(--logo)' }}>PicPac <span style={{ fontFamily: 'var(--font)', fontSize: 12, opacity: .6, letterSpacing: '.1em' }}>STUDIO</span></div>
        <Item to="/admin" icon={<Activity size={18} />} label="Пульс" />
        <Item to="/admin/orders" icon={<Package size={18} />} label="Заказы" />
        <Item to="/admin/support" icon={<Headset size={18} />} label="Поддержка" />
        <Item to="/admin/decisions" icon={<ClipboardList size={18} />} label="Решения" />
        {isAdmin && <Item to="/admin/ai" icon={<Bot size={18} />} label="AI-шлюз" />}
        {isAdmin && <Item to="/admin/audit" icon={<ScrollText size={18} />} label="Аудит" />}
        {isAdmin && <Item to="/admin/settings" icon={<Cog size={18} />} label="Настройки" />}
        <div style={{ flex: 1 }} />
        <NavLink to="/" className="admin-nav"><Smartphone size={18} />Приложение</NavLink>
        <button className="admin-nav" style={{ background: 'none', border: 0, cursor: 'pointer', textAlign: 'left' }} onClick={() => { logout(); location.assign('/welcome') }}><LogOut size={18} />Выйти</button>
        <div className="tiny" style={{ opacity: .6, padding: '8px 12px' }}>{user?.name} · {user?.role}</div>
      </aside>
      <main className="admin-main">
        <Routes>
          <Route index element={<Pulse />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="support" element={<Support />} />
          <Route path="decisions" element={<Decisions />} />
          <Route path="ai" element={isAdmin ? <AiStudio /> : <Navigate to="/admin" />} />
          <Route path="audit" element={isAdmin ? <Audit /> : <Navigate to="/admin" />} />
          <Route path="settings" element={isAdmin ? <Settings /> : <Navigate to="/admin" />} />
          <Route path="*" element={<Navigate to="/admin" />} />
        </Routes>
      </main>
    </div>
  )
}

export function Head({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="admin-head">
      <div><h1 className="h1">{title}</h1>{sub && <div className="muted small" style={{ marginTop: 4 }}>{sub}</div>}</div>
      {right}
    </div>
  )
}

export const LOGO = Logo
