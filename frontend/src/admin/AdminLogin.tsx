import { useState } from 'react'
import { Link } from 'react-router-dom'
import { LockKeyhole } from 'lucide-react'
import { Logo, Mascot } from '../components/Mascots'
import { errorText, useApp } from '../store'

// Демо-учётки из сида (только для стенда хакатона)
const DEMO = [
  { label: 'Менеджер', email: 'operator@picpac.test', password: 'operator1234' },
  { label: 'Администратор', email: 'admin@picpac.test', password: 'admin1234' },
]

/** Вход в Studio: показываем вместо молчаливого редиректа, если открыт /admin без прав сотрудника. */
export default function AdminLogin() {
  const { user, login, toast } = useApp()
  const [f, setF] = useState({ email: '', password: '' })
  const [busy, setBusy] = useState(false)
  const go = async (email: string, password: string) => {
    setBusy(true)
    try {
      const u = await login(email, password)
      if (u.role === 'client') toast({ title: 'У этой учётной записи нет доступа к Studio', kind: 'bad' })
    } catch (e) { toast({ title: errorText(e), kind: 'bad' }) } finally { setBusy(false) }
  }
  return (
    <div className="center" style={{ minHeight: '100dvh', padding: 16 }}>
      <div className="card glass stack" style={{ width: '100%', maxWidth: 400, gap: 14, padding: 24 }}>
        <div className="row" style={{ gap: 12 }}>
          <Mascot pose="robot-head" size={58} />
          <div className="grow"><Logo size={24} /><div className="t-sm muted" style={{ marginTop: 2 }}>Studio — для менеджеров и администраторов</div></div>
        </div>
        {user && <div className="t-sm card" style={{ background: 'var(--fill)', boxShadow: 'none' }}>Сейчас вы вошли как {user.is_guest ? 'гость' : user.email}. Войдите учётной записью сотрудника.</div>}
        <form className="stack" style={{ gap: 10 }} onSubmit={(e) => { e.preventDefault(); go(f.email, f.password) }}>
          <input className="input" type="email" placeholder="Почта" autoComplete="username" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required aria-label="Почта" />
          <input className="input" type="password" placeholder="Пароль" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required aria-label="Пароль" />
          <button className="btn btn-primary btn-block" disabled={busy}><LockKeyhole size={18} /> Войти в Studio</button>
        </form>
        <div className="t-xs muted">Демо-доступ для жюри:</div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {DEMO.map((d) => <button key={d.email} className="chip" disabled={busy} onClick={() => go(d.email, d.password)}>{d.label}</button>)}
        </div>
        <Link to="/" className="t-sm muted" style={{ textAlign: 'center' }}>← В приложение</Link>
      </div>
    </div>
  )
}
