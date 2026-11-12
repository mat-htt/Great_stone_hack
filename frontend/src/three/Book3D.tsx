import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Leaf } from './Leaf'
import { bumpTexture } from './paint'
import { finishOf, paperProps, toTexture } from './tex'

export interface BookSource {
  aspect: number                      // ширина/высота страницы
  pageCount: number
  paintPage: (i: number) => Promise<HTMLCanvasElement>
  paintCover: () => Promise<HTMLCanvasElement>
  cover?: string                      // hard | fabric | leather
  color?: string                      // цвет ткани/кожи
  paper?: string                      // gloss | matte | photo | silk
}

const ENDPAPER = '#EFE9DF'
const ease = (x: number) => (x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)

/** Фотокнига на столе: обложка — первый лист, дальше развороты. spread = сколько листов перевёрнуто. */
export default function Book3D({ src, spread, onSettled }: { src: BookSource; spread: number; onSettled?: (s: number) => void }) {
  const w = src.aspect >= 1 ? 1 : src.aspect
  const h = src.aspect >= 1 ? 1 / src.aspect : 1
  const leaves = 1 + Math.ceil(src.pageCount / 2)          // обложка + листы
  const lt = Math.min(0.0045, 0.12 / leaves)               // толщина листа
  const board = 0.018

  // ---- текстуры страниц (лениво, только около текущего разворота) ----
  const [tex, setTex] = useState<Record<string, THREE.Texture>>({})
  const want = (i: number) => (i >= 0 && i < src.pageCount ? `p${i}` : null)
  const pending = useRef(new Set<string>())
  const [shown, setShown] = useState(spread)
  useEffect(() => {
    const keys = ['cover']
    for (let s = shown - 2; s <= shown + 2; s++) { const a = want(2 * s - 2), b = want(2 * s - 1); if (a) keys.push(a); if (b) keys.push(b) }
    for (const k of keys) {
      if (tex[k] || pending.current.has(k)) continue
      pending.current.add(k)
      ;(k === 'cover' ? src.paintCover() : src.paintPage(+k.slice(1))).then((c) => {
        pending.current.delete(k)
        setTex((t) => ({ ...t, [k]: toTexture(c) }))
      })
    }
  }, [shown, src]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setTex({}); pending.current.clear() }, [src])
  useEffect(() => () => Object.values(tex).forEach((t) => t.dispose()), []) // eslint-disable-line react-hooks/exhaustive-deps

  const endTex = useMemo(() => { const c = document.createElement('canvas'); c.width = c.height = 8; const x = c.getContext('2d')!; x.fillStyle = ENDPAPER; x.fillRect(0, 0, 8, 8); return toTexture(c) }, [])
  const frontOf = (k: number): THREE.Texture | null => (k === 0 ? tex.cover ?? null : tex[`p${2 * k - 2}`] ?? null)
  const backOf = (k: number): THREE.Texture | null => (k === 0 ? endTex : tex[`p${2 * k - 1}`] ?? null)

  // ---- анимация переворота ----
  const anim = useRef<{ leaf: number; from: number; to: number; t: number } | null>(null)
  const angle = useRef({ current: 0 })
  useEffect(() => {
    if (spread === shown || anim.current) return
    const fwd = spread > shown
    anim.current = { leaf: fwd ? shown : shown - 1, from: fwd ? 0 : Math.PI, to: fwd ? Math.PI : 0, t: 0 }
  }, [spread, shown])
  const group = useRef<THREE.Group>(null)
  const [flying, setFlying] = useState<number | null>(null)
  useFrame((_, dt) => {
    const a = anim.current
    if (a) {
      if (flying !== a.leaf) setFlying(a.leaf)
      a.t = Math.min(1, a.t + dt / 0.9)
      angle.current.current = a.from + (a.to - a.from) * ease(a.t)
      if (a.t >= 1) {
        const next = a.to > a.from ? a.leaf + 1 : a.leaf
        anim.current = null; setFlying(null); setShown(next); onSettled?.(next)
      }
    }
    // закрытая книга — по центру; открытая — корешок по центру
    if (group.current) {
      const s = anim.current ? (anim.current.to > anim.current.from ? shown + .5 : shown - .5) : shown
      const target = s <= 0 ? -w / 2 : s >= leaves ? w / 2 : 0
      group.current.position.x += (target - group.current.position.x) * Math.min(1, dt * 4)
    }
  })

  const fin = finishOf(src.paper)
  const pageMat = useMemo(() => ({ ...paperProps(fin === 'gloss' ? 'satin' : fin), sheen: 0 }), [fin])
  const coverMat = useMemo(() => {
    if (src.cover === 'leather') return { roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.4, bumpMap: toTexture(bumpTexture('noise'), { srgb: false, repeat: 3 }), bumpScale: 1.2 }
    if (src.cover === 'fabric') return { roughness: 0.95, sheen: 0.6, sheenRoughness: 0.5, sheenColor: new THREE.Color('#ffffff'), bumpMap: toTexture(bumpTexture('weave'), { srgb: false, repeat: 6 }), bumpScale: 1.5 }
    return paperProps(fin === 'matte' ? 'satin' : 'gloss')   // ламинированная фотообложка
  }, [src.cover, fin])

  // слева/справа стопки уже перевёрнутых и оставшихся листов
  const done = flying !== null ? Math.min(shown, flying) : shown
  const rest = leaves - done - (flying !== null ? 1 : 0)
  const leftT = Math.max(0, done - 1) * lt
  const rightT = Math.max(0, rest - 1) * lt
  const topLeft = flying !== null && flying === shown - 1 ? shown - 2 : shown - 1
  const topRight = flying !== null && flying === shown ? shown + 1 : shown
  const edgeColor = src.cover === 'fabric' || src.cover === 'leather' ? (src.color || '#3A3F47') : '#2a2a2a'

  return (
    <group ref={group} rotation={[-Math.PI / 2, 0, 0]} position={[-w / 2, -0.5, 0]}>
      {/* задняя крышка под правой стопкой и передняя под левой (если книга открыта) */}
      <mesh position={[w / 2 + 0.006, 0, -board / 2]} castShadow receiveShadow>
        <boxGeometry args={[w + 0.012, h + 0.02, board]} />
        <meshPhysicalMaterial color={edgeColor} roughness={0.6} />
      </mesh>
      {done >= 1 && (
        <mesh position={[-w / 2 - 0.006, 0, -board / 2]} castShadow receiveShadow>
          <boxGeometry args={[w + 0.012, h + 0.02, board]} />
          <meshPhysicalMaterial color={edgeColor} roughness={0.6} />
        </mesh>
      )}
      {/* блоки страниц */}
      {rightT > 0 && <mesh position={[w / 2, 0, rightT / 2]} castShadow><boxGeometry args={[w - 0.004, h - 0.006, rightT]} /><meshStandardMaterial color="#F7F4EE" roughness={0.9} /></mesh>}
      {leftT > 0 && <mesh position={[-w / 2, 0, leftT / 2]} castShadow><boxGeometry args={[w - 0.004, h - 0.006, leftT]} /><meshStandardMaterial color="#F7F4EE" roughness={0.9} /></mesh>}

      {/* верхняя правая страница (или обложка, если книга закрыта) */}
      {topRight < leaves && (
        <group position={[0, 0, rightT + 0.0008]}>
          <mesh position={[w / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[w, h]} />
            <meshPhysicalMaterial key={frontOf(topRight)?.uuid} map={frontOf(topRight)} color={frontOf(topRight) ? '#fff' : '#f4f1ea'} {...(topRight === 0 ? coverMat : pageMat)} />
          </mesh>
        </group>
      )}
      {topRight >= leaves && (
        <mesh position={[w / 2, 0, 0.0008]} receiveShadow><planeGeometry args={[w, h]} /><meshStandardMaterial color={ENDPAPER} roughness={0.9} /></mesh>
      )}
      {/* верхняя левая страница */}
      {topLeft >= 0 && (
        <group position={[0, 0, leftT + 0.0008]}>
          <mesh position={[-w / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[w, h]} />
            <meshPhysicalMaterial key={backOf(topLeft)?.uuid} map={backOf(topLeft)} color="#fff" {...pageMat} />
          </mesh>
        </group>
      )}
      {/* переворачиваемый лист */}
      {flying !== null && (
        <group position={[0, 0, Math.max(leftT, rightT) + 0.002]}>
          <Leaf w={w} h={h} front={frontOf(flying)} back={backOf(flying)} angle={angle.current} material={flying === 0 ? coverMat : pageMat} curl={flying === 0 ? 0.25 : 0.9} lift={0.02} />
        </group>
      )}
    </group>
  )
}
