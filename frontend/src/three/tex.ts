import { useEffect, useState } from 'react'
import * as THREE from 'three'

export function toTexture(c: HTMLCanvasElement, opts: { srgb?: boolean; repeat?: number } = {}) {
  const t = new THREE.CanvasTexture(c)
  if (opts.srgb !== false) t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(opts.repeat, opts.repeat) }
  t.needsUpdate = true
  return t
}

/** Асинхронно рисует canvas и превращает в текстуру; старая текстура освобождается. */
export function useCanvasTexture(make: () => Promise<HTMLCanvasElement | null> | HTMLCanvasElement | null, deps: unknown[], opts?: { srgb?: boolean; repeat?: number }) {
  const [tex, setTex] = useState<THREE.Texture | null>(null)
  useEffect(() => {
    let alive = true
    let made: THREE.Texture | null = null
    Promise.resolve(make()).then((c) => { if (!alive || !c) return; made = toTexture(c, opts); setTex(made) })
    return () => { alive = false; if (made) setTimeout(() => made?.dispose(), 300) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return tex
}

export type Finish = 'gloss' | 'matte' | 'satin'
export const finishOf = (paper?: string): Finish => (paper === 'gloss' ? 'gloss' : paper === 'satin' || paper === 'silk' ? 'satin' : 'matte')

/** Параметры поверхности: глянец переливается бликами, мат — рассеивает свет. */
export function paperProps(f: Finish) {
  return f === 'gloss' ? { roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.04, reflectivity: 0.6 }
    : f === 'satin' ? { roughness: 0.45, clearcoat: 0.35, clearcoatRoughness: 0.25, reflectivity: 0.4 }
      : { roughness: 0.82, clearcoat: 0, clearcoatRoughness: 1, reflectivity: 0.2 }
}
