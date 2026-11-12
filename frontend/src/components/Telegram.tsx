import { useCallback, useEffect, useState } from 'react'
import { Check, Send } from 'lucide-react'
import { api } from '../api'
import { errorText, useApp } from '../store'
import { Mascot } from './Mascots'
import { Sheet } from './ui'

export type TgState = {
  configured: boolean; bot_username: string | null; requested: boolean; linked: boolean; enabled: boolean
  username: string; tg_name: string; link: string | null
}

/** Состояние подписки на бота; пока клиент не нажал Start в Telegram — тихо опрашиваем раз в 4 с. */
export function useTelegram(poll = false) {
  const [state, setState] = useState<TgState | null>(null)
  const load = useCallback(() => api<TgState>('/api/telegram/me').then(setState).catch(() => {}), [])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!poll || !state?.requested || state.linked) return
    const t = setInterval(load, 4000)
    return () => clearInterval(t)
  }, [poll, state?.requested, state?.linked, load])
  return { state, setState, load }
}

const STEPS = ['Печать и ОТК', 'Готов к выдаче', 'В доставке и когда ждать']

export default function TelegramSheet({ open, onClose, tg }: { open: boolean; onClose: () => void; tg: ReturnType<typeof useTelegram> }) {
  const { toast } = useApp()
  const [nick, setNick] = useState('')
  const { state, setState, load } = tg
  useEffect(() => { if (open) { load(); setNick(state?.username ? '@' + state.username : '') } }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open || !state?.requested || state.linked) return
    const t = setInterval(load, 4000)
    return () => clearInterval(t)
  }, [open, state?.requested, state?.linked, load])

  const run = async (fn: () => Promise<TgState | unknown>, ok?: string) => {
    try { const r = await fn(); if (r && typeof r === 'object' && 'configured' in r) setState(r as TgState); if (ok) toast({ title: ok }) }
    catch (e) { toast({ title: errorText(e), kind: 'bad' }) }
  }
  const connect = () => run(async () => {
    const r = await api<TgState>('/api/telegram/me', { method: 'POST', json: { username: nick } })
    if (r.link) window.open(r.link, '_blank', 'noopener')
    return r
  })

  return (
    <Sheet open={open} onClose={onClose} label="Статусы в Telegram">
      <div className="stack" style={{ gap: 14 }}>
        <div className="row" style={{ gap: 12 }}>
          <Mascot pose="robot-head" size={64} />
          <div className="grow"><h2 className="t-h2">Статусы в Telegram</h2>
            <div className="t-sm muted">По желанию. Робот напишет, когда заказ перейдёт на следующий этап.</div></div>
        </div>
        <div className="stack" style={{ gap: 6 }}>
          {STEPS.map((s) => <div key={s} className="row t-sm" style={{ gap: 8 }}><Check size={16} style={{ color: 'var(--primary)' }} />{s}</div>)}
        </div>

        {state?.linked ? (
          <>
            <div className="card row" style={{ gap: 10, background: 'var(--primary-soft)' }}>
              <Send size={20} /><div className="grow"><b>Подключено</b><div className="t-sm muted">{state.tg_name || (state.username && '@' + state.username) || 'Telegram'}</div></div>
              <button className={`switch ${state.enabled ? 'on' : ''}`} aria-label="Присылать статусы"
                onClick={() => run(() => api('/api/telegram/me', { method: 'PUT', json: { enabled: !state.enabled } }))} />
            </div>
            <button className="btn btn-secondary btn-block" onClick={() => run(() => api('/api/telegram/me/test', { method: 'POST' }), 'Отправили проверочное сообщение')}>Прислать проверку</button>
            <button className="btn btn-block" style={{ color: 'var(--danger)', background: 'none' }} onClick={() => run(() => api('/api/telegram/me', { method: 'DELETE' }), 'Telegram отключён')}>Отключить</button>
          </>
        ) : (
          <>
            <input className="input" placeholder="@ваш_ник (необязательно)" value={nick} onChange={(e) => setNick(e.target.value)} aria-label="Ник в Telegram" autoCapitalize="off" autoCorrect="off" />
            {state && !state.configured && (
              <div className="card t-sm" style={{ background: 'var(--fill)' }}>
                Бот скоро заработает — администратор ещё подключает его. Ник сохраним, а ссылка на бота появится здесь.
              </div>
            )}
            {state?.requested && state.link && (
              <div className="t-sm muted">Откройте бота и нажмите <b>Start</b> — подключение подтвердится автоматически. <a href={state.link} target="_blank" rel="noopener" style={{ color: 'var(--primary)', fontWeight: 650 }}>Открыть ещё раз</a></div>
            )}
            <button className="btn btn-primary btn-block" onClick={connect}><Send size={18} />{state?.configured ? 'Подключить Telegram' : 'Сохранить ник'}</button>
          </>
        )}
      </div>
    </Sheet>
  )
}
