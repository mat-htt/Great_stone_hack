import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, House, LayoutGrid, Package, Plus, Sparkles, UserRound } from 'lucide-react'
import { productImage } from './Mockup'
import { media, type Page, type Photo, type Slot, type TextStyle } from '../api'
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
            <img src={productImage(m.id)} alt="" loading="lazy" />
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

// ---------- Текст на страницах ----------
export const FONT_LIST: { id: NonNullable<TextStyle['font']>; label: string }[] = [
  { id: 'sans', label: 'Простой' }, { id: 'serif', label: 'Классика' }, { id: 'display', label: 'Заголовок' }, { id: 'script', label: 'Каллиграфия' }, { id: 'hand', label: 'От руки' },
]
export const TEXT_COLORS = ['#1A1A1A', '#FFFFFF', '#DD5757', '#364C49', '#B8892D', '#2F5DA8', '#8E5BB5', '#E8A0B4']
/** Стили-шаблоны: шрифт + размер + регистр одним нажатием. */
export const TEXT_STYLES: { id: string; label: string; st: TextStyle }[] = [
  { id: 'classic', label: 'Классика', st: { font: 'serif', size: 1, upper: false } },
  { id: 'script', label: 'Каллиграфия', st: { font: 'script', size: 1.15, upper: false } },
  { id: 'title', label: 'Крупный заголовок', st: { font: 'display', size: 1.45, upper: false } },
  { id: 'minimal', label: 'Минимализм', st: { font: 'sans', size: 0.72, upper: true } },
  { id: 'note', label: 'Записка', st: { font: 'hand', size: 1.15, upper: false } },
  { id: 'photo', label: 'На фото', st: { font: 'sans', size: 1.1, color: '#FFFFFF', pos: 'bottom', upper: false } },
]
export const TEXT_PRESETS = ['Наша история', 'Лето 2026', 'Самые счастливые дни', 'С днём рождения!', 'Путешествие мечты', 'Семья — это всё',
  'Мой первый год', 'Выпускной 2027', 'Вместе навсегда', 'Люблю тебя', 'Лучшие друзья', 'Новый год 2027', 'Продолжение следует…']
const SCRIPTY = (f?: string) => f === 'script' || f === 'hand'

export function textCss(ts: TextStyle | undefined, d: Design, base: number, over = false, cover = false): React.CSSProperties {
  const font = ts?.font || d.font
  const white = (ts?.color || '').toUpperCase() === '#FFFFFF'
  return {
    color: ts?.color || (over ? '#fff' : d.ink), fontFamily: FONT[font] || FONT.sans,
    fontWeight: font === 'sans' || font === 'display' ? 700 : SCRIPTY(font) ? 400 : 500,
    fontSize: (base * (ts?.size || 1) * (SCRIPTY(font) && !cover ? 1.3 : 1)).toFixed(2) + 'cqw', textAlign: ts?.align || 'center',
    textTransform: ts?.upper ? 'uppercase' : undefined, letterSpacing: ts?.upper ? '.09em' : undefined,
    textShadow: over || white ? '0 1px 2px rgba(0,0,0,.55), 0 2px 14px rgba(0,0,0,.35)' : undefined,
    whiteSpace: cover ? 'pre' : 'pre-wrap', lineHeight: 1.12, overflowWrap: cover ? undefined : 'anywhere',
  }
}

/** Текст, который редактируется прямо на странице (contentEditable без «прыжков» курсора). */
export function EditableText({ value, editing, onChange, onActivate, style, className, placeholder, label = 'Текст на странице' }: {
  value: string; editing?: boolean; onChange?: (t: string) => void; onActivate?: () => void
  style?: React.CSSProperties; className?: string; placeholder?: string; label?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => { const el = ref.current; if (el && document.activeElement !== el && el.innerText !== value) el.innerText = value }, [value])
  useEffect(() => {
    const el = ref.current
    if (!editing || !el) return
    el.focus({ preventScroll: true })
    const r = document.createRange(); r.selectNodeContents(el); r.collapse(false)
    const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(r)
  }, [editing])
  return (
    <div ref={ref} className={'etext ' + (className || '') + (editing ? ' editing' : '') + (onActivate ? ' can' : '')} style={style} data-placeholder={placeholder}
      contentEditable={!!editing} suppressContentEditableWarning spellCheck={false} role={onActivate ? 'textbox' : undefined} aria-label={onActivate ? label : undefined}
      tabIndex={onActivate && !editing ? 0 : undefined}
      onInput={(e) => onChange?.(e.currentTarget.innerText.replace(/\n$/, ''))}
      onPointerDown={(e) => { if (onActivate) e.stopPropagation() }}
      onClick={(e) => { if (onActivate) { e.stopPropagation(); if (!editing) onActivate() } }}
      onKeyDown={(e) => { if (!editing && onActivate && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onActivate() } if (e.key === 'Escape') (e.currentTarget as HTMLElement).blur() }} />
  )
}

