import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { track } from './api'
import { Mascot } from './components/Mascots'
import { Ambient } from './components/ui'
import { useApp } from './store'
import Welcome from './pages/Welcome'
import Home from './pages/Home'
import Catalog from './pages/Catalog'
import ProductPage from './pages/Product'
import Create from './pages/Create'
import Magic from './pages/Magic'
import Editor from './pages/Editor'
import Check from './pages/Check'
import Checkout from './pages/Checkout'
import Orders from './pages/Orders'
import OrderDetail from './pages/OrderDetail'
import Profile from './pages/Profile'
import Join from './pages/Join'

const Admin = lazy(() => import('./admin/Admin'))
const AdminLogin = lazy(() => import('./admin/AdminLogin'))

function Splash() {
  return <div className="center" style={{ minHeight: '100dvh' }}><Ambient /><div className="float"><Mascot pose="cat-point" size={120} /></div></div>
}

function Guard({ children, staff = false }: { children: ReactNode; staff?: boolean }) {
  const { user, ready } = useApp()
  const loc = useLocation()
  if (!ready) return <Splash />
  if (staff && (!user || user.role === 'client')) return <Suspense fallback={<Splash />}><AdminLogin /></Suspense>
  if (!user) return <Navigate to={`/welcome?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />
  return <>{children}</>
}

export default function App() {
  const loc = useLocation()
  useEffect(() => { track('app_open') }, [])
  useEffect(() => { window.scrollTo(0, 0) }, [loc.pathname])
  if (loc.pathname.startsWith('/admin')) {
    return (
      <Guard staff>
        <Ambient />
        <Suspense fallback={<Splash />}><Routes><Route path="/admin/*" element={<Admin />} /></Routes></Suspense>
      </Guard>
    )
  }
  return (
    <div className="app-shell">
      <Ambient />
      <Routes>
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/join/:code" element={<Join />} />
        <Route path="/" element={<Guard><Home /></Guard>} />
        <Route path="/catalog" element={<Guard><Catalog /></Guard>} />
        <Route path="/catalog/:id" element={<Guard><ProductPage /></Guard>} />
        <Route path="/create" element={<Guard><Create /></Guard>} />
        <Route path="/magic/:id" element={<Guard><Magic /></Guard>} />
        <Route path="/editor/:id" element={<Guard><Editor /></Guard>} />
        <Route path="/check/:id" element={<Guard><Check /></Guard>} />
        <Route path="/checkout/:id" element={<Guard><Checkout /></Guard>} />
        <Route path="/orders" element={<Guard><Orders /></Guard>} />
        <Route path="/orders/:id" element={<Guard><OrderDetail /></Guard>} />
        <Route path="/profile" element={<Guard><Profile /></Guard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}
