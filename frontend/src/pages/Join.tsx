import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { Logo, Mascot } from '../components/Mascots'
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
    try { await ensureUser(); const r = await api<{ project_id: string }>(`/api/shared/${code}/join`, { method: 'POST', json: { display_name: name.trim() } }); nav(`/editor/${r.project_id}`, { replace: true }); toast({ title: 'Вы в альбоме', body: 'Добавьте свои фото кнопкой «Ещё фото»', mascot: 'cat' }) }
    catch (e) { toast({ title: errorText(e), kind: 'bad' }) } finally { setBusy(false) }
  }
  return (
    <div className="screen">
      <main className="content no-dock stack" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 22px)', gap: 18 }}>
        <Logo size={28} />
        {err ? <div className="card stack" style={{ alignItems: 'center', textAlign: 'center' }}><Mascot pose="cat-point" size={120} /><h2 className="t-h2">{err}</h2><button className="btn btn-secondary" onClick={() => nav('/')}>На главную</button></div>
          : !info ? <div className="skeleton" style={{ height: 300 }} /> : (
            <>
              <div className="center" style={{ height: 220, borderRadius: 'var(--r-xl)', background: 'radial-gradient(80% 90% at 50% 100%, var(--glow-1), transparent)' }}><Mascot pose="duo-cables" size={330} /></div>
              <div className="t-sm muted">{info.owner_name} приглашает в общий альбом</div>
              <h1 className="t-display">{info.title}</h1>
              <div className="row wrap" style={{ gap: 8 }}><span className="chip">{info.members} участн.</span><span className="chip">{info.photos} фото</span><span className="chip">{info.product_title}</span></div>
              {info.status !== 'draft' ? <div className="card">Альбом уже отправлен в печать.</div> : (
                <form className="stack" onSubmit={(e) => { e.preventDefault(); join() }}>
                  <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Как вас подписать? Например, мама Артёма" required maxLength={60} aria-label="Ваше имя" />
                  <button className="btn btn-primary btn-lg btn-block" disabled={busy || !name.trim()}>Присоединиться</button>
                  <div className="t-sm muted" style={{ textAlign: 'center' }}>Регистрация не нужна</div>
                </form>
              )}
            </>
          )}
      </main>
    </div>
  )
}
