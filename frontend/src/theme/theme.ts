// Движок тем: все цвета приложения, логотипа и маскотов берутся из токенов темы.
// Источник истины — backend/app/config_data/themes.json (+ темы, созданные админом).
// Здесь лежит копия для мгновенной первой отрисовки и офлайна.
import fallback from './themes.fallback.json'

export interface ThemeColors {
  primary: string; primaryInk: string; bg: string; surface: string; surface2: string; text: string; muted: string; line: string
  success: string; warning: string; danger: string; info: string; glow1: string; glow2: string; glow3: string
}
export interface Theme { id: string; name: string; family: string; mode: 'light' | 'dark'; fixed: boolean; colors: ThemeColors }
export interface ThemeSet { default: string; themes: Theme[] }

const KEY = 'picpac.theme'
let current: ThemeSet = fallback as unknown as ThemeSet
const listeners = new Set<() => void>()

export const getThemes = () => current
export const chosenId = () => { try { return localStorage.getItem(KEY) } catch { return null } }
export const activeTheme = (): Theme => current.themes.find((t) => t.id === chosenId()) || current.themes.find((t) => t.id === current.default) || current.themes[0]

export function applyTheme(t: Theme = activeTheme()) {
  const r = document.documentElement
  const c = t.colors
  const set = (k: string, v: string) => r.style.setProperty(k, v)
  set('--primary', c.primary); set('--primary-ink', c.primaryInk)
  set('--bg', c.bg); set('--surface', c.surface); set('--surface-2', c.surface2)
  set('--text', c.text); set('--muted', c.muted); set('--line', c.line)
  set('--success', c.success); set('--warning', c.warning); set('--danger', c.danger); set('--info', c.info)
  set('--glow-1', c.glow1); set('--glow-2', c.glow2); set('--glow-3', c.glow3)
  r.dataset.mode = t.mode
  r.style.colorScheme = t.mode
  let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null
  if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta) }
  meta.content = c.bg
  listeners.forEach((l) => l())
}

export function chooseTheme(id: string | null) {
  try { id ? localStorage.setItem(KEY, id) : localStorage.removeItem(KEY) } catch { /* noop */ }
  applyTheme()
}

export async function loadThemes() {
  applyTheme()
  try {
    const res = await fetch('/api/themes')
    if (res.ok) { current = await res.json(); applyTheme() }
  } catch { /* офлайн — остаётся встроенная копия */ }
}

export function onThemeChange(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn) } }

// ---------- Генератор палитры из одного цвета (для тем администратора) ----------
const hex = (h: string) => { const v = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16)) }
const toHex = (rgb: number[]) => '#' + rgb.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('').toUpperCase()
const mix = (a: string, b: string, t: number) => { const A = hex(a), B = hex(b); return toHex(A.map((x, i) => x + (B[i] - x) * t)) }
const lum = (h: string) => { const [r, g, b] = hex(h).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r + 0.7152 * g + 0.0722 * b }

export function generateTheme(primary: string, mode: 'light' | 'dark'): ThemeColors {
  const ink = lum(primary) > 0.45 ? '#141414' : '#FFFFFF'
  if (mode === 'light') {
    return {
      primary, primaryInk: ink, bg: mix('#F3F3F5', primary, 0.04), surface: '#FFFFFF', surface2: mix('#EEEEF1', primary, 0.05),
      text: '#16161A', muted: '#74747F', line: 'rgba(22,22,26,0.08)', success: '#21A366', warning: '#E08A00', danger: '#E5383B', info: '#3B7CF6',
      glow1: mix(primary, '#FFFFFF', 0.35), glow2: mix(primary, '#FFFFFF', 0.7), glow3: mix(primary, '#FFE3B8', 0.8),
    }
  }
  return {
    primary, primaryInk: ink, bg: mix('#0E0E11', primary, 0.03), surface: mix('#18181D', primary, 0.03), surface2: mix('#222229', primary, 0.04),
    text: '#F4F4F6', muted: '#9C9CA8', line: 'rgba(255,255,255,0.08)', success: '#3DD68C', warning: '#FFC247', danger: '#FF5C5C', info: '#6EA2FF',
    glow1: mix(primary, '#000000', 0.45), glow2: mix(primary, '#120A20', 0.7), glow3: mix(primary, '#0A0A20', 0.85),
  }
}

export const contrastRatio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
