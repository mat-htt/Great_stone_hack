import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const SEG = 32

/**
 * Гнущийся лист (страница книги или календаря). Петля — на краю листа, угол 0…max.
 * mode 'x': лист лежит вправо от корешка и переворачивается влево (книга, вид сверху — плоскость XZ группы).
 * mode 'y': лист висит вниз от пружины и перелистывается вверх-назад (настенный календарь).
 * Свободный край отстаёт от корешка — получается живой изгиб бумаги, а не жёсткая дощечка.
 */
export function Leaf({ w, h, front, back, angle, max = Math.PI, curl = 0.85, mode = 'x', material, lift = 0 }: {
  w: number; h: number; front: THREE.Texture | null; back: THREE.Texture | null
  angle: { current: number }; max?: number; curl?: number; mode?: 'x' | 'y'
  material: Partial<THREE.MeshPhysicalMaterialParameters>; lift?: number
}) {
  const geo = useMemo(() => {
    const g = mode === 'x' ? new THREE.PlaneGeometry(w, h, SEG, 1) : new THREE.PlaneGeometry(w, h, 1, SEG)
    if (mode === 'x') g.translate(w / 2, 0, 0); else g.translate(0, -h / 2, 0)
    return g
  }, [w, h, mode])
  const base = useMemo(() => Float32Array.from(geo.attributes.position.array as Float32Array), [geo])
  const backMap = useMemo(() => {
    if (!back) return null
    const t = back.clone(); t.needsUpdate = true
    t.wrapS = THREE.RepeatWrapping
    if (mode === 'x') { t.repeat.x = -1; t.offset.x = 1 } else { t.repeat.y = -1; t.offset.y = 1 }
    return t
  }, [back, mode])
  useEffect(() => () => { backMap?.dispose() }, [backMap])
  const last = useRef(-1)

  useFrame(() => {
    const a = angle.current
    if (Math.abs(a - last.current) < 1e-4) return
    last.current = a
    const t = Math.min(1, Math.max(0, a / max))
    const bend = curl * Math.sin(Math.PI * t)
    const pos = geo.attributes.position as THREE.BufferAttribute
    const len = mode === 'x' ? w : h
    const step = len / SEG
    // накопленная кривая вдоль листа
    const px: number[] = [0], pz: number[] = [0]
    for (let k = 0; k < SEG; k++) {
      const ak = a - bend * (k / SEG) * (mode === 'x' ? 1 : 1)
      px.push(px[k] + step * Math.cos(ak)); pz.push(pz[k] + step * Math.sin(ak))
    }
    for (let i = 0; i < pos.count; i++) {
      const bx = base[i * 3], by = base[i * 3 + 1]
      if (mode === 'x') {
        const k = Math.round((bx / w) * SEG)
        pos.setXYZ(i, px[k], by, pz[k] + lift * Math.sin(Math.PI * t))
      } else {
        const k = Math.round((-by / h) * SEG)
        pos.setXYZ(i, bx, -px[k], pz[k] + lift * Math.sin(Math.PI * t))
      }
    }
    pos.needsUpdate = true
    geo.computeVertexNormals()
  })

  return (
    <group>
      <mesh geometry={geo} castShadow receiveShadow>
        <meshPhysicalMaterial key={front?.uuid || 'f'} map={front} color={front ? '#fff' : '#f4f1ea'} side={THREE.FrontSide} {...material} />
      </mesh>
      <mesh geometry={geo} castShadow>
        <meshPhysicalMaterial key={backMap?.uuid || 'b'} map={backMap} color={backMap ? '#fff' : '#f4f1ea'} side={THREE.BackSide} {...material} />
      </mesh>
    </group>
  )
}
