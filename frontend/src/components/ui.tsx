import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, BookHeart, Check, House, Package, Plus, UserRound } from 'lucide-react'
import { media, type Layout, type Page, type Photo, type Slot } from '../api'
import { useApp } from '../store'

export function Img({ src, alt = '', className = '', style, fit = 'cover', onLoad }: {
  src: string; alt?: string; className?: string; style?: React.CSSProperties; fit?: 'cover' | 'contain'; onLoad?: () => void
}) {
  const [loaded, setLoaded] = useState(false)
  const full = src.startsWith('/api/media') ? media(src) : src
  return (
    <div className={`ph ${loaded ? '' : 'loading'} ${className}`} style={style}>
      <img src={full} alt={alt} loading="lazy" decoding="async" style={{ objectFit: fit }} onLoad={() => { setLoaded(true); onLoad?.() }} />
    </div>
  )
}

export function TopBar({ title, back, right, left = false, onBack }: { title?: ReactNode; back?: boolean | string; right?: ReactNode; left?: boolean; onBack?: () => void }) {
  const nav = useNavigate()
  return (
    <header className={`topbar ${left ? 'left' : ''}`}>
      {back ? (
        <button className="icon-btn" aria-label="Назад" onClick={() => onBack ? onBack() : typeof back === 'string' ? nav(back) : nav(-1)}>
          <ArrowLeft size={20} />
        </button>
      ) : null}
      <div className="title">{title}</div>
      {right ?? (back ? <div style={{ width: 42 }} /> : null)}
    </header>
  )
}

export function TabBar() {
  const loc = useLocation()
  const { unread } = useApp()
  const is = (p: string) => (p === '/' ? loc.pathname === '/' : loc.pathname.startsWith(p))
  return (
    <nav className="tabbar" aria-label="Основная навигация">
      <Link to="/" className={`tab ${is('/') ? 'active' : ''}`}><House size={22} />Главная</Link>
      <Link to="/catalog" className={`tab ${is('/catalog') ? 'active' : ''}`}><BookHeart size={22} />Каталог</Link>
      <Link to="/create" className="tab" aria-label="Создать"><span className="tab-fab"><Plus size={28} strokeWidth={2.6} /></span></Link>
      <Link to="/orders" className={`tab ${is('/orders') ? 'active' : ''}`}><Package size={22} />Заказы</Link>
      <Link to="/profile" className={`tab ${is('/profile') ? 'active' : ''}`}><UserRound size={22} />{unread > 0 && <span className="badge">{unread > 9 ? '9+' : unread}</span>}Профиль</Link>
    </nav>
  )
}

export function Sheet({ open, onClose, children, dark = false, label }: { open: boolean; onClose: () => void; children: ReactNode; dark?: boolean; label?: string }) {
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
          <motion.div role="dialog" aria-modal="true" aria-label={label} className={`sheet ${dark ? 'dark' : ''}`}
            style={{ x: '-50%' }} initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }} drag="y" dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }} onDragEnd={(_, i) => { if (i.offset.y > 120) onClose() }}>
            <div className="sheet-grip" />
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// ---------- Рендер страниц книги ----------
export const TEMPLATES: Record<string, { title: string; slots: [number, number, number, number][]; caption?: boolean }> = {
  full: { title: 'Во всю страницу', slots: [[0, 0, 1, 1]] },
  frame: { title: 'С полями', slots: [[0.09, 0.09, 0.82, 0.82]] },
  duo: { title: 'Два вертикальных', slots: [[0.05, 0.05, 0.43, 0.9], [0.52, 0.05, 0.43, 0.9]] },
  duo_h: { title: 'Два горизонтальных', slots: [[0.05, 0.05, 0.9, 0.43], [0.05, 0.52, 0.9, 0.43]] },
  trio: { title: 'Один большой + два', slots: [[0.05, 0.05, 0.56, 0.9], [0.65, 0.05, 0.3, 0.43], [0.65, 0.52, 0.3, 0.43]] },
  quad: { title: 'Сетка 2×2', slots: [[0.05, 0.05, 0.43, 0.43], [0.52, 0.05, 0.43, 0.43], [0.05, 0.52, 0.43, 0.43], [0.52, 0.52, 0.43, 0.43]] },
  story: { title: 'Фото + подпись', slots: [[0, 0, 1, 0.74]], caption: true },
  text: { title: 'Страница-цитата', slots: [], caption: true },
}

