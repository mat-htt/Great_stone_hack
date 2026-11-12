import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, House, LayoutGrid, Package, Plus, Sparkles, UserRound } from 'lucide-react'
import { Mockup, PHOTO, shotFor } from './Mockup'
import { media, type Page, type Photo, type Slot } from '../api'
import { useApp } from '../store'

export function Ambient() { return <div className="ambient" aria-hidden><i /><i /><i /></div> }

export function Img({ src, alt = '', className = '', style, fit = 'cover' }: { src: string; alt?: string; className?: string; style?: React.CSSProperties; fit?: 'cover' | 'contain' }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <div className={`ph ${loaded ? '' : 'loading'} ${className}`} style={style}>
      <img src={src.startsWith('/api/media') ? media(src) : src} alt={alt} loading="lazy" decoding="async" style={{ objectFit: fit }} onLoad={() => setLoaded(true)} />
    </div>
  )
}

export function TopBar({ title, back, right, left = false, glass = false }: { title?: ReactNode; back?: boolean | string; right?: ReactNode; left?: boolean; glass?: boolean }) {
  const nav = useNavigate()
  return (
    <header className={`topbar ${left ? 'left' : ''} ${glass ? 'glass' : ''}`}>
      {back ? <button className="icon-btn" aria-label="Назад" onClick={() => (typeof back === 'string' ? nav(back) : nav(-1))}><ChevronLeft size={22} /></button> : null}
      <div className="title">{title}</div>
      {right ?? (back ? <div style={{ width: 44 }} /> : null)}
    </header>
  )
}

// Что можно сделать — показывается по центральной кнопке «+»
const MAKE: { id: string; title: string; sub: string }[] = [
  { id: 'book-classic', title: 'Фотокнига', sub: 'от 72 BYN' }, { id: 'prints-classic', title: 'Фотопечать', sub: 'от 0,65 BYN' },
  { id: 'mug', title: 'Кружка', sub: '19 BYN' }, { id: 'calendar-wall', title: 'Календарь', sub: '2027 год' },
  { id: 'postcard', title: 'Открытка', sub: 'с вашим текстом' }, { id: 'grad-school-11', title: 'Выпускной', sub: 'общий альбом' },
  { id: 'canvas', title: 'Холст', sub: 'на подрамнике' }, { id: 'pillow', title: 'Подушка', sub: 'атлас или мат' },
  { id: 'tshirt', title: 'Футболка', sub: 'S–XXL' }, { id: 'puzzle', title: 'Пазл', sub: '120 / 252' },
  { id: 'magnets', title: 'Магниты', sub: 'набор' }, { id: 'poster', title: 'Постер', sub: 'A3–A1' },
]
const MOCK: Record<string, string> = { mug: 'mug', 'calendar-wall': 'calendar', postcard: 'card', canvas: 'canvas', pillow: 'pillow', tshirt: 'tshirt', puzzle: 'puzzle', magnets: 'magnet', poster: 'poster' }

export function MakeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate()
  const go = (path: string) => { onClose(); nav(path) }
  return (
    <Sheet open={open} onClose={onClose} label="Что создаём?">
      <h2 className="t-h2" style={{ marginBottom: 12 }}>Что создаём?</h2>
      <button className="card row" onClick={() => go('/create?product=book-classic')} style={{ width: '100%', border: 0, cursor: 'pointer', textAlign: 'left', marginBottom: 12, gap: 12, background: 'linear-gradient(120deg, var(--primary), color-mix(in srgb, var(--primary) 70%, var(--glow-3)))', color: 'var(--primary-ink)' }}>
        <Sparkles size={22} /><span className="grow"><b>Просто загрузить фото</b><div className="t-sm" style={{ opacity: .85 }}>Кот сам соберёт фотокнигу за минуту</div></span><ChevronRight size={18} />
      </button>
      <div className="make-grid">
        {MAKE.map((m) => (
          <button key={m.id} className="make-item" onClick={() => go(`/catalog/${m.id}`)} aria-label={m.title}>
            {PHOTO[m.id] ? <img src={PHOTO[m.id]} alt="" loading="lazy" /> : <div className="mk-art"><Mockup kind={MOCK[m.id] || 'mug'} src={shotFor(m.id)} size={74} /></div>}
            <span>{m.title}<small>{m.sub}</small></span>
          </button>
        ))}
      </div>
    </Sheet>
  )
}

