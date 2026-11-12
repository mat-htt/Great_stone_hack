// Клиент API: токен, единый формат ошибок, понятные сообщения при обрыве сети.

export type Role = 'client' | 'operator' | 'admin'
export interface User { id: number; email: string | null; name: string; role: Role; is_guest: boolean }
export interface SizeOpt { id: string; label: string; w_cm: number; h_cm: number; mult: number }
export interface Opt { id: string; label: string; add_minor?: number }
export interface Advice { code: string; who: 'cat' | 'robot'; tool: string; params: any; title: string; text: string }
export interface Category { id: string; name: string; emoji: string }
export interface Product {
  id: string; title: string; subtitle: string; category: string; kind: 'book' | 'prints' | 'single' | 'card' | 'calendar'; mockup: string
  description: string; base_price_minor: number; currency: string; production_days: number; badge: string; accent: string
  specs: { sizes: SizeOpt[]; covers?: Opt[]; papers?: Opt[]; colors?: (Opt & { hex: string })[]; pages?: { min: number; max: number; included: number; extra_spread_minor: number }
    photos?: { min: number; max: number }; requirements?: string; shared?: boolean; template?: string }
}
export interface Photo {
  id: string; filename: string; width: number; height: number; taken_at: string | null; place: string | null
  sharpness: number; brightness: number; faces: { x: number; y: number; w: number; h: number }[]; score: number
  source: string; ai_tool: string | null; parent_id: string | null; url: string; thumb: string; owner_id: number; project_id: string | null
  advice: Advice[]
}
export interface Slot { photo_id: string | null; crop: { x: number; y: number; zoom: number } }
/** Оформление текста на странице/обложке. Всё необязательно — по умолчанию берётся из дизайна. */
export interface TextStyle {
  font?: 'sans' | 'serif' | 'hand' | 'script' | 'display'; size?: number; color?: string
  align?: 'left' | 'center' | 'right'; upper?: boolean; pos?: 'top' | 'middle' | 'bottom'
}
export interface Page { id: string; template: string; slots: Slot[]; caption?: string; text?: TextStyle }
export interface Layout { cover: Slot | null; pages: Page[]; title?: string; title_style?: TextStyle }
export interface Project {
  id: string; title: string; product_id: string; options: Record<string, string>; status: string; revision: number
  share_code: string | null; owner_id: number; owner_name: string; pages_count: number; cover_photo_id: string | null; kept?: boolean
  layout: Layout; photos: Photo[]; product: Product; members: { user_id: number; name: string }[]
  contributions: Record<string, number>; updated_at: string; role?: string
}
export interface Issue {
  id: string; severity: 'critical' | 'warning' | 'info'; code: string; title: string; message: string
  page: number | null; slot: number | null; photo_id: string | null; fixes: { action: string; label: string }[]; dpi?: number
}
export interface Preflight { ok: boolean; score: number; critical: number; warnings: number; issues: Issue[]; pages: number; photos: number }
export interface Quote {
  unit_minor: number; subtotal_minor: number; discount_minor: number; delivery_minor: number; total_minor: number
  currency: string; lines: { label: string; amount_minor: number }[]; promo: { code: string; description: string } | null
  promo_error: string | null; production_days: number; delivery_days: number
}
export interface OrderEvent { status: string; stage: string | null; message: string; actor: string; created_at: string; label: string }
export interface Ticket { id: number; order_id: number | null; subject: string; topic: string; status: string; created_at: string
  messages: { id: number; author_role: string; author_name: string; text: string; created_at: string }[]; order_number?: string; overdue?: boolean }
export interface Order {
  id: number; number: string; status: string; status_label: string; stage: string | null; stage_label: string | null
  product_id: string; project_id: string | null; snapshot: any; quantity: number; delivery_method: string; delivery_address: string
  promo_code: string | null; subtotal_minor: number; discount_minor: number; delivery_minor: number; total_minor: number
  currency: string; track_number: string | null; eta: string | null; created_at: string; events?: OrderEvent[]
  tickets?: Ticket[] | number; project?: { id: string; title: string; cover_photo_id: string | null } | null; replayed?: boolean
  customer?: string; channel?: string
}
export interface Memory { id: string; title: string; subtitle: string; count: number; cover_id: string; photo_ids: string[]; preview_ids: string[] }
export interface AiTool { id: string; title: string; subtitle: string; group: string; icon: string; type: string; params?: any
  provider: string; provider_kind: string; location: string; model: string; generative?: boolean; manual?: boolean }

export class ApiError extends Error {
  status: number; code: string; details: any
  constructor(status: number, code: string, message: string, details?: any) {
    super(message); this.status = status; this.code = code; this.details = details || {}
  }
}

const TOKEN_KEY = 'picpac.token'
export const tokenStore = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY) } catch { return null } },
  set: (t: string | null) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY) } catch { /* noop */ } },
}

export async function api<T = any>(path: string, opts: RequestInit & { json?: any; idem?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { ...(opts.headers as any) }
  const token = tokenStore.get()
  if (token) headers.Authorization = `Bearer ${token}`
  if (opts.idem) headers['Idempotency-Key'] = opts.idem
  let body = opts.body
  if (opts.json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(opts.json) }
  let res: Response
  try {
    res = await fetch(path, { ...opts, headers, body })
  } catch {
    throw new ApiError(0, 'offline', 'Нет связи с сервером. Мы сохранили ваши изменения и повторим, когда сеть вернётся.')
  }
  if (!res.ok) {
    let data: any = null
    try { data = await res.json() } catch { /* noop */ }
    const e = data?.error
    if (res.status === 401) window.dispatchEvent(new CustomEvent('picpac:unauthorized'))
    throw new ApiError(res.status, e?.code || `http_${res.status}`, e?.message || 'Не удалось выполнить запрос', e?.details)
  }
  const type = res.headers.get('content-type') || ''
  if (type.includes('application/json')) return res.json()
  return res as any
}

export const media = (url: string) => {
  const t = tokenStore.get()
  return t ? `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(t)}` : url
}

export const money = (minor: number, currency = 'BYN') =>
  `${(minor / 100).toLocaleString('ru-RU', { minimumFractionDigits: minor % 100 ? 2 : 0, maximumFractionDigits: 2 })} ${currency === 'BYN' ? 'BYN' : currency}`

export const uuid = () => (crypto as any).randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`

let session = ''
export function track(name: string, props: Record<string, any> = {}) {
  try {
    session ||= sessionStorage.getItem('picpac.sess') || uuid().slice(0, 18)
    sessionStorage.setItem('picpac.sess', session)
  } catch { session ||= uuid().slice(0, 18) }
  api('/api/events', { method: 'POST', json: { session, name, props } }).catch(() => {})
}

export const fmtDate = (iso: string | null | undefined, withTime = false) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('ru-RU', { day: 'numeric', month: 'long', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}), timeZone: 'Europe/Minsk' })
}
