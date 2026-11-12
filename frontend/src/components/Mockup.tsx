// Живые мокапы товаров с фото пользователя: кружка, книга, открытка, постер и т. д.
// Рисуются CSS/SVG — без картинок-заглушек, поэтому подстраиваются под любое фото и тему.
import type { CSSProperties } from 'react'

export type MockupKind = 'book' | 'prints' | 'mug' | 'poster' | 'canvas' | 'puzzle' | 'magnet' | 'pillow' | 'card' | 'envelope' | 'calendar' | 'tshirt'

// --mf: CSS-фильтр предпросмотра (фильтры редактора применяются мгновенно, до обработки на сервере)
const cover: CSSProperties = { width: '100%', height: '100%', objectFit: 'cover', display: 'block', filter: 'var(--mf, none)', transition: 'filter .3s' }

export function Mockup({ kind, src, size = 140, src2, title }: { kind: MockupKind | string; src: string; size?: number; src2?: string; title?: string }) {
  const s = size
  const shadow = '0 18px 30px -12px rgba(0,0,0,.45)'
  switch (kind) {
    case 'mug':
      return (
        <div style={{ width: s, height: s * 0.82, position: 'relative' }} aria-hidden>
          <div style={{ position: 'absolute', right: 0, top: s * 0.18, width: s * 0.32, height: s * 0.4, borderRadius: '50%', border: `${s * 0.065}px solid #ECECEF`, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.05)' }} />
          <div style={{ position: 'absolute', left: 0, top: s * 0.04, width: s * 0.78, height: s * 0.76, borderRadius: `${s * 0.05}px ${s * 0.05}px ${s * 0.16}px ${s * 0.16}px`, overflow: 'hidden', background: '#F5F5F7', boxShadow: shadow }}>
            <img src={src} alt="" style={{ ...cover, position: 'absolute', inset: `${s * 0.12}px ${s * 0.07}px ${s * 0.12}px` , width: `calc(100% - ${s * 0.14}px)`, height: `calc(100% - ${s * 0.24}px)`, borderRadius: s * 0.03 }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(0,0,0,.18), rgba(255,255,255,.35) 22%, transparent 45%, rgba(0,0,0,.12))' }} />
          </div>
          <div style={{ position: 'absolute', left: 0, top: 0, width: s * 0.78, height: s * 0.1, borderRadius: '50%', background: 'linear-gradient(#DADADF,#F7F7F9)' }} />
        </div>
      )
    case 'prints':
      return (
        <div style={{ width: s, height: s * 0.86, position: 'relative' }} aria-hidden>
          {[-11, 6, -2].map((r, i) => (
            <div key={i} style={{ position: 'absolute', left: s * (0.08 + i * 0.16), top: s * (0.08 + (i % 2) * 0.06), width: s * 0.6, padding: s * 0.03, paddingBottom: s * 0.1, background: '#fff', transform: `rotate(${r}deg)`, boxShadow: shadow, borderRadius: 3 }}>
              <img src={i === 2 ? src : src2 || src} alt="" style={{ ...cover, aspectRatio: '1', filter: i === 2 ? undefined : 'saturate(.9) brightness(.97)' }} />
            </div>
          ))}
        </div>
      )
    case 'magnet':
      return (
        <div style={{ width: s, height: s * 0.8, position: 'relative' }} aria-hidden>
          {[0, 1].map((i) => (
            <div key={i} style={{ position: 'absolute', left: s * (0.06 + i * 0.36), top: s * (0.1 + i * 0.12), width: s * 0.52, height: s * 0.4, borderRadius: s * 0.06, overflow: 'hidden', boxShadow: shadow, transform: `rotate(${i ? 5 : -6}deg)` }}>
              <img src={i ? src : src2 || src} alt="" style={cover} />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(255,255,255,.45), transparent 40%)' }} />
            </div>
          ))}
        </div>
      )
    case 'poster':
      return (
        <div style={{ width: s * 0.72, padding: s * 0.035, background: '#1d1d1f', boxShadow: shadow }} aria-hidden>
          <div style={{ padding: s * 0.05, background: '#fff' }}><img src={src} alt="" style={{ ...cover, aspectRatio: '0.72' }} /></div>
        </div>
      )
    case 'canvas':
      return (
        <div style={{ width: s, aspectRatio: '1.33', position: 'relative', boxShadow: `${shadow}, inset 0 0 0 1px rgba(0,0,0,.1)`, transform: 'perspective(500px) rotateY(-12deg)' }} aria-hidden>
          <img src={src} alt="" style={cover} />
          <div style={{ position: 'absolute', top: 0, bottom: 0, right: -s * 0.05, width: s * 0.05, background: 'linear-gradient(90deg, rgba(0,0,0,.35), rgba(0,0,0,.15))', transform: 'skewY(-30deg)', transformOrigin: 'left' }} />
        </div>
      )
    case 'puzzle':
      return (
        <div style={{ width: s, aspectRatio: '1.35', position: 'relative', borderRadius: 4, overflow: 'hidden', boxShadow: shadow, transform: 'rotate(-4deg)' }} aria-hidden>
          <img src={src} alt="" style={cover} />
          <svg viewBox="0 0 135 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
            <g fill="none" stroke="rgba(255,255,255,.55)" strokeWidth=".8">
              {[33, 67].map((y) => <path key={y} d={`M0 ${y} ${Array.from({ length: 5 }).map((_, i) => `h12 q2 -6 6 -6 q4 0 6 6 h3`).join(' ')}`} />)}
              {[34, 68, 101].map((x) => <path key={x} d={`M${x} 0 ${Array.from({ length: 3 }).map(() => `v12 q6 2 6 6 q0 4 -6 6 v9`).join(' ')}`} />)}
            </g>
          </svg>
        </div>
      )
    case 'pillow':
      return (
        <div style={{ width: s * 0.86, aspectRatio: '1', borderRadius: s * 0.16, overflow: 'hidden', position: 'relative', boxShadow: `${shadow}, inset 0 0 ${s * 0.12}px rgba(0,0,0,.35)`, transform: 'rotate(-5deg)' }} aria-hidden>
          <img src={src} alt="" style={cover} />
          <div style={{ position: 'absolute', inset: 0, borderRadius: s * 0.16, boxShadow: `inset 0 0 ${s * 0.1}px ${s * 0.02}px rgba(0,0,0,.3)`, background: 'radial-gradient(circle at 35% 30%, rgba(255,255,255,.3), transparent 55%)' }} />
        </div>
      )
    case 'card':
      return (
        <div style={{ width: s, height: s * 0.78, position: 'relative' }} aria-hidden>
          <div style={{ position: 'absolute', left: s * 0.2, top: s * 0.02, width: s * 0.7, height: s * 0.5, background: '#FBF8F2', transform: 'rotate(8deg)', boxShadow: shadow, borderRadius: 3, display: 'grid', placeItems: 'center', fontFamily: 'Caveat, cursive', color: '#6b5b4a', fontSize: s * 0.11 }}>{title || 'С любовью'}</div>
          <div style={{ position: 'absolute', left: s * 0.04, top: s * 0.2, width: s * 0.7, height: s * 0.5, padding: s * 0.025, background: '#fff', transform: 'rotate(-6deg)', boxShadow: shadow, borderRadius: 3 }}><img src={src} alt="" style={cover} /></div>
        </div>
      )
    case 'envelope':
      return (
        <div style={{ width: s, aspectRatio: '1.45', position: 'relative', boxShadow: shadow, borderRadius: 6, overflow: 'hidden', background: '#F6F1E8' }} aria-hidden>
          <img src={src} alt="" style={{ ...cover, position: 'absolute', inset: 0, opacity: .92 }} />
          <svg viewBox="0 0 145 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
            <path d="M0 0 L72.5 52 L145 0 Z" fill="#F6F1E8" opacity=".96" />
            <path d="M0 0 L72.5 52 L145 0" fill="none" stroke="rgba(0,0,0,.12)" />
          </svg>
        </div>
      )
    case 'calendar':
      return (
        <div style={{ width: s * 0.8, background: '#fff', borderRadius: 6, padding: s * 0.04, boxShadow: shadow, transform: 'rotate(3deg)', position: 'relative' }} aria-hidden>
          <div style={{ position: 'absolute', top: -s * 0.04, left: 0, right: 0, display: 'flex', justifyContent: 'space-evenly' }}>{Array.from({ length: 6 }).map((_, i) => <span key={i} style={{ width: 4, height: s * 0.09, background: '#555', borderRadius: 2 }} />)}</div>
          <img src={src} alt="" style={{ ...cover, aspectRatio: '1.35', borderRadius: 3 }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginTop: s * 0.04 }}>{Array.from({ length: 21 }).map((_, i) => <span key={i} style={{ height: s * 0.03, borderRadius: 1, background: i === 12 ? 'var(--primary)' : '#E6E6EA' }} />)}</div>
        </div>
      )
    case 'tshirt':
      return (
        <svg width={s} height={s * 0.9} viewBox="0 0 100 90" aria-hidden style={{ filter: 'drop-shadow(0 14px 18px rgba(0,0,0,.3))' }}>
          <defs><clipPath id={`tee-${s}`}><rect x="34" y="26" width="32" height="32" rx="2" /></clipPath></defs>
          <path d="M30 6 L40 2 Q50 9 60 2 L70 6 L92 18 L84 34 L74 29 L74 88 L26 88 L26 29 L16 34 L8 18 Z" fill="#F7F7F8" stroke="rgba(0,0,0,.08)" />
          <image href={src} x="34" y="26" width="32" height="32" preserveAspectRatio="xMidYMid slice" clipPath={`url(#tee-${s})`} style={{ filter: 'var(--mf, none)' }} />
        </svg>
      )
    default: // book
      return (
        <div style={{ width: s * 0.82, aspectRatio: '1', position: 'relative', borderRadius: '3px 8px 8px 3px', overflow: 'hidden', boxShadow: `${shadow}, inset 7px 0 0 rgba(0,0,0,.18)`, transform: 'perspective(600px) rotateY(-14deg) rotate(-2deg)' }} aria-hidden>
          <img src={src} alt="" style={cover} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(0,0,0,.28), rgba(255,255,255,.2) 5%, transparent 12%, transparent 80%, rgba(255,255,255,.1))' }} />
          {title && <div style={{ position: 'absolute', left: 0, right: 0, bottom: '9%', textAlign: 'center', color: '#fff', fontWeight: 800, letterSpacing: '-.02em', fontSize: s * 0.085, textShadow: '0 2px 10px rgba(0,0,0,.5)', padding: '0 8%' }}>{title}</div>}
        </div>
      )
  }
}