export function Dock() {
  const loc = useLocation()
  const { unread } = useApp()
  const [make, setMake] = useState(false)
  const is = (p: string) => (p === '/' ? loc.pathname === '/' : loc.pathname.startsWith(p))
  return (
    <>
      <nav className="dock" aria-label="Навигация">
        <Link to="/" className={is('/') ? 'active' : ''}><House size={23} />Главная</Link>
        <Link to="/catalog" className={is('/catalog') ? 'active' : ''}><LayoutGrid size={23} />Каталог</Link>
        <a href="/create" aria-label="Создать" onClick={(e) => { e.preventDefault(); setMake(true) }}><span className="fab"><Plus size={28} strokeWidth={2.6} /></span></a>
        <Link to="/orders" className={is('/orders') ? 'active' : ''}><Package size={23} />Заказы</Link>
        <Link to="/profile" className={is('/profile') ? 'active' : ''}><UserRound size={23} />{unread > 0 && <span className="dot" />}Профиль</Link>
      </nav>
      <MakeSheet open={make} onClose={() => setMake(false)} />
    </>
  )
}

export function Sheet({ open, onClose, children, label, wide = false }: { open: boolean; onClose: () => void; children: ReactNode; label?: string; wide?: boolean }) {
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="sheet-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div role="dialog" aria-modal="true" aria-label={label} className={`sheet ${wide ? 'wide' : ''}`} style={{ x: '-50%' }}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 380, damping: 38 }}>
            <div className="sheet-grip" />
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// ---------- Макеты страниц (раскладка рамок) ----------
export const TEMPLATES: Record<string, { title: string; slots: [number, number, number, number][]; caption?: boolean }> = {
  full: { title: 'Целиком', slots: [[0, 0, 1, 1]] },
  frame: { title: 'С полями', slots: [[0.09, 0.09, 0.82, 0.82]] },
  duo: { title: 'Две', slots: [[0.05, 0.05, 0.43, 0.9], [0.52, 0.05, 0.43, 0.9]] },
  duo_h: { title: 'Две гориз.', slots: [[0.05, 0.05, 0.9, 0.43], [0.05, 0.52, 0.9, 0.43]] },
  trio: { title: 'Три', slots: [[0.05, 0.05, 0.56, 0.9], [0.65, 0.05, 0.3, 0.43], [0.65, 0.52, 0.3, 0.43]] },
  quad: { title: 'Четыре', slots: [[0.05, 0.05, 0.43, 0.43], [0.52, 0.05, 0.43, 0.43], [0.05, 0.52, 0.43, 0.43], [0.52, 0.52, 0.43, 0.43]] },
  story: { title: 'С подписью', slots: [[0, 0, 1, 0.74]], caption: true },
  text: { title: 'Цитата', slots: [], caption: true },
}

// ---------- Дизайн-шаблоны (из backend/app/config_data/templates.json) ----------
export interface Design {
  id: string; name: string; tags: string[]; page: string; ink: string; accent: string
  font: 'sans' | 'serif' | 'hand' | 'script' | 'display'; frame: string; decor: string
  bg?: string; art?: boolean; inset?: number // иллюстрированный фон и поле, в котором остаётся видна иллюстрация
}
let designsCache: Design[] | null = null
export function useDesigns() {
  const [d, setD] = useState<Design[]>(designsCache || [])
  useEffect(() => {
    if (designsCache) return
    fetch('/api/templates').then((r) => r.json()).then((x) => { designsCache = x.templates; setD(x.templates) }).catch(() => {})
  }, [])
  return d
}
export const FALLBACK_DESIGN: Design = { id: 'clean', name: 'Чистый лист', tags: [], page: '#FFFFFF', ink: '#1A1A1A', accent: '#1A1A1A', font: 'sans', frame: 'none', decor: 'none' }
export const FONT: Record<string, string> = {
  sans: "'Onest Variable', sans-serif", serif: "Georgia, 'Times New Roman', serif", hand: "'Caveat', cursive",
  script: "'Marck Script', 'Caveat', cursive", display: "'Playfair Display', Georgia, serif",
}

function frameStyle(frame: string, accent: string): React.CSSProperties {
  switch (frame) {
    case 'thin': return { boxShadow: `inset 0 0 0 1.5px ${accent}55` }
    case 'white': return { border: '4px solid #fff', boxShadow: '0 4px 14px rgba(0,0,0,.18)' }
    case 'polaroid': return { border: '4px solid #fff', borderBottomWidth: 14, boxShadow: '0 6px 16px rgba(0,0,0,.2)' }
    case 'round': return { borderRadius: 14 }
    case 'circle': return { borderRadius: '50%', border: '3px solid #fff', boxShadow: `0 0 0 2px ${accent}66` }
    case 'arch': return { borderRadius: '999px 999px 10px 10px', border: '3px solid #fff', boxShadow: '0 6px 16px rgba(0,0,0,.14)' }
    case 'neon': return { borderRadius: '50%', boxShadow: `0 0 0 2px ${accent}, 0 0 14px 3px ${accent}, 0 0 34px 6px ${accent}88` }
    default: return {}
  }
}
/** Рамка фото внутри безопасного поля дизайна: иллюстрация по краям страницы остаётся видна. */
export const insetBox = (b: [number, number, number, number], inset = 0): [number, number, number, number] =>
  inset ? [inset + b[0] * (1 - 2 * inset), inset + b[1] * (1 - 2 * inset), b[2] * (1 - 2 * inset), b[3] * (1 - 2 * inset)] : b

function Decor({ kind, color }: { kind: string; color: string }) {
  if (kind === 'none' || !kind) return null
  const common: React.CSSProperties = { position: 'absolute', inset: 0, pointerEvents: 'none', width: '100%', height: '100%' }
  const P = (d: string, op = 0.8) => <path d={d} fill={color} opacity={op} />
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={common} aria-hidden>
      {kind === 'corners' && <g fill="none" stroke={color} strokeWidth=".7" opacity=".8"><path d="M3 12 V3 H12" /><path d="M88 3 H97 V12" /><path d="M3 88 V97 H12" /><path d="M88 97 H97 V88" /></g>}
      {kind === 'stars' && [[8, 8], [92, 10], [10, 90], [90, 88], [50, 4]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i % 2 ? 0.9 : 1.4} fill={color} opacity=".8" />)}
      {kind === 'hearts' && [[7, 8], [93, 92], [92, 7]].map(([x, y], i) => <g key={i} transform={`translate(${x} ${y}) scale(.35)`}>{P('M0 3 C0 -2 6 -2 6 3 C6 7 0 10 0 12 C0 10 -6 7 -6 3 C-6 -2 0 -2 0 3Z')}</g>)}
      {kind === 'leaves' && [[6, 6, 30], [94, 94, 210], [94, 6, 120]].map(([x, y, r], i) => <g key={i} transform={`translate(${x} ${y}) rotate(${r}) scale(.6)`}>{P('M0 0 C6 -6 14 -4 16 0 C14 4 6 6 0 0Z', 0.55)}</g>)}
      {kind === 'snow' && Array.from({ length: 14 }).map((_, i) => <circle key={i} cx={(i * 37) % 100} cy={(i * 53) % 100} r={0.5 + (i % 3) * 0.3} fill={color} opacity=".55" />)}
      {kind === 'confetti' && Array.from({ length: 12 }).map((_, i) => <rect key={i} x={(i * 41) % 98} y={(i * 29) % 96} width="1.6" height=".8" transform={`rotate(${i * 30} ${(i * 41) % 98} ${(i * 29) % 96})`} fill={color} opacity=".7" />)}
      {kind === 'tape' && <g fill={color} opacity=".35"><rect x="40" y="0" width="20" height="4" /><rect x="0" y="45" width="3" height="12" /></g>}
      {kind === 'film' && <g fill={color} opacity=".25">{Array.from({ length: 10 }).map((_, i) => <g key={i}><rect x={2 + i * 10} y="1" width="5" height="2" rx=".4" /><rect x={2 + i * 10} y="97" width="5" height="2" rx=".4" /></g>)}</g>}
    </svg>
  )
}