export function SlotView({ slot, photo, box, selected, issue, onClick, thumb = true }: {
  slot: Slot; photo?: Photo; box: [number, number, number, number]; selected?: boolean; issue?: 'critical' | 'warning' | null
  onClick?: () => void; thumb?: boolean
}) {
  const [x, y, w, h] = box
  const style: React.CSSProperties = { left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%` }
  if (!slot.photo_id || !photo) {
    return <button type="button" className={`slot empty ${selected ? 'selected' : ''}`} style={{ ...style, border: 0, cursor: onClick ? 'pointer' : 'default' }}
      onClick={onClick} aria-label="Пустое место — добавить фото"><Plus size={18} /></button>
  }
  const pos = `${(slot.crop?.x ?? 0.5) * 100}% ${(slot.crop?.y ?? 0.5) * 100}%`
  return (
    <div className={`slot ${selected ? 'selected' : ''} ${issue ? `issue ${issue}` : ''}`} style={{ ...style, cursor: onClick ? 'pointer' : 'default' }}
      onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => { if (onClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick() } }}>
      <img src={media(thumb ? photo.thumb : photo.url)} alt="" loading="lazy" draggable={false}
        style={{ objectPosition: pos, transform: `scale(${slot.crop?.zoom ?? 1})`, transformOrigin: pos }} />
    </div>
  )
}

export function PageView({ page, photos, aspect, selected, onSlot, issues, thumb = true }: {
  page: Page; photos: Record<string, Photo>; aspect: number; selected?: number | null; onSlot?: (i: number) => void
  issues?: Record<string, 'critical' | 'warning'>; thumb?: boolean
}) {
  const tpl = TEMPLATES[page.template] || TEMPLATES.full
  if (!tpl.slots.length) {
    return (
      <div className="bookpage center" style={{ aspectRatio: String(aspect), background: '#fbf7f1', flexDirection: 'column', gap: 6, padding: '10%' }}>
        <svg width="18%" viewBox="0 0 24 24" aria-hidden><path d="M12 21s-7.5-4.6-9.6-9.4C.9 8.2 3 4.5 6.6 4.5c2.1 0 3.6 1.1 4.4 2.6.8-1.5 2.3-2.6 4.4-2.6 3.6 0 5.7 3.7 4.2 7.1C19.5 16.4 12 21 12 21z" fill="#DD5757" opacity=".85" /></svg>
        <div style={{ fontFamily: 'var(--hand)', color: 'var(--green)', fontSize: 'clamp(12px, 3.6vw, 22px)', textAlign: 'center', lineHeight: 1.05 }}>{page.caption || 'Ваш текст'}</div>
      </div>
    )
  }
  return (
    <div className="bookpage" style={{ aspectRatio: String(aspect) }}>
      {page.slots.map((s, i) => (
        <SlotView key={i} slot={s} photo={s.photo_id ? photos[s.photo_id] : undefined} box={tpl.slots[Math.min(i, tpl.slots.length - 1)]}
          selected={selected === i} issue={issues?.[`${i}`] ?? null} onClick={onSlot ? () => onSlot(i) : undefined} thumb={thumb} />
      ))}
      {tpl.caption && <div className="page-caption">{page.caption || ''}</div>}
    </div>
  )
}

/** 3D-обложка книги — «живое» превью продукта. */
export function Book3D({ coverUrl, title, width = 180, color = '#364C49', spin = false }: { coverUrl?: string; title?: string; width?: number; color?: string; spin?: boolean }) {
  const h = width
  const depth = Math.max(10, width * 0.09)
  return (
    <div style={{ perspective: 1000, width, height: h }}>
      <motion.div style={{ width, height: h, position: 'relative', transformStyle: 'preserve-3d' }}
        initial={{ rotateY: -28, rotateX: 8 }} animate={spin ? { rotateY: [-28, -8, -28] } : { rotateY: -24, rotateX: 6 }}
        transition={spin ? { duration: 6, repeat: Infinity, ease: 'easeInOut' } : { type: 'spring', stiffness: 60 }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: '3px 8px 8px 3px', overflow: 'hidden', background: color, transform: `translateZ(${depth / 2}px)`,
          boxShadow: '0 30px 40px -18px rgba(0,0,0,.45)' }}>
          {coverUrl && <img src={coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(0,0,0,.28) 0, rgba(255,255,255,.18) 4%, transparent 9%, transparent 80%, rgba(255,255,255,.12))' }} />
          {title && <div style={{ position: 'absolute', left: 0, right: 0, bottom: 10, textAlign: 'center', fontFamily: 'var(--hand)', color: '#fff', fontSize: width / 9, textShadow: '0 2px 8px rgba(0,0,0,.45)', padding: '0 10px' }}>{title}</div>}
        </div>
        <div style={{ position: 'absolute', top: 2, bottom: 2, left: (width - depth) / 2, width: depth, background: 'repeating-linear-gradient(0deg,#f4efe6,#f4efe6 2px,#e3dbcf 3px)',
          transform: `rotateY(90deg) translateZ(${width / 2 - 2}px)` }} />
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: (width - depth) / 2, width: depth, background: color, filter: 'brightness(.7)',
          transform: `rotateY(-90deg) translateZ(${width / 2}px)` }} />
      </motion.div>
    </div>
  )
}

export function BeforeAfter({ before, after, height }: { before: string; after: string; height?: number }) {
  const [pos, setPos] = useState(50)
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const ro = new ResizeObserver(() => setW(ref.current?.clientWidth || 0))
    if (ref.current) ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  const move = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect()
    setPos(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)))
  }
  return (
    <div className="ba" ref={ref} style={{ height }} onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); move(e.clientX) }}
      onPointerMove={(e) => e.buttons && move(e.clientX)} role="slider" aria-label="Сравнение до и после" aria-valuenow={Math.round(pos)}
      aria-valuemin={0} aria-valuemax={100} tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'ArrowLeft') setPos((p) => Math.max(0, p - 5)); if (e.key === 'ArrowRight') setPos((p) => Math.min(100, p + 5)) }}>
      <img src={before} alt="До обработки" draggable={false} style={{ height: height || 'auto', objectFit: 'cover', width: '100%' }} />
      <div className="after" style={{ width: `${pos}%` }}>
        <img src={after} alt="После обработки" draggable={false} style={{ width: w || '100%', height: '100%', objectFit: 'cover' }} />
      </div>
      <div className="handle" style={{ left: `calc(${pos}% - 1px)` }} />
      <span className="lbl" style={{ left: 10 }}>после</span>
      <span className="lbl" style={{ right: 10 }}>до</span>
    </div>
  )
}

export const ORDER_FLOW: { key: string; label: string; sub?: string }[] = [
  { key: 'accepted', label: 'Принят' },
  { key: 'moderation', label: 'Модерация' },
  { key: 'print', label: 'Печать', sub: 'production' },
  { key: 'lamination', label: 'Ламинация', sub: 'production' },
  { key: 'binding', label: 'Переплёт', sub: 'production' },
  { key: 'qc', label: 'ОТК', sub: 'production' },
  { key: 'shipped', label: 'Передан в доставку' },
  { key: 'completed', label: 'Завершён' },
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
      {ORDER_FLOW.map((s, i) => (
        <div key={s.key} style={{ flex: 1, height: 5, borderRadius: 3, background: i <= idx ? 'var(--coral)' : 'rgba(54,76,73,.12)' }} />
      ))}
    </div>
  )
}

export function Checkmark() { return <Check size={15} strokeWidth={3} /> }

export function useDebounced<T>(value: T, ms = 600) {
  const [v, setV] = useState(value)
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t) }, [value, ms])
  return v
}

export function aspectOf(layoutOrProduct: { specs?: any } | undefined, sizeId?: string) {
  const sizes = layoutOrProduct?.specs?.sizes || []
  const s = sizes.find((x: any) => x.id === sizeId) || sizes[0]
  return s ? s.w_cm / s.h_cm : 1
}

export type { Layout }