export function PageView({ page, photos, aspect, selected, onSlot, issues, design = FALLBACK_DESIGN, filters, textEditing, onText, onCaption }: {
  page: Page; photos: Record<string, Photo>; aspect: number; selected?: number | null; onSlot?: (i: number) => void
  issues?: Record<string, 'critical' | 'warning'>; design?: Design; filters?: Record<string, string>
  textEditing?: boolean; onText?: () => void; onCaption?: (t: string) => void
}) {
  const tpl = TEMPLATES[page.template] || TEMPLATES.full
  const ts = page.text
  const capArea = !!tpl.caption && tpl.slots.length > 0
  const over = tpl.slots.length > 0 && !tpl.caption // текст поверх фото
  const showText = !tpl.slots.length || capArea || !!page.caption || !!textEditing
  const just = ts?.pos === 'top' ? 'flex-start' : ts?.pos === 'middle' ? 'center' : 'flex-end'
  return (
    <div className="bookpage" style={{ aspectRatio: String(aspect), background: design.bg ? `${design.page} url(${design.bg}) center / cover` : design.page, containerType: 'inline-size' }}>
      <Decor kind={design.decor} color={design.accent} />
      {!tpl.slots.length ? (
        <div style={{ position: 'absolute', inset: '12%', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch', justifyContent: ts?.pos ? just : 'center' }}>
          <div style={{ width: 26, height: 2, background: design.accent, borderRadius: 2, alignSelf: ts?.align === 'left' ? 'flex-start' : ts?.align === 'right' ? 'flex-end' : 'center' }} />
          <EditableText value={page.caption || ''} editing={textEditing} onChange={onCaption} onActivate={onText} style={textCss(ts, design, 7.5)} placeholder={onText ? 'Нажмите, чтобы написать' : 'Ваш текст'} />
        </div>
      ) : page.slots.map((s, i) => (
        <SlotView key={i} slot={s} photo={s.photo_id ? photos[s.photo_id] : undefined} box={insetBox(tpl.slots[Math.min(i, tpl.slots.length - 1)], design.inset)} design={design}
          selected={selected === i} issue={issues?.[`${i}`] ?? null} onClick={onSlot ? () => onSlot(i) : undefined}
          filter={s.photo_id ? filters?.[s.photo_id] : undefined} />
      ))}
      {tpl.slots.length > 0 && showText && (
        <div className={`cap-box ${capArea ? 'area' : 'over'}`} style={capArea ? undefined : { justifyContent: just }}>
          <EditableText value={page.caption || ''} editing={textEditing} onChange={onCaption} onActivate={onText} style={textCss(ts, design, 5, over)}
            placeholder={onText ? (capArea ? 'Нажмите, чтобы добавить подпись' : 'Ваш текст') : ''} />
        </div>
      )}
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
  [/grad|player|archive|cinema/, 'girl'], [/kinder|magic/, 'boy'], [/travel/, 'city'], [/mom|wedding|meadow/, 'mom'],
  [/autumn|collage/, 'kids'], [/baby/, 'baby'], [/moments/, 'woman'], [/xmas|year|bauble|christmas|neon|stamp/, 'family'],
]
export const sampleFor = (d: Design) => `/samples/${SAMPLE.find(([r]) => r.test(d.id))?.[1] || 'girl'}.jpg`

export function DesignCard({ d, on, onClick, title }: { d: Design; on?: boolean; onClick?: () => void; title?: string }) {
  const [x, y, w, h] = d.frame === 'circle' || d.frame === 'neon' ? [0.22, 0.12, 0.56, 0.56] : [0.16, 0.12, 0.68, 0.6]
  return (
    <button type="button" className={`design-card ${on ? 'on' : ''}`} onClick={onClick} aria-pressed={on} aria-label={`Дизайн ${d.name}`}>
      <div className="dc-page" style={{ background: d.bg ? `${d.page} url(${d.bg}) center / cover` : d.page }}>
        <Decor kind={d.decor} color={d.accent} />
        <div className="dc-photo" style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%`, ...frameStyle(d.frame, d.accent) }}>
          <img src={sampleFor(d)} alt="" decoding="async" draggable={false} />
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


/** Обложка книги так, как её напечатают: дизайн, фото в рамке, название; лёгкий корешок и блик ламината. */
export function CoverView({ design, photo, title, aspect = 1, size = 220, titleStyle, titleEditing, onTitleClick, onTitle }: {
  design?: Design; photo?: string | null; title?: string; aspect?: number; size?: number
  titleStyle?: TextStyle; titleEditing?: boolean; onTitleClick?: () => void; onTitle?: (t: string) => void
}) {
  const d = design || FALLBACK_DESIGN
  const w = aspect >= 1 ? size : size * aspect
  const h = w / aspect
  const [x, y, bw, bh] = d.frame === 'circle' || d.frame === 'neon' ? [0.2, 0.12, 0.6, 0.6 * aspect] : [0.14, 0.1, 0.72, 0.62]
  return (
    <div className="cover-view" style={{ width: w, height: h, background: d.bg ? `${d.page} url(${d.bg}) center / cover` : d.page }}>
      {d.art ? (
        <>
          <Decor kind={d.decor} color={d.accent} />
          <div className="dc-photo" style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: `${bw * 100}%`, height: `${bh * 100}%`, ...frameStyle(d.frame, d.accent) }}>
            {photo && <img src={photo} alt="" draggable={false} />}
          </div>
          <div className="dc-title"><EditableText value={title || ''} editing={titleEditing} onChange={onTitle} onActivate={onTitleClick} label="Название на обложке" placeholder={onTitleClick ? 'Название' : ''} style={textCss(titleStyle, d, 9.5, false, true)} /></div>
        </>
      ) : (
        <>
          {photo && <img src={photo} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 55%, rgba(0,0,0,.5))' }} />
          <div className="dc-title"><EditableText value={title || ''} editing={titleEditing} onChange={onTitle} onActivate={onTitleClick} label="Название на обложке" placeholder={onTitleClick ? 'Название' : ''} style={textCss({ font: 'sans', color: '#FFFFFF', ...titleStyle }, d, 8, true, true)} /></div>
        </>
      )}
    </div>
  )
}
