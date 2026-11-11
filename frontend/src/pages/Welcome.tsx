import { useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, LogIn, ShieldCheck, Sparkles } from 'lucide-react'
import { Cat, Heart, Logo, Robot } from '../components/Mascots'
import { Sheet } from '../components/ui'
import { errorText, useApp } from '../store'

const SHOTS = ['sea_00.jpg', 'grad_02.jpg', 'lake_01.jpg', 'garden_03.jpg', 'sea_06.jpg']
const DEMO = [
  { label: 'Клиент', email: 'client@picpac.test', password: 'demo1234' },
  { label: 'Оператор', email: 'operator@picpac.test', password: 'operator1234' },
  { label: 'Админ', email: 'admin@picpac.test', password: 'admin1234' },
]

export default function Welcome() {
  const { guest, login, register, toast } = useApp()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next') || '/'
  const [sheet, setSheet] = useState<'login' | 'register' | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const go = async (fn: () => Promise<any>) => {
    setBusy(true)
    try {
      const u = await fn()
      nav(u.role !== 'client' && next === '/' ? '/admin' : next, { replace: true })
    } catch (e) { toast({ title: errorText(e), kind: 'bad' }) } finally { setBusy(false) }
  }

  return (
    <div className="phone" style={{ overflow: 'hidden' }}>
      <div style={{ position: 'relative', height: 430, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', width: 520, height: 520, borderRadius: '50%', background: 'var(--coral)', top: -250, right: -170 }} />
        <div style={{ position: 'absolute', width: 260, height: 260, borderRadius: '50%', background: 'var(--yellow)', top: 210, left: -120, opacity: .85 }} />
        <div style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top) + 18px)', right: 22, zIndex: 20 }}><Logo size={34} light /></div>
        {SHOTS.map((s, i) => (
          <motion.div key={s} className="polaroid" style={{ position: 'absolute', width: 132 + (i % 2) * 18, left: [26, 168, 70, 214, 120][i], top: [96, 70, 238, 214, 150][i], zIndex: i }}
            initial={{ opacity: 0, y: 80, rotate: 0, scale: 0.8 }} animate={{ opacity: 1, y: 0, rotate: [-9, 7, -4, 10, -2][i], scale: 1 }}
            transition={{ delay: 0.15 + i * 0.12, type: 'spring', stiffness: 160, damping: 16 }}>
            <img src={`/api/gallery/file/${s}`} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 2 }} />
          </motion.div>
        ))}
        <motion.div style={{ position: 'absolute', right: 18, top: 330, zIndex: 9 }} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.9, type: 'spring' }}>
          <div className="float"><Cat size={78} /></div>
        </motion.div>
        <motion.div style={{ position: 'absolute', left: 14, top: 352, zIndex: 9 }} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1.05, type: 'spring' }}>
          <Robot size={62} />
        </motion.div>
      </div>
      <div style={{ padding: '6px 22px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <motion.h1 className="display" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          Машина времени для&nbsp;ваших <span style={{ color: 'var(--coral)' }}>счастливых мгновений</span>
        </motion.h1>
        <p className="muted" style={{ margin: 0, fontSize: 17 }}>
          Выберите фото — <b style={{ color: 'var(--ink)' }}>Кот</b> сам соберёт книгу, <b style={{ color: 'var(--ink)' }}>Робот</b> проверит печать.
          От галереи до заказа — за 5 минут.
        </p>
        <div className="row small muted wrap" style={{ gap: 14 }}>
          <span className="row" style={{ gap: 6 }}><Sparkles size={16} color="var(--coral)" /> AI-ретушь</span>
          <span className="row" style={{ gap: 6 }}><ShieldCheck size={16} color="var(--coral)" /> Проверка до печати</span>
          <span className="row" style={{ gap: 6 }}><Heart size={16} /> Печать за 1 день</span>
        </div>
        <button className="btn btn-primary btn-lg btn-block" disabled={busy} onClick={() => go(guest)}>
          Начать без регистрации <ArrowRight size={20} />
        </button>
        <button className="btn btn-ghost btn-block" onClick={() => setSheet('login')}><LogIn size={18} /> У меня есть аккаунт</button>
      </div>

      <Sheet open={!!sheet} onClose={() => setSheet(null)} label="Вход">
        <form className="stack" onSubmit={(e) => { e.preventDefault(); go(() => sheet === 'login' ? login(email, password) : register(name, email, password)) }}>
          <div className="row"><Cat size={44} mood="wow" /><div className="h2">{sheet === 'login' ? 'С возвращением!' : 'Создать аккаунт'}</div></div>
          {sheet === 'register' && (
            <div className="field"><label htmlFor="n">Имя</label><input id="n" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required /></div>
          )}
          <div className="field"><label htmlFor="e">Почта</label><input id="e" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></div>
          <div className="field"><label htmlFor="p">Пароль</label><input id="p" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required minLength={6} /></div>
          <button className="btn btn-primary btn-block" disabled={busy}>{sheet === 'login' ? 'Войти' : 'Зарегистрироваться'}</button>
          <button type="button" className="link" onClick={() => setSheet(sheet === 'login' ? 'register' : 'login')}>
            {sheet === 'login' ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'}
          </button>
          {sheet === 'login' && (
            <div className="card flat stack" style={{ gap: 8 }}>
              <div className="small muted">Тестовые учётные записи демо-стенда</div>
              <div className="row wrap">
                {DEMO.map((d) => (
                  <button key={d.email} type="button" className="chip" onClick={() => go(() => login(d.email, d.password))}>{d.label}</button>
                ))}
              </div>
            </div>
          )}
        </form>
      </Sheet>
    </div>
  )
}
