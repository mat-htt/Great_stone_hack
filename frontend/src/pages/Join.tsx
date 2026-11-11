import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate, useParams } from 'react-router-dom'
import { Images, Users } from 'lucide-react'
import { api } from '../api'
import { Cat, Logo } from '../components/Mascots'
import { errorText, useApp } from '../store'

export default function Join() {
  const { code } = useParams()
  const nav = useNavigate()
  const { user, ensureUser, toast } = useApp()
  const [info, setInfo] = useState<any>(null)
  const [err, setErr] = useState('')
  const [name, setName] = useState(user && !user.is_guest ? user.name : '')
  const [busy, setBusy] = useState(false)
  useEffect(() => { api(`/api/shared/${code}`).then(setInfo).catch((e) => setErr(errorText(e))) }, [code])

  const join = async () => {
    setBusy(true)
    try {
      await ensureUser()
      const r = await api<{ project_id: string }>(`/api/shared/${code}/join`, { method: 'POST', json: { display_name: name.trim() } })
      nav(`/editor/${r.project_id}`, { replace: true })
      toast({ title: 'Вы в альбоме!', body: 'Добавьте свои фото кнопкой «Добавить фото»', mascot: 'cat' })
    } catch (e) { toast({ title: errorText(e), kind: 'bad' }) } finally { setBusy(false) }
  }

  return (
    <div className="phone" style={{ background: 'var(--yellow)' }}>
      <main className="page no-tab stack" style={{ gap: 20, paddingTop: 'calc(env(safe-area-inset-top) + 28px)' }}>
        <Logo size={30} />
        {err ? (
          <div className="card stack" style={{ alignItems: 'center', textAlign: 'center' }}><Cat size={70} mood="think" /><div className="h2">{err}</div>
            <button className="btn btn-dark" onClick={() => nav('/')}>На главную</button></div>
        ) : !info ? <div className="skeleton" style={{ height: 300 }} /> : (
          <>
            <motion.div initial={{ scale: 0.8, rotate: -6 }} animate={{ scale: 1, rotate: -3 }} className="note" style={{ alignSelf: 'center', marginTop: 10 }}>
              <span className="tape" />{info.owner_name} зовёт в общий альбом
            </motion.div>
            <h1 className="display">{info.title}</h1>
            <div className="row wrap" style={{ gap: 8 }}>
              <span className="chip"><Users size={15} /> {info.members} участн.</span>
              <span className="chip"><Images size={15} /> {info.photos} фото</span>
              <span className="chip">{info.product_title}</span>
            </div>
            <div className="mascot-line"><Cat size={60} mood="wow" /><div className="bubble hand">Скидывайте свои кадры — я соберу из всех одну книгу. Регистрация не нужна!</div></div>
            {info.status !== 'draft' ? <div className="card">Альбом уже отправлен в печать 🎉</div> : (
              <form className="stack" onSubmit={(e) => { e.preventDefault(); join() }}>
                <div className="field"><label htmlFor="nm">Как вас подписать?</label>
                  <input id="nm" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, Маша (мама Артёма)" required maxLength={60} /></div>
                <button className="btn btn-dark btn-lg btn-block" disabled={busy || !name.trim()}>Присоединиться и добавить фото</button>
              </form>
            )}
          </>
        )}
      </main>
    </div>
  )
}
