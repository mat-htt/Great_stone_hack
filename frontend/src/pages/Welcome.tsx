import { useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Logo, Mascot } from '../components/Mascots'
import { Sheet } from '../components/ui'
import { errorText, useApp } from '../store'

const DEMO = [
  { label: 'Клиент', email: 'client@picpac.test', password: 'demo1234' },
  { label: 'Менеджер', email: 'operator@picpac.test', password: 'operator1234' },
  { label: 'Администратор', email: 'admin@picpac.test', password: 'admin1234' },
]
const SHOTS = ['premiumb', 'phpotob', 'classicb', 'liteb'] // фото изделий с picpac.by

export default function Welcome() {
  const { guest, login, register, toast } = useApp()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next') || '/'
  const [sheet, setSheet] = useState<'login' | 'register' | null>(null)
  const [f, setF] = useState({ name: '', email: '', password: '' })
  const [busy, setBusy] = useState(false)

  const go = async (fn: () => Promise<any>) => {
    setBusy(true)
    try { const u = await fn(); nav(u.role !== 'client' && next === '/' ? '/admin' : next, { replace: true }) }
    catch (e) { toast({ title: errorText(e), kind: 'bad' }) } finally { setBusy(false) }
  }

  return (
    <div className="screen">
      <div style={{ padding: 'calc(env(safe-area-inset-top) + 18px) 22px 0' }}><Logo size={30} /></div>
      <div style={{ position: 'relative', height: 360, marginTop: 8 }}>
        {SHOTS.map((s, i) => (
          <motion.img key={s} src={`/products/${s}.webp`} alt="" draggable={false}
            style={{ position: 'absolute', width: [150, 128, 176, 136][i], aspectRatio: ['0.76', '0.76', '1.5', '1.45'][i], objectFit: 'cover', borderRadius: 24, boxShadow: 'var(--shadow-2)',
              left: ['6%', '58%', '24%', '60%'][i], top: [20, 4, 170, 150][i], border: '4px solid var(--surface)' }}
            initial={{ opacity: 0, y: 40, rotate: 0 }} animate={{ opacity: 1, y: 0, rotate: [-8, 7, -3, 9][i] }}
            transition={{ delay: 0.1 + i * 0.09, type: 'spring', stiffness: 140, damping: 16 }} />
        ))}
        <motion.div style={{ position: 'absolute', left: -4, bottom: -16 }} initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5, type: 'spring' }}>
          <Mascot pose="cat-point" size={170} />
        </motion.div>
        <motion.div style={{ position: 'absolute', right: -6, bottom: -26 }} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.62, type: 'spring' }}>
          <Mascot pose="robot-book" size={150} />
        </motion.div>
      </div>
      <div className="stack" style={{ padding: '30px 22px calc(env(safe-area-inset-bottom) + 24px)', gap: 16 }}>
        <h1 className="t-display">Ваши фото — на&nbsp;бумаге, кружках и&nbsp;в&nbsp;книгах</h1>
        <p className="muted" style={{ margin: 0, fontSize: 17 }}>Выберите снимки. Кот соберёт макет, Робот проверит перед печатью. От галереи до заказа — пара минут.</p>
        <button className="btn btn-primary btn-lg btn-block" disabled={busy} onClick={() => go(guest)} style={{ marginTop: 6 }}>
          Начать <ArrowRight size={20} />
        </button>
        <button className="btn btn-secondary btn-block" onClick={() => setSheet('login')}>Войти в аккаунт</button>
      </div>

      <Sheet open={!!sheet} onClose={() => setSheet(null)} label="Вход">
        <form className="stack" onSubmit={(e) => { e.preventDefault(); go(() => sheet === 'login' ? login(f.email, f.password) : register(f.name, f.email, f.password)) }}>
          <h2 className="t-h1">{sheet === 'login' ? 'Вход' : 'Регистрация'}</h2>
          {sheet === 'register' && <input className="input" placeholder="Имя" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required aria-label="Имя" />}
          <input className="input" type="email" placeholder="Почта" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required autoComplete="email" aria-label="Почта" />
          <input className="input" type="password" placeholder="Пароль" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required minLength={6} autoComplete="current-password" aria-label="Пароль" />
          <button className="btn btn-primary btn-block" disabled={busy}>{sheet === 'login' ? 'Войти' : 'Создать аккаунт'}</button>
          <button type="button" className="link" onClick={() => setSheet(sheet === 'login' ? 'register' : 'login')}>
            {sheet === 'login' ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'}
          </button>
          {sheet === 'login' && (
            <div className="card flat stack" style={{ gap: 10, marginTop: 4 }}>
              <div className="t-sm muted">Демо-доступ для жюри</div>
              <div className="row wrap">{DEMO.map((d) => <button key={d.email} type="button" className="chip" onClick={() => go(() => login(d.email, d.password))}>{d.label}</button>)}</div>
              <a href="/admin" className="t-sm" style={{ color: "var(--primary)", fontWeight: 650 }}>Вход для сотрудников (Studio) →</a>
            </div>
          )}
        </form>
      </Sheet>
    </div>
  )
}
