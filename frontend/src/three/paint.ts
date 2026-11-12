// Рисование текстур для 3D: фото с кадрированием и фильтром, страницы книги по макету и дизайну,
// обложки, листы календаря. Всё на <canvas>, поэтому 3D-модель показывает ровно то, что уйдёт в печать.
import { media, type Page, type Photo } from '../api'
import { FONT, FALLBACK_DESIGN, insetBox, TEMPLATES, type Design } from '../components/ui'

const cache = new Map<string, Promise<HTMLImageElement | null>>()
export function loadImage(url: string): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null)
  const src = url.startsWith('/api/') ? media(url) : url
  if (!cache.has(src)) {
    cache.set(src, new Promise((res) => {
      const im = new Image()
      im.crossOrigin = 'anonymous'
      im.decoding = 'async'
      im.onload = () => res(im)
      im.onerror = () => res(null)
      im.src = src
    }))
  }
  return cache.get(src)!
}

/** URL фото для текстур: превью 1400 px вместо оригинала (быстро и достаточно чётко для 3D). */
export const texUrl = (p?: { url?: string; thumb?: string } | null, id?: string | null) => {
  const u = p?.url || (id ? `/api/media/${id}` : '')
  return u.startsWith('/api/media/') && !u.includes('?') ? `${u}?size=preview` : u || p?.thumb || ''
}

export function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = Math.round(w); c.height = Math.round(h)
  return c
}

type Crop = { x: number; y: number; zoom: number }
/** object-fit: cover с точкой фокуса и зумом — как в редакторе. */
export function drawCover(ctx: CanvasRenderingContext2D, im: CanvasImageSource & { width: number; height: number }, x: number, y: number, w: number, h: number, crop: Partial<Crop> = {}, filter = 'none') {
  const z = crop.zoom ?? 1
  const s = Math.max(w / im.width, h / im.height) * z
  const sw = w / s, sh = h / s
  const fx = crop.x ?? 0.5, fy = crop.y ?? 0.5
  const sx = Math.max(0, Math.min(im.width - sw, im.width * fx - sw / 2))
  const sy = Math.max(0, Math.min(im.height - sh, im.height * fy - sh / 2))
  ctx.save()
  ctx.filter = filter || 'none'
  ctx.drawImage(im, sx, sy, sw, sh, x, y, w, h)
  ctx.restore()
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number | number[]) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r as any)
}

/** Рамка дизайна вокруг фото (белая, полароид, круг, арка, неон…), затем само фото внутри формы. */
function framedPhoto(ctx: CanvasRenderingContext2D, im: HTMLImageElement | null, x: number, y: number, w: number, h: number, d: Design, crop?: Partial<Crop>, filter?: string) {
  const u = Math.min(w, h)
  ctx.save()
  const shape = () => {
    if (d.frame === 'circle' || d.frame === 'neon') { ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2) }
    else if (d.frame === 'arch') roundRect(ctx, x, y, w, h, [w / 2, w / 2, u * .03, u * .03])
    else if (d.frame === 'round') roundRect(ctx, x, y, w, h, u * .06)
    else { ctx.beginPath(); ctx.rect(x, y, w, h) }
  }
  if (['white', 'polaroid', 'circle', 'arch'].includes(d.frame)) {
    const b = u * (d.frame === 'polaroid' ? .035 : .025)
    ctx.shadowColor = 'rgba(0,0,0,.22)'; ctx.shadowBlur = u * .05; ctx.shadowOffsetY = u * .015
    ctx.fillStyle = '#fff'
    if (d.frame === 'circle') { ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2 + b, h / 2 + b, 0, 0, Math.PI * 2); ctx.fill() }
    else if (d.frame === 'arch') { roundRect(ctx, x - b, y - b, w + 2 * b, h + 2 * b, [w / 2 + b, w / 2 + b, u * .04, u * .04]); ctx.fill() }
    else { ctx.fillRect(x - b, y - b, w + 2 * b, h + 2 * b + (d.frame === 'polaroid' ? u * .1 : 0)) }
    ctx.shadowColor = 'transparent'
  }
  if (d.frame === 'neon') {
    ctx.strokeStyle = d.accent; ctx.lineWidth = u * .012; ctx.shadowColor = d.accent; ctx.shadowBlur = u * .08
    ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2 + u * .01, h / 2 + u * .01, 0, 0, Math.PI * 2); ctx.stroke(); ctx.stroke()
    ctx.shadowColor = 'transparent'
  }
  shape(); ctx.clip()
  if (im) drawCover(ctx, im, x, y, w, h, crop, filter)
  else { ctx.fillStyle = 'rgba(0,0,0,.06)'; ctx.fillRect(x, y, w, h) }
  ctx.restore()
  if (d.frame === 'thin') { ctx.strokeStyle = d.accent + '88'; ctx.lineWidth = u * .006; ctx.strokeRect(x, y, w, h) }
}