export const SHOT: Record<string, string> = {
  'prints-classic': 'garden_03.jpg', 'prints-mini': 'sea_06.jpg', 'book-lite': 'lake_01.jpg', 'book-classic': 'sea_00.jpg',
  'book-premium': 'sea_09.jpg', 'grad-kindergarten': 'grad_02.jpg', 'grad-school-4': 'grad_04.jpg', 'grad-school-11': 'grad_06.jpg',
  postcard: 'garden_00.jpg', invitation: 'garden_05.jpg', envelope: 'sea_02.jpg', 'calendar-wall': 'lake_06.jpg', 'calendar-desk': 'city_01.jpg',
  mug: 'sea_04.jpg', magnets: 'garden_02.jpg', puzzle: 'lake_03.jpg', pillow: 'sea_07.jpg', tshirt: 'grad_01.jpg', poster: 'city_03.jpg', canvas: 'lake_05.jpg',
}
export const shotFor = (id: string) => `/api/gallery/file/${SHOT[id] || 'sea_00.jpg'}`

// Настоящие фото изделий с picpac.by (для товаров, которые есть на сайте)
export const PHOTO: Record<string, string> = {
  'book-premium': '/products/premiumb.webp', 'book-classic': '/products/classicb.webp', 'book-lite': '/products/liteb.webp',
  'prints-classic': '/products/phpotob.webp', 'prints-mini': '/products/digitalb.webp',
  'grad-kindergarten': '/products/classica.webp', 'grad-school-4': '/products/litea.webp', 'grad-school-11': '/products/premiuma.webp',
}