export function SlotView({ slot, photo, box, selected, issue, onClick, design, filter }: {
  slot: Slot; photo?: Photo; box: [number, number, number, number]; selected?: boolean; issue?: 'critical' | 'warning' | null
  onClick?: () => void; design: Design; filter?: string
}) {
  const [x, y, w, h] = box
  const pad = design.frame === 'none' || !design.frame ? 0 : 0.012
  const style: React.CSSProperties = { left: `${(x + pad) * 100}%`, top: `${(y + pad) * 100}%`, width: `${(w - pad * 2) * 100}%`, height: `${(h - pad * 2) * 100}%`, ...frameStyle(design.frame, design.accent) }
  if (!slot.photo_id) {
    return <button type="button" className={`slot empty ${selected ? 'sel' : ''}`} style={style} onClick={onClick} aria-label="Пустая рамка — добавить фото"><Plus size={18} /></button>
  }
  const pos = `${(slot.crop?.x ?? 0.5) * 100}% ${(slot.crop?.y ?? 0.5) * 100}%`
  return (
    <div className={`slot ${selected ? 'sel' : ''} ${issue ? `issue ${issue}` : ''}`} style={{ ...style, cursor: onClick ? 'pointer' : undefined }} onClick={onClick}
      role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} aria-label={onClick ? 'Фото — выбрать' : undefined}
      onKeyDown={(e) => { if (onClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick() } }}>
      <img src={media(photo?.thumb || `/api/media/${slot.photo_id}?size=thumb`)} alt="" decoding="async" draggable={false}
        style={{ objectPosition: pos, transform: `scale(${slot.crop?.zoom ?? 1})`, transformOrigin: pos, filter, transition: 'filter .3s' }} />
    </div>
  )
}

