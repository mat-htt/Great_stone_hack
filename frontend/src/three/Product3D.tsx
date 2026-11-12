import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { ChevronLeft, ChevronRight, Coffee, Hand, Mail, Rotate3d } from 'lucide-react'
import * as THREE from 'three'
import type { Layout, Page, Photo, Product } from '../api'
import { aspectOf, FALLBACK_DESIGN, type Design } from '../components/ui'
import Book3D, { type BookSource } from './Book3D'
import Calendar3D, { type CalendarSource } from './Calendar3D'
import { Card, CanvasArt, Envelope, Magnets, Mug, Pillow, Poster, Prints, Puzzle, Tshirt } from './Models'
import { fontsReady, paintCover, paintMonth, paintPage, texUrl } from './paint'
import Stage from './Stage'
import { finishOf } from './tex'

export interface Product3DProps {
  product: Product
  options: Record<string, string>
  images: string[]
  filter?: string
  title?: string
  design?: Design
  layout?: Layout
  photos?: Record<string, Photo>
  filters?: Record<string, string>
  height?: number | string
  controls?: boolean
  onShot?: (b: Blob) => void   // режим «фото для каталога»
}

// настоящие фото (кадры из открытых превью шаблонов picPac)
const SAMPLES = ['family', 'kids', 'girl', 'mom', 'woman', 'city', 'boy', 'baby'].map((n) => `/samples/${n}.jpg`)
const SAMPLE_TPL = ['frame', 'full', 'duo', 'text', 'trio', 'story', 'quad', 'frame', 'duo_h', 'full']
const CAPTIONS = ['Здесь начиналось лето', 'Самые тёплые дни', 'Помним этот момент']

/** Пример книги для витрины, когда у клиента ещё нет своих фото. */
function sampleBook(images: string[]): { pages: Page[]; photos: Record<string, Photo> } {
  const imgs = images.length ? images : SAMPLES
  const photos: Record<string, Photo> = {}
  imgs.forEach((u, i) => { photos[`s${i}`] = { id: `s${i}`, url: u, thumb: u } as Photo })
  let k = 0
  const pages: Page[] = SAMPLE_TPL.map((t, i) => {
    const n = t === 'duo' || t === 'duo_h' ? 2 : t === 'trio' ? 3 : t === 'quad' ? 4 : t === 'text' ? 0 : 1
    return { id: `sp${i}`, template: t, caption: t === 'text' || t === 'story' ? CAPTIONS[i % CAPTIONS.length] : undefined,
      slots: Array.from({ length: n }, () => ({ photo_id: `s${k++ % imgs.length}`, crop: { x: .5, y: .45, zoom: 1 } })) }
  })
  return { pages, photos }
}

/** Мягкое покачивание для настенных изделий (вместо полного оборота). */
function Sway({ children, amp = 0.4, on = true, rest = 0 }: { children: ReactNode; amp?: number; on?: boolean; rest?: number }) {
  const g = useRef<THREE.Group>(null)
  useFrame(({ clock }) => { if (g.current) g.current.rotation.y = on ? Math.sin(clock.elapsedTime * 0.55) * amp : rest })
  return <group ref={g}>{children}</group>
}

const NO_PHOTOS: Record<string, Photo> = {}
const NO_FILTERS: Record<string, string> = {}
const urlOf = (p?: Photo) => (p ? texUrl(p) : '')