async function background(ctx: CanvasRenderingContext2D, d: Design, W: number, H: number) {
  ctx.fillStyle = d.page; ctx.fillRect(0, 0, W, H)
  if (d.bg) {
    const bg = await loadImage(d.bg)
    if (bg) { // SVG рисуется векторно в нужном размере: cover по большей стороне
      const s = Math.max(W, H)
      ctx.drawImage(bg, (W - s) / 2, (H - s) / 2, s, s)
    }
  }
}

function text(ctx: CanvasRenderingContext2D, d: Design, str: string, x: number, y: number, maxW: number, size: number, align: CanvasTextAlign = 'center', color = d.ink) {
  const weight = d.font === 'sans' ? 750 : d.font === 'display' ? 700 : 400
  let fs = size
  ctx.font = `${weight} ${fs}px ${FONT[d.font] || FONT.sans}`
  while (ctx.measureText(str).width > maxW && fs > 10) { fs *= .92; ctx.font = `${weight} ${fs}px ${FONT[d.font] || FONT.sans}` }
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle'
  ctx.fillText(str, x, y)
}

export async function fontsReady() { try { await (document as any).fonts?.ready } catch { /* noop */ } }

/** Страница книги/календаря по макету: фон дизайна, рамки, фото, подписи. */
export async function paintPage(page: Page | undefined, photos: Record<string, Photo>, d: Design = FALLBACK_DESIGN, aspect = 1, px = 1024, filters: Record<string, string> = {}): Promise<HTMLCanvasElement> {
  const W = aspect >= 1 ? px : px * aspect, H = aspect >= 1 ? px / aspect : px
  const c = canvas(W, H); const ctx = c.getContext('2d')!
  await background(ctx, d, W, H)
  if (!page) return c
  const tpl = TEMPLATES[page.template] || TEMPLATES.full
  if (!tpl.slots.length) {
    ctx.fillStyle = d.accent; ctx.fillRect(W / 2 - W * .03, H * .42, W * .06, H * .006)
    text(ctx, d, page.caption || '', W / 2, H * .52, W * .7, W * (d.font === 'script' || d.font === 'hand' ? .1 : .075))
    return c
  }
  for (let i = 0; i < page.slots.length; i++) {
    const s = page.slots[i]
    const [bx, by, bw, bh] = insetBox(tpl.slots[Math.min(i, tpl.slots.length - 1)], d.inset)
    const pad = d.frame === 'none' || !d.frame ? 0 : 0.012
    const ph = s.photo_id ? photos[s.photo_id] : undefined
    const im = s.photo_id ? await loadImage(texUrl(ph, s.photo_id)) : null
    framedPhoto(ctx, im, (bx + pad) * W, (by + pad) * H, (bw - 2 * pad) * W, (bh - 2 * pad) * H, d, s.crop, s.photo_id ? filters[s.photo_id] : undefined)
  }
  if (tpl.caption && page.caption) text(ctx, d, page.caption, W / 2, H * .9, W * .84, W * .055)
  return c
}