export function PageView({ page, photos, aspect, selected, onSlot, issues, design = FALLBACK_DESIGN, filters }: {
  page: Page; photos: Record<string, Photo>; aspect: number; selected?: number | null; onSlot?: (i: number) => void
  issues?: Record<string, 'critical' | 'warning'>; design?: Design; filters?: Record<string, string>
}) {
  const tpl = TEMPLATES[page.template] || TEMPLATES.full
  const capStyle: React.CSSProperties = { color: design.ink, fontFamily: FONT[design.font] || FONT.sans, fontWeight: design.font === 'sans' ? 700 : 500 }
  return (
    <div className="bookpage" style={{ aspectRatio: String(aspect), background: design.bg ? `${design.page} url(${design.bg}) center / cover` : design.page, containerType: 'inline-size' }}>
      <Decor kind={design.decor} color={design.accent} />
      {!tpl.slots.length ? (
        <div className="center" style={{ position: 'absolute', inset: '16%', flexDirection: 'column', gap: 8, textAlign: 'center' }}>
          <div style={{ width: 26, height: 2, background: design.accent, borderRadius: 2 }} />
          <div style={{ ...capStyle, fontSize: design.font === 'script' || design.font === 'hand' ? '10cqw' : '7.5cqw', lineHeight: 1.1 }}>{page.caption || 'Ваш текст'}</div>
        </div>
      ) : page.slots.map((s, i) => (
        <SlotView key={i} slot={s} photo={s.photo_id ? photos[s.photo_id] : undefined} box={insetBox(tpl.slots[Math.min(i, tpl.slots.length - 1)], design.inset)} design={design}
          selected={selected === i} issue={issues?.[`${i}`] ?? null} onClick={onSlot ? () => onSlot(i) : undefined}
          filter={s.photo_id ? filters?.[s.photo_id] : undefined} />
      ))}
      {tpl.caption && tpl.slots.length > 0 && <div className="caption" style={capStyle}>{page.caption || ''}</div>}
    </div>
  )
}

export function BeforeAfter({ before, after }: { before: string; after: string }) {
  const [pos, setPos] = useState(50)
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const ro = new ResizeObserver(() => setW(ref.current?.clientWidth || 0))
    if (ref.current) ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  const move = (x: number) => { const r = ref.current!.getBoundingClientRect(); setPos(Math.max(0, Math.min(100, ((x - r.left) / r.width) * 100))) }
  return (
    <div className="ba" ref={ref} onPointerDown={(e) => { (e.currentTarget as Element).setPointerCapture(e.pointerId); move(e.clientX) }}
      onPointerMove={(e) => e.buttons && move(e.clientX)} role="slider" aria-label="Сравнить до и после" aria-valuenow={Math.round(pos)} aria-valuemin={0} aria-valuemax={100} tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'ArrowLeft') setPos((p) => Math.max(0, p - 5)); if (e.key === 'ArrowRight') setPos((p) => Math.min(100, p + 5)) }}>
      <img src={before} alt="До" draggable={false} />
      <div className="after" style={{ width: `${pos}%` }}><img src={after} alt="После" draggable={false} style={{ width: w || '100%' }} /></div>
      <div className="handle" style={{ left: `calc(${pos}% - 1px)` }}><span className="knob">↔</span></div>
      <span className="lbl" style={{ left: 10 }}>после</span><span className="lbl" style={{ right: 10 }}>до</span>
    </div>
  )
}

