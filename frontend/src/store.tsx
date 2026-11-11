import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { del, get, keys, set } from 'idb-keyval'
import { api, ApiError, tokenStore, type Layout, type User } from './api'
import { Cat, Robot } from './components/Mascots'

interface Toast { id: number; title: string; body?: string; kind?: 'ok' | 'bad'; mascot?: 'cat' | 'robot'; link?: string }
interface Ctx {
  user: User | null; ready: boolean; online: boolean; unread: number
  login: (email: string, password: string) => Promise<User>
  guest: () => Promise<User>
  register: (name: string, email: string, password: string) => Promise<User>
  logout: () => void
  toast: (t: Omit<Toast, 'id'>) => void
  refreshNotifications: () => void
  ensureUser: () => Promise<User>
}
const AppCtx = createContext<Ctx>(null as any)
export const useApp = () => useContext(AppCtx)

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [unread, setUnread] = useState(0)
  const lastId = useRef<number>(-1)

  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random()
    setToasts((x) => [...x.slice(-2), { ...t, id }])
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), 4600)
  }, [])

  useEffect(() => {
    const on = () => { setOnline(true); flushDrafts().then((n) => n && toast({ title: 'Сеть вернулась', body: `Синхронизировали черновики: ${n}`, mascot: 'robot' })) }
    const off = () => setOnline(false)
    const unauth = () => { tokenStore.set(null); setUser(null) }
    window.addEventListener('online', on); window.addEventListener('offline', off); window.addEventListener('picpac:unauthorized', unauth)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); window.removeEventListener('picpac:unauthorized', unauth) }
  }, [toast])

  useEffect(() => {
    if (!tokenStore.get()) { setReady(true); return }
    api<User>('/api/auth/me').then(setUser).catch(() => tokenStore.set(null)).finally(() => setReady(true))
  }, [])

  const refreshNotifications = useCallback(() => {
    if (!tokenStore.get()) return
    api<{ unread: number; items: any[] }>(`/api/notifications?since_id=${Math.max(0, lastId.current)}`).then((r) => {
      setUnread(r.unread)
      if (r.items.length) {
        const maxId = Math.max(...r.items.map((i) => i.id))
        if (lastId.current >= 0) {
          r.items.slice(0, 2).reverse().forEach((n) => {
            toast({ title: n.title, body: n.body, mascot: n.mascot, link: n.link })
            try { if ('Notification' in window && Notification.permission === 'granted' && document.hidden) new Notification(n.title, { body: n.body, icon: '/icon-192.png' }) } catch { /* noop */ }
          })
        }
        lastId.current = Math.max(lastId.current, maxId)
      } else if (lastId.current < 0) lastId.current = 0
    }).catch(() => {})
  }, [toast])

  useEffect(() => {
    if (!user) return
    lastId.current = -1
    refreshNotifications()
    const t = setInterval(refreshNotifications, 5000)
    return () => clearInterval(t)
  }, [user, refreshNotifications])

  const auth = (r: { token: string; user: User }) => { tokenStore.set(r.token); setUser(r.user); return r.user }
  const value: Ctx = {
    user, ready, online, unread, toast, refreshNotifications,
    login: async (email, password) => auth(await api('/api/auth/login', { method: 'POST', json: { email, password } })),
    guest: async () => auth(await api('/api/auth/guest', { method: 'POST' })),
    register: async (name, email, password) => auth(await api('/api/auth/register', { method: 'POST', json: { name, email, password } })),
    logout: () => { tokenStore.set(null); setUser(null) },
    ensureUser: async () => user ?? auth(await api('/api/auth/guest', { method: 'POST' })),
  }
  return (
    <AppCtx.Provider value={value}>
      {!online && <div className="banner-offline" role="status">Нет сети — работаем офлайн, изменения сохранятся на телефоне</div>}
      {children}
      <div className="toasts" aria-live="polite">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div key={t.id} className={`toast ${t.kind === 'bad' ? 'bad' : ''}`} initial={{ y: -30, opacity: 0, scale: 0.96 }}
              animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: -20, opacity: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              onClick={() => { if (t.link) window.location.assign(t.link) }}>
              {t.mascot === 'cat' ? <Cat size={36} /> : t.mascot === 'robot' ? <Robot size={36} /> : null}
              <div className="grow"><div className="t-title">{t.title}</div>{t.body && <div className="t-body">{t.body}</div>}</div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </AppCtx.Provider>
  )
}

export function errorText(e: unknown) {
  if (e instanceof ApiError) return e.message
  return 'Что-то пошло не так. Попробуйте ещё раз.'
}

// ---------- Черновики: локально (IndexedDB) + синхронизация с сервером ----------
interface LocalDraft { id: string; title: string; options: Record<string, string>; layout: Layout; revision: number; dirty: boolean; savedAt: number }

export async function saveLocal(d: Omit<LocalDraft, 'savedAt'>) {
  try { await set(`draft:${d.id}`, { ...d, savedAt: Date.now() }) } catch { /* приватный режим */ }
}
export async function getLocal(id: string): Promise<LocalDraft | undefined> {
  try { return await get(`draft:${id}`) } catch { return undefined }
}
export async function dropLocal(id: string) { try { await del(`draft:${id}`) } catch { /* noop */ } }

export async function pushDraft(d: Omit<LocalDraft, 'savedAt'>): Promise<number> {
  try {
    const r = await api<{ revision: number }>(`/api/projects/${d.id}`, { method: 'PUT', json: { title: d.title, options: d.options, layout: d.layout, revision: d.revision } })
    await saveLocal({ ...d, revision: r.revision, dirty: false })
    return r.revision
  } catch (e) {
    if (e instanceof ApiError && e.code === 'revision_conflict') {
      // На другом устройстве/в общем альбоме была правка: сохраняем последнюю версию пользователя поверх
      const r = await api<{ revision: number }>(`/api/projects/${d.id}`, { method: 'PUT', json: { title: d.title, options: d.options, layout: d.layout, revision: d.revision, force: true } })
      await saveLocal({ ...d, revision: r.revision, dirty: false })
      return r.revision
    }
    if (e instanceof ApiError && e.status === 0) await saveLocal({ ...d, dirty: true })
    throw e
  }
}

export async function flushDrafts(): Promise<number> {
  let n = 0
  try {
    for (const k of await keys()) {
      if (typeof k !== 'string' || !k.startsWith('draft:')) continue
      const d = await get<LocalDraft>(k)
      if (d?.dirty) { try { await pushDraft(d); n++ } catch { /* повторим позже */ } }
    }
  } catch { /* noop */ }
  return n
}