/** Фотообложка: дизайн + фото + название. Для ткани/экокожи — фактура и тиснение. */
export async function paintCover(opts: { photoUrl?: string; crop?: Partial<Crop>; title: string; d: Design; aspect: number; cover?: string; color?: string; filter?: string }, px = 1024) {
  const { d, aspect } = opts
  const W = aspect >= 1 ? px : px * aspect, H = aspect >= 1 ? px / aspect : px
  const c = canvas(W, H); const ctx = c.getContext('2d')!
  const im = opts.photoUrl ? await loadImage(opts.photoUrl) : null
  if (opts.cover === 'fabric' || opts.cover === 'leather') {
    ctx.fillStyle = opts.color || (opts.cover === 'leather' ? '#8B5A2B' : '#3A3F47'); ctx.fillRect(0, 0, W, H)
    grain(ctx, W, H, opts.cover === 'leather' ? .1 : .16, opts.cover === 'leather' ? 2 : 1)
    if (opts.cover === 'fabric' && im) { // окошко с фото
      const w = W * .52, h = w * .72
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(W / 2 - w / 2 - 6, H * .36 - h / 2 - 6, w + 12, h + 12)
      drawCover(ctx, im, W / 2 - w / 2, H * .36 - h / 2, w, h, opts.crop, opts.filter)
    }
    const gold = ctx.createLinearGradient(0, H * .7, W, H * .8)
    gold.addColorStop(0, '#B8892E'); gold.addColorStop(.5, '#F3D88A'); gold.addColorStop(1, '#B8892E')
    ctx.font = `600 ${W * .07}px ${FONT.display}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillText(opts.title, W / 2 + 2, H * (opts.cover === 'fabric' ? .75 : .5) + 2)
    ctx.fillStyle = gold; ctx.fillText(opts.title, W / 2, H * (opts.cover === 'fabric' ? .75 : .5))
    return c
  }
  await background(ctx, d, W, H)
  if (d.art) {
    const [x, y, w, h] = d.frame === 'circle' || d.frame === 'neon' ? [.2, .12, .6, .6 * aspect] : [.14, .1, .72, .62]
    framedPhoto(ctx, im, x * W, y * H, w * W, h * H, d, opts.crop, opts.filter)
    text(ctx, d, opts.title, W / 2, H * .86, W * .8, W * (d.font === 'script' || d.font === 'hand' ? .1 : .075))
  } else {
    if (im) drawCover(ctx, im, 0, 0, W, H, opts.crop, opts.filter)
    const g = ctx.createLinearGradient(0, H * .55, 0, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.55)')
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
    text(ctx, { ...d, font: 'sans' } as Design, opts.title, W / 2, H * .86, W * .8, W * .08, 'center', '#fff')
  }
  return c
}

export function grain(ctx: CanvasRenderingContext2D, W: number, H: number, amount = .12, scale = 1) {
  const img = ctx.getImageData(0, 0, W, H); const p = img.data
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let y = 0; y < H; y += scale) for (let x = 0; x < W; x += scale) {
    const n = (rnd() - .5) * 255 * amount
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const i = ((y + dy) * W + (x + dx)) * 4
      p[i] += n; p[i + 1] += n; p[i + 2] += n
    }
  }
  ctx.putImageData(img, 0, 0)
}

/** Карта рельефа: шум (кожа, бумага) или переплетение нитей (холст, ткань). */
export function bumpTexture(kind: 'noise' | 'weave', px = 512) {
  const c = canvas(px, px); const ctx = c.getContext('2d')!
  ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, px, px)
  if (kind === 'weave') {
    for (let i = 0; i < px; i += 4) {
      ctx.fillStyle = i % 8 ? '#9a9a9a' : '#6a6a6a'; ctx.fillRect(0, i, px, 2)
      ctx.fillStyle = i % 8 ? '#707070' : '#a0a0a0'; ctx.fillRect(i, 0, 2, px)
    }
  }
  grain(ctx, px, px, kind === 'weave' ? .25 : .5, kind === 'weave' ? 1 : 2)
  return c
}

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
/** Лист календаря: фото сверху, сетка месяца снизу. */
export async function paintMonth(month: number, year: number, photoUrl: string | undefined, d: Design, aspect: number, crop?: Partial<Crop>, filter?: string, px = 1024) {
  const W = px * Math.min(1, aspect), H = W / aspect
  const c = canvas(W, H); const ctx = c.getContext('2d')!
  await background(ctx, { ...d, bg: undefined }, W, H)
  const im = photoUrl ? await loadImage(photoUrl) : null
  const ph = H * .58
  if (im) drawCover(ctx, im, W * .05, W * .05, W * .9, ph - W * .05, crop, filter)
  text(ctx, d, `${MONTHS[month]} ${year}`, W / 2, ph + H * .06, W * .8, W * .07)
  const days = new Date(year, month + 1, 0).getDate()
  const start = (new Date(year, month, 1).getDay() + 6) % 7
  const gx = W * .08, gw = W * .84, gy = ph + H * .12, gh = H - gy - H * .04
  const cw = gw / 7, rh = gh / 7
  ctx.font = `600 ${rh * .42}px ${FONT.sans}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ;['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].forEach((n, i) => { ctx.fillStyle = i > 4 ? d.accent : d.ink + '99'; ctx.fillText(n, gx + cw * (i + .5), gy + rh * .5) })
  ctx.font = `500 ${rh * .5}px ${FONT.sans}`
  for (let k = 0; k < days; k++) {
    const cell = start + k, col = cell % 7, row = Math.floor(cell / 7) + 1
    ctx.fillStyle = col > 4 ? d.accent : d.ink
    ctx.fillText(String(k + 1), gx + cw * (col + .5), gy + rh * (row + .5))
  }
  return c
}
