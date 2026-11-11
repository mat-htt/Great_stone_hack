import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bell, ChevronRight, Images, LayoutDashboard, LogOut, Shield, Trash2, UserPlus } from 'lucide-react'
import { api, type Photo } from '../api'
import { Cat, Logo } from '../components/Mascots'
import { Sheet, TabBar, TopBar } from '../components/ui'
import { errorText, useApp } from '../store'

export default function Profile() {
  const { user, logout, register, toast } = useApp()
  const nav = useNavigate()
  const [photos, setPhotos] = useState<Photo[]>([])
  const [confirm, setConfirm] = useState<'photos' | 'account' | null>(null)
  const [reg, setReg] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [perm, setPerm] = useState(() => ('Notification' in window ? Notification.permission : 'denied'))
  useEffect(() => { api<{ photos: Photo[] }>('/api/photos').then((r) => setPhotos(r.photos)).catch(() => {}) }, [])
  const mb = photos.reduce((a, p) => a + ((p as any).size_bytes || 0), 0) / 1024 / 1024

  const doDelete = async () => {
    try {
      if (confirm === 'photos') { const r = await api<{ deleted: number }>('/api/photos', { method: 'DELETE' }); setPhotos([]); toast({ title: `Удалено фото: ${r.deleted}`, mascot: 'robot' }) }
      else { await api('/api/auth/me', { method: 'DELETE' }); logout(); nav('/welcome', { replace: true }); toast({ title: 'Аккаунт и фото удалены', mascot: 'robot' }) }
    } catch (e) { toast({ title: errorText(e), kind: 'bad' }) } finally { setConfirm(null) }
  }

  return (
    <div className="phone">
      <TopBar title="Профиль" left />
      <main className="page stack" style={{ gap: 14 }}>
        <div className="card row" style={{ gap: 14 }}>
          <div className="center" style={{ width: 60, height: 60, borderRadius: 20, background: 'var(--coral-50)' }}><Cat size={50} /></div>
          <div className="grow"><div className="h2">{user?.name}</div><div className="small muted">{user?.is_guest ? 'Гостевой режим' : user?.email}</div></div>
          {user?.role !== 'client' && <span className="pill pill-dark">{user?.role === 'admin' ? 'админ' : 'оператор'}</span>}
        </div>
        {user?.is_guest && (
          <button className="card row" style={{ border: 0, background: 'var(--yellow)', cursor: 'pointer', textAlign: 'left' }} onClick={() => setReg(true)}>
            <UserPlus size={22} /><div className="grow"><b>Сохранить аккаунт</b><div className="small">Проекты и заказы останутся с вами на любом устройстве</div></div><ChevronRight size={18} />
          </button>
        )}
        {user?.role !== 'client' && (
          <Link to="/admin" className="card row"><LayoutDashboard size={22} color="var(--coral)" /><div className="grow"><b>Панель управления</b><div className="small muted">Пульс, заказы, AI-шлюз</div></div><ChevronRight size={18} /></Link>
        )}
        <div className="card stack" style={{ gap: 0, padding: 0 }}>
          <Row icon={<Bell size={20} />} title="Пуш-уведомления о статусах" sub={perm === 'granted' ? 'включены' : perm === 'denied' ? 'запрещены в браузере' : 'выключены'}
            onClick={async () => { try { setPerm(await Notification.requestPermission()) } catch { /* noop */ } }} />
          <Row icon={<Images size={20} />} title="Мои фото" sub={`${photos.length} шт. · ${mb.toFixed(1)} МБ`} onClick={() => nav('/create')} />
          <Row icon={<Trash2 size={20} />} title="Удалить все мои фото" sub="Черновики останутся без фото" onClick={() => setConfirm('photos')} danger />
          <Row icon={<Trash2 size={20} />} title="Удалить аккаунт и данные" sub="Фото удаляются сразу, заказы обезличиваются" onClick={() => setConfirm('account')} danger />
        </div>
        <div className="card flat small stack" style={{ gap: 6 }}>
          <div className="row" style={{ gap: 6 }}><Shield size={16} color="var(--green)" /><b>Ваши данные</b></div>
          <div className="muted">Фото хранятся на серверах picPac и обрабатываются встроенным движком внутри контура компании. Если администратор
            подключает внешнюю модель, в интерфейсе инструмента видно, кто обрабатывает данные. Аналитика — обезличенная.</div>
        </div>
        <button className="btn btn-ghost btn-block" onClick={() => { logout(); nav('/welcome') }}><LogOut size={18} /> Выйти</button>
        <div className="center" style={{ flexDirection: 'column', gap: 4, padding: 10 }}><Logo size={22} /><span className="tiny muted">машина времени для ваших счастливых мгновений · v1.0</span></div>
      </main>
      <TabBar />

      <Sheet open={!!confirm} onClose={() => setConfirm(null)} label="Подтверждение">
        <div className="stack">
          <div className="h2">{confirm === 'photos' ? 'Удалить все фото?' : 'Удалить аккаунт?'}</div>
          <div className="muted">Это действие нельзя отменить. {confirm === 'account' ? 'Все загруженные фото и черновики будут удалены.' : ''}</div>
          <button className="btn btn-primary btn-block" onClick={doDelete}>Да, удалить</button>
          <button className="btn btn-ghost btn-block" onClick={() => setConfirm(null)}>Отмена</button>
        </div>
      </Sheet>
      <Sheet open={reg} onClose={() => setReg(false)} label="Регистрация">
        <form className="stack" onSubmit={async (e) => { e.preventDefault(); try { await register(form.name, form.email, form.password); setReg(false); toast({ title: 'Аккаунт создан, всё сохранено', mascot: 'cat' }) } catch (er) { toast({ title: errorText(er), kind: 'bad' }) } }}>
          <div className="h2">Сохранить аккаунт</div>
          <input className="input" placeholder="Имя" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required aria-label="Имя" />
          <input className="input" type="email" placeholder="Почта" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required aria-label="Почта" />
          <input className="input" type="password" placeholder="Пароль (от 6 символов)" minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required aria-label="Пароль" />
          <button className="btn btn-primary btn-block">Сохранить</button>
        </form>
      </Sheet>
    </div>
  )
}

function Row({ icon, title, sub, onClick, danger }: { icon: any; title: string; sub: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className="row" style={{ width: '100%', padding: '14px 16px', background: 'none', border: 0, borderBottom: '1px solid var(--line)', cursor: 'pointer', textAlign: 'left', color: danger ? 'var(--coral-600)' : undefined }}>
      {icon}<div className="grow"><div style={{ fontWeight: 500 }}>{title}</div><div className="small muted">{sub}</div></div><ChevronRight size={18} color="var(--muted)" />
    </button>
  )
}
