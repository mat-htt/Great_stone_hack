import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bell, ChevronRight, Images, LayoutDashboard, LogOut, Send, Trash2, UserPlus } from 'lucide-react'
import { api, type Photo } from '../api'
import { Avatar, Logo } from '../components/Mascots'
import { Dock, Sheet } from '../components/ui'
import TelegramSheet, { useTelegram } from '../components/Telegram'
import { activeTheme, chooseTheme, getThemes, onThemeChange, type Theme } from '../theme/theme'
import { errorText, useApp } from '../store'

export default function Profile() {
  const { user, logout, register, toast } = useApp()
  const nav = useNavigate()
  const [photos, setPhotos] = useState<Photo[]>([])
  const [confirm, setConfirm] = useState<'photos' | 'account' | null>(null)
  const [reg, setReg] = useState(false)
  const [f, setF] = useState({ name: '', email: '', password: '' })
  const [theme, setTheme] = useState<Theme>(activeTheme())
  const [tgOpen, setTgOpen] = useState(false)
  const tg = useTelegram()
  const [perm, setPerm] = useState(() => ('Notification' in window ? Notification.permission : 'denied'))
  useEffect(() => { api<{ photos: Photo[] }>('/api/photos').then((r) => setPhotos(r.photos)).catch(() => {}) }, [])
  useEffect(() => onThemeChange(() => setTheme(activeTheme())), [])

  const themes = getThemes().themes
  const families = Array.from(new Map(themes.map((t) => [t.family, t])).values())
  const pick = (family: string, mode: string) => { const t = themes.find((x) => x.family === family && x.mode === mode) || themes.find((x) => x.family === family); if (t) chooseTheme(t.id) }
  const del = async () => {
    try {
      if (confirm === 'photos') { const r = await api<{ deleted: number }>('/api/photos', { method: 'DELETE' }); setPhotos([]); toast({ title: `Удалено фото: ${r.deleted}` }) }
      else { await api('/api/auth/me', { method: 'DELETE' }); logout(); nav('/welcome', { replace: true }) }
    } catch (e) { toast({ title: errorText(e), kind: 'bad' }) } finally { setConfirm(null) }
  }

  return (
    <div className="screen">
      <main className="content" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 18px)' }}>
        <div className="row" style={{ gap: 14 }}>
          <Avatar who="cat" size={64} />
          <div className="grow"><h1 className="t-h1 ellipsis">{user?.name}</h1><div className="t-sm muted">{user?.is_guest ? 'Гость' : user?.email}</div></div>
        </div>
        {user?.is_guest && (
          <button className="card row grad-accent" style={{ width: '100%', border: 0, marginTop: 18, cursor: 'pointer', textAlign: 'left' }} onClick={() => setReg(true)}>
            <UserPlus size={22} /><div className="grow"><b>Сохранить аккаунт</b><div className="t-sm" style={{ opacity: .8 }}>Проекты и заказы останутся с вами</div></div><ChevronRight size={18} />
          </button>
        )}

        <section className="section">
          <div className="section-head"><h2 className="t-h2">Оформление</h2></div>
          <div className="card stack" style={{ gap: 14 }}>
            <div className="row" style={{ gap: 14, overflowX: 'auto', padding: 6, margin: -6 }}>
              {families.map((t) => (
                <button key={t.family} onClick={() => pick(t.family, theme.mode)} aria-pressed={theme.family === t.family}
                  style={{ flexShrink: 0, border: 0, background: 'none', padding: 0, cursor: 'pointer', textAlign: 'center', color: 'var(--text)', width: 76 }}>
                  <div style={{ height: 56, borderRadius: 18, background: `linear-gradient(135deg, ${t.colors.glow2}, ${t.colors.primary})`, outline: theme.family === t.family ? '2.5px solid var(--primary)' : '2.5px solid transparent', outlineOffset: 3, transition: 'outline-color .2s' }} />
                  <div className="t-xs" style={{ marginTop: 6, fontWeight: 600 }}>{t.name.split(' ·')[0]}</div>
                </button>
              ))}
            </div>
            <div className="seg">
              <button className={theme.mode === 'light' ? 'active' : ''} onClick={() => pick(theme.family, 'light')}>Светлая</button>
              <button className={theme.mode === 'dark' ? 'active' : ''} onClick={() => pick(theme.family, 'dark')}>Тёмная</button>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="list">
            {user?.role !== 'client' && <Link to="/admin" className="list-row"><LayoutDashboard size={20} /><span className="grow"><b>Панель управления</b><div className="t-sm muted">{user?.role === 'admin' ? 'Администратор' : 'Менеджер'}</div></span><ChevronRight size={18} className="muted" /></Link>}
            <button className="list-row" onClick={async () => { try { setPerm(await Notification.requestPermission()) } catch { /* noop */ } }}><Bell size={20} /><span className="grow">Уведомления о статусе заказа<div className="t-sm muted">{perm === 'granted' ? 'включены' : 'выключены'}</div></span></button>
            <button className="list-row" onClick={() => setTgOpen(true)}><Send size={20} /><span className="grow">Статусы в Telegram<div className="t-sm muted">{tg.state?.linked ? (tg.state.enabled ? `подключено${tg.state.tg_name ? ' · ' + tg.state.tg_name : ''}` : 'на паузе') : 'по желанию — бот напишет, когда заказ готов'}</div></span><ChevronRight size={18} className="muted" /></button>
            <Link to="/create" className="list-row"><Images size={20} /><span className="grow">Мои фото<div className="t-sm muted">{photos.length} шт.</div></span><ChevronRight size={18} className="muted" /></Link>
            <button className="list-row" onClick={() => setConfirm('photos')} style={{ color: 'var(--danger)' }}><Trash2 size={20} /><span className="grow">Удалить все фото</span></button>
            <button className="list-row" onClick={() => setConfirm('account')} style={{ color: 'var(--danger)' }}><Trash2 size={20} /><span className="grow">Удалить аккаунт</span></button>
            <button className="list-row" onClick={() => { logout(); nav('/welcome') }}><LogOut size={20} /><span className="grow">Выйти</span></button>
          </div>
        </section>
        <div className="center" style={{ flexDirection: 'column', gap: 4, marginTop: 24 }}><Logo size={22} /><span className="t-xs muted">Фото хранятся и обрабатываются на серверах picPac</span></div>
      </main>
      <Dock />

      <Sheet open={!!confirm} onClose={() => setConfirm(null)} label="Подтверждение">
        <div className="stack"><h2 className="t-h2">{confirm === 'photos' ? 'Удалить все фото?' : 'Удалить аккаунт?'}</h2><div className="muted">Это нельзя отменить.</div>
          <button className="btn btn-danger btn-block" onClick={del}>Удалить</button><button className="btn btn-secondary btn-block" onClick={() => setConfirm(null)}>Отмена</button></div>
      </Sheet>
      <TelegramSheet open={tgOpen} onClose={() => setTgOpen(false)} tg={tg} />
      <Sheet open={reg} onClose={() => setReg(false)} label="Регистрация">
        <form className="stack" onSubmit={async (e) => { e.preventDefault(); try { await register(f.name, f.email, f.password); setReg(false); toast({ title: 'Аккаунт сохранён' }) } catch (er) { toast({ title: errorText(er), kind: 'bad' }) } }}>
          <h2 className="t-h2">Сохранить аккаунт</h2>
          <input className="input" placeholder="Имя" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required aria-label="Имя" />
          <input className="input" type="email" placeholder="Почта" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required aria-label="Почта" />
          <input className="input" type="password" placeholder="Пароль" minLength={6} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required aria-label="Пароль" />
          <button className="btn btn-primary btn-block">Сохранить</button>
        </form>
      </Sheet>
    </div>
  )
}