export const ORDER_FLOW = [
  { key: 'accepted', label: 'Принят' }, { key: 'moderation', label: 'Проверка макета' }, { key: 'print', label: 'Печать' },
  { key: 'lamination', label: 'Ламинация' }, { key: 'binding', label: 'Сборка' }, { key: 'qc', label: 'Контроль качества' },
  { key: 'shipped', label: 'В доставке' }, { key: 'completed', label: 'Получен' },
]
export function flowIndex(status: string, stage: string | null) {
  if (status === 'production') return ORDER_FLOW.findIndex((s) => s.key === (stage || 'print'))
  if (status === 'needs_fix') return 1
  return ORDER_FLOW.findIndex((s) => s.key === status)
}
export function MiniProgress({ status, stage }: { status: string; stage: string | null }) {
  const idx = flowIndex(status, stage)
  return (
    <div style={{ display: 'flex', gap: 3 }} aria-label={`Этап ${idx + 1} из ${ORDER_FLOW.length}`}>
      {ORDER_FLOW.map((s, i) => <div key={s.key} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= idx ? 'var(--primary)' : 'var(--fill-2)' }} />)}
    </div>
  )
}

export function useDebounced<T>(value: T, ms = 500) {
  const [v, setV] = useState(value)
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t) }, [value, ms])
  return v
}

export function aspectOf(product: { specs?: any } | undefined, sizeId?: string) {
  const sizes = product?.specs?.sizes || []
  const s = sizes.find((x: any) => x.id === sizeId) || sizes[0]
  return s ? s.w_cm / s.h_cm : 1
}

export const plural = (n: number, one: string, few: string, many: string) => {
  const a = n % 10, b = n % 100
  return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 10 || b >= 20) ? few : many
}

// ---------- Карточка дизайна: настоящая мини-обложка, а не цветной квадрат ----------
const SAMPLE: [RegExp, string][] = [
  [/grad|player/, 'grad_06.jpg'], [/kinder|magic/, 'garden_03.jpg'], [/travel|cinema/, 'sea_00.jpg'], [/mom|wedding|meadow/, 'garden_05.jpg'],
  [/autumn|collage/, 'lake_01.jpg'], [/moments|baby/, 'sea_09.jpg'], [/xmas|year|bauble|christmas|neon|stamp/, 'sea_00.jpg'],
]
export const sampleFor = (d: Design) => `/api/gallery/file/${SAMPLE.find(([r]) => r.test(d.id))?.[1] || 'lake_03.jpg'}`

export function DesignCard({ d, on, onClick, title }: { d: Design; on?: boolean; onClick?: () => void; title?: string }) {
  const [x, y, w, h] = d.frame === 'circle' || d.frame === 'neon' ? [0.22, 0.12, 0.56, 0.56] : [0.16, 0.12, 0.68, 0.6]
  return (
    <button type="button" className={`design-card ${on ? 'on' : ''}`} onClick={onClick} aria-pressed={on} aria-label={`Дизайн ${d.name}`}>
      <div className="dc-page" style={{ background: d.bg ? `${d.page} url(${d.bg}) center / cover` : d.page }}>
        <Decor kind={d.decor} color={d.accent} />
        <div className="dc-photo" style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%`, ...frameStyle(d.frame, d.accent) }}>
          <img src={media(sampleFor(d))} alt="" decoding="async" draggable={false} />
        </div>
        <div className="dc-title" style={{ color: d.ink, fontFamily: FONT[d.font] || FONT.sans, fontWeight: d.font === 'sans' ? 750 : d.font === 'display' ? 700 : 400 }}>{title || d.name.split(' ·')[0]}</div>
      </div>
      <div className="t-xs dc-name">{d.name}</div>
    </button>
  )
}

/** Поводы для фильтра дизайнов */
export const OCCASIONS = ['Все', 'новый год', 'выпускной', 'дети', 'свадьба', 'путешествия', 'семья']
export const byOccasion = (list: Design[], occ: string) => occ === 'Все' ? list : list.filter((d) => d.tags.some((t) => t.toLowerCase().includes(occ)))