export default function Product3D({ product, options, images, filter, title, design, layout, photos = NO_PHOTOS, filters = NO_FILTERS, height = 340, controls = true, onShot }: Product3DProps) {
  const kind = product.mockup
  const specs = product.specs
  const color = specs.colors?.find((c) => c.id === options.color)?.hex
  const fin = finishOf(options.paper)
  const aspect = aspectOf(product, options.size)
  const d = design || FALLBACK_DESIGN
  const img0 = images[0] || SAMPLES[(product.id.length * 7) % SAMPLES.length]
  const [hot, setHot] = useState(true)
  const [open, setOpen] = useState(false)
  const [spread, setSpread] = useState(0)
  const [month, setMonth] = useState(0)
  const [orbit, setOrbit] = useState(false)
  const [hint, setHint] = useState(true)
  useEffect(() => { const t = setTimeout(() => setHint(false), 3500); return () => clearTimeout(t) }, [])

  // ---- книги ----
  const book = useMemo<BookSource | null>(() => {
    if (kind !== 'book') return null
    const own = layout && layout.pages.length ? { pages: layout.pages, photos } : sampleBook(images)
    const coverId = layout?.cover?.photo_id
    const coverUrl = coverId ? texUrl(photos[coverId], coverId) : own.pages.flatMap((p) => p.slots).map((s) => urlOf(own.photos[s.photo_id || '']))[0] || img0
    return {
      aspect, pageCount: own.pages.length, cover: options.cover, color, paper: options.paper,
      paintPage: async (i) => { await fontsReady(); return paintPage(own.pages[i], own.photos, d, aspect, 1024, filters) },
      paintCover: async () => { await fontsReady(); return paintCover({ photoUrl: coverUrl, crop: layout?.cover?.crop, title: title || product.title, d, aspect, cover: options.cover, color, filter: coverId ? filters[coverId] : undefined }) },
    }
  }, [kind, layout, photos, images, aspect, options.cover, options.paper, color, d, title, filters]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- календари ----
  const cal = useMemo<CalendarSource | null>(() => {
    if (kind !== 'calendar') return null
    const urls = layout ? layout.pages.map((p) => { const id = p.slots.find((s) => s.photo_id)?.photo_id; return id ? texUrl(photos[id], id) : '' }) : []
    const list = Array.from({ length: 12 }, (_, i) => urls[i] || images[i % Math.max(1, images.length)] || SAMPLES[i % SAMPLES.length])
    const desk = product.id === 'calendar-desk'
    return {
      aspect: desk ? 1.5 : 0.72, months: 12, desk, spiral: color, paper: options.paper,
      paintMonth: async (i) => { await fontsReady(); return paintMonth(i, 2027, list[i], d, desk ? 1.5 : 0.72) },
    }
  }, [kind, layout, photos, images, color, options.paper, d, product.id])

  const cardFront = useMemo(() => async () => { await fontsReady(); return paintCover({ photoUrl: img0, title: title && title !== product.title ? title : product.id === 'invitation' ? 'Приглашаем!' : 'С праздником!', d, aspect, filter }) }, [img0, title, d, aspect, filter, product])

  let model: ReactNode = null
  let stage: Partial<React.ComponentProps<typeof Stage>> = {}
  switch (kind) {
    case 'mug':
      model = <Mug url={img0} filter={filter} inner={color} chameleon={options.cover === 'chameleon'} hot={hot} />
      stage = { camera: [0, 0.32, 3.1], floor: -0.58 }
      break
    case 'book':
      model = book && <Book3D src={book} spread={spread} />
      stage = { camera: [0, 2.75, 1.95], target: [0, -0.5, 0.12], wide: spread > 0 && spread < 1 + Math.ceil((book?.pageCount || 0) / 2) ? 1.5 : 1, floor: -0.52, autoRotate: false, rotate: orbit, minPolar: 0.15, maxPolar: 1.25, minDistance: 1.4, maxDistance: 4 }
      break
    case 'calendar':
      model = cal && (cal.desk ? <Calendar3D src={cal} month={month} /> : <Sway on={!orbit && !onShot} rest={onShot ? -0.42 : 0} amp={0.3}><Calendar3D src={cal} month={month} /></Sway>)
      stage = cal?.desk ? { camera: [0, 0.4, 2.7], floor: -0.55, autoRotate: false } : { camera: [0, 0.12, 2.6], target: [0, 0.1, 0], floor: -0.52, autoRotate: false }
      break
    case 'prints':
      model = <Prints urls={images.length ? images : [img0, SAMPLES[3], SAMPLES[5]]} filter={filter} finish={fin} polaroid={product.id === 'prints-mini'} aspect={Math.max(aspect, 1 / aspect)} />
      stage = { camera: [0, 1.9, 1.85], target: [0, -0.55, 0], floor: -0.556, minPolar: 0.1, maxPolar: 1.2 }
      break
    case 'magnet':
      model = <Sway on={!onShot} rest={onShot ? -0.42 : 0} amp={0.35}><Magnets urls={images.length ? images : [img0, SAMPLES[2], SAMPLES[6], SAMPLES[8]]} filter={filter} finish={fin} /></Sway>
      stage = { camera: [0, 0.05, 2.9], floor: -0.75, autoRotate: false }
      break
    case 'poster':
      model = <Sway on={!onShot} rest={onShot ? -0.42 : 0} amp={0.38}><Poster url={img0} filter={filter} finish={fin} aspect={aspect} /></Sway>
      stage = { camera: [0, 0.05, 3.7], floor: -0.85, autoRotate: false }
      break
    case 'canvas':
      model = <Sway on={!onShot} rest={onShot ? -0.42 : 0} amp={0.45}><CanvasArt url={img0} filter={filter} aspect={aspect} depth={options.cover === 'd4' ? 0.07 : 0.04} /></Sway>
      stage = { camera: [0, 0.15, 3.3], floor: -0.65, autoRotate: false }
      break
    case 'puzzle':
      model = <Puzzle url={img0} filter={filter} aspect={Math.max(aspect, 1 / aspect)} />
      stage = { camera: [0, 1.8, 1.9], target: [0, -0.5, 0], floor: -0.55, minPolar: 0.1, maxPolar: 1.2 }
      break
    case 'pillow':
      model = <Pillow url={img0} filter={filter} satin={options.cover !== 'gabardine'} />
      stage = { camera: [0, 0.2, 3.2], floor: -0.68 }
      break
    case 'tshirt':
      model = <Tshirt url={img0} filter={filter} color={color} />
      stage = { camera: [0, 0.1, 3.3], floor: -0.68 }
      break
    case 'card':
      model = <Card front={cardFront} finish={fin} aspect={aspect} />
      stage = { camera: [0, 0.35, 2.7], floor: -0.55 }
      break
    case 'envelope':
      model = <Envelope url={img0} filter={filter} open={open} />
      stage = { camera: [0, 0.2, 2.9], floor: -0.5 }
      break
    default:
      model = <Mug url={img0} filter={filter} />
  }

  const pageCount = book?.pageCount || 0
  const leaves = 1 + Math.ceil(pageCount / 2)
  const flipBy = (n: number) => kind === 'book' ? setSpread((s) => Math.max(0, Math.min(leaves, s + n))) : setMonth((m) => Math.max(0, Math.min(11, m + n)))
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const flippable = kind === 'book' || kind === 'calendar'
  useEffect(() => {
    if (!flippable || !controls) return
    const k = (e: KeyboardEvent) => { if ((e.target as HTMLElement)?.closest('input,textarea')) return; if (e.key === 'ArrowRight') flipBy(1); if (e.key === 'ArrowLeft') flipBy(-1) }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  })
  const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
  const label = kind === 'book' ? (spread === 0 ? 'Обложка' : spread >= leaves ? 'Конец' : `Разворот ${spread} из ${leaves - 1}`) : MONTHS[month]

  return (
    <div className="p3d" style={{ height }}>
      <Stage {...stage} rotate={stage.rotate ?? true} onShot={onShot} autoRotate={onShot ? false : stage.autoRotate}
        onPointerDown={(e) => { if (flippable && !orbit) swipe.current = { x: e.clientX, y: e.clientY } }}
        onPointerUp={(e) => {
          const s = swipe.current; swipe.current = null
          if (!s || !flippable || orbit) return
          const dx = e.clientX - s.x
          if (Math.abs(dx) > 40) flipBy(dx < 0 ? 1 : -1)
          else if (Math.abs(dx) < 8 && kind === 'book') { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); flipBy(e.clientX > r.left + r.width / 2 ? 1 : -1) }
        }}>
        {model}
      </Stage>
      {controls && !onShot && (
        <div className="p3d-ui">
          {flippable && (
            <div className="p3d-pager glass">
              <button className="icon-btn plain" onClick={() => flipBy(-1)} aria-label="Назад"><ChevronLeft size={18} /></button>
              <span>{label}</span>
              <button className="icon-btn plain" onClick={() => flipBy(1)} aria-label="Вперёд"><ChevronRight size={18} /></button>
              <button className={`icon-btn plain ${orbit ? 'on' : ''}`} onClick={() => setOrbit(!orbit)} aria-label="Вращать модель" title="Вращать"><Rotate3d size={18} /></button>
            </div>
          )}
          {kind === 'mug' && options.cover === 'chameleon' && (
            <button className="chip glass p3d-act" onClick={() => setHot(!hot)}><Coffee size={15} /> {hot ? 'Остудить' : 'Налить кипяток'}</button>
          )}
          {kind === 'envelope' && <button className="chip glass p3d-act" onClick={() => setOpen(!open)}><Mail size={15} /> {open ? 'Закрыть клапан' : 'Открыть клапан'}</button>}
          {hint && <div className="p3d-hint"><Hand size={14} /> {flippable && !orbit ? 'Листайте свайпом' : 'Покрутите пальцем'}</div>}
        </div>
      )}
    </div>
  )
}
