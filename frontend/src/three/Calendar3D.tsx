import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Leaf } from './Leaf'
import { finishOf, paperProps, toTexture } from './tex'

export interface CalendarSource { aspect: number; months: number; paintMonth: (i: number) => Promise<HTMLCanvasElement>; spiral?: string; paper?: string; desk?: boolean }
const ease = (x: number) => (x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)

function Spiral({ w, color, y = 0, z = 0 }: { w: number; color: string; y?: number; z?: number }) {
  const n = Math.round(w / 0.045)
  const geo = useMemo(() => new THREE.TorusGeometry(0.022, 0.0035, 8, 24, Math.PI * 1.6), [])
  const metal = color.toLowerCase() === '#d4af37' ? { metalness: 1, roughness: 0.25 } : { metalness: 0.6, roughness: 0.35 }
  return (
    <group position={[0, y, z]}>
      {Array.from({ length: n }).map((_, i) => (
        <mesh key={i} geometry={geo} position={[-w / 2 + 0.03 + i * ((w - 0.06) / (n - 1)), 0, 0]} rotation={[0, Math.PI / 2, -Math.PI * 0.3]} castShadow>
          <meshStandardMaterial color={color} {...metal} />
        </mesh>
      ))}
    </group>
  )
}

/** Календарь: листы-месяцы перелистываются через пружину. month — текущий месяц (0–11). */
export default function Calendar3D({ src, month }: { src: CalendarSource; month: number }) {
  const w = src.desk ? 1 : Math.min(1, src.aspect) * 0.9
  const h = w / src.aspect
  const [tex, setTex] = useState<Record<number, THREE.Texture>>({})
  const pending = useRef(new Set<number>())
  const [shown, setShown] = useState(month)
  useEffect(() => { setTex({}); pending.current.clear() }, [src])
  useEffect(() => {
    for (const i of [shown - 1, shown, shown + 1, shown + 2]) {
      if (i < 0 || i >= src.months || tex[i] || pending.current.has(i)) continue
      pending.current.add(i)
      src.paintMonth(i).then((c) => { pending.current.delete(i); setTex((t) => ({ ...t, [i]: toTexture(c) })) })
    }
  }, [shown, src]) // eslint-disable-line react-hooks/exhaustive-deps

  const max = src.desk ? Math.PI * 2 - 0.7 : Math.PI * 1.94
  const angle = useRef({ current: 0 })
  const anim = useRef<{ leaf: number; from: number; to: number; t: number } | null>(null)
  const [flying, setFlying] = useState<number | null>(null)
  useEffect(() => {
    if (month === shown || anim.current) return
    const fwd = month > shown
    anim.current = { leaf: fwd ? shown : shown - 1, from: fwd ? 0 : max, to: fwd ? max : 0, t: 0 }
  }, [month, shown, max])
  useFrame((_, dt) => {
    const a = anim.current
    if (!a) return
    if (flying !== a.leaf) setFlying(a.leaf)
    a.t = Math.min(1, a.t + dt / 1.0)
    angle.current.current = a.from + (a.to - a.from) * ease(a.t)
    if (a.t >= 1) { const next = a.to > a.from ? a.leaf + 1 : a.leaf; anim.current = null; setFlying(null); setShown(next) }
  })

  const mat = paperProps(finishOf(src.paper))
  const under = flying !== null && flying === shown ? shown + 1 : shown
  const spiral = src.spiral || '#F1F3F5'

  if (src.desk) {
    const tilt = 0.35
    return (
      <group position={[0, -0.55, 0]}>
        {/* домик: две картонные стенки */}
        {[1, -1].map((s) => (
          <mesh key={s} position={[0, h / 2 * Math.cos(tilt), s * h / 2 * Math.sin(tilt)]} rotation={[-s * tilt, 0, 0]} castShadow receiveShadow>
            <boxGeometry args={[w + 0.02, h, 0.012]} /><meshStandardMaterial color="#E9E3D8" roughness={0.9} />
          </mesh>
        ))}
        <Spiral w={w} color={spiral} y={h * Math.cos(tilt)} />
        <group position={[0, h * Math.cos(tilt), 0.009]} rotation={[-tilt, 0, 0]}>
          {under < src.months && (
            <mesh position={[0, -h / 2, 0.002]} receiveShadow><planeGeometry args={[w, h]} />
              <meshPhysicalMaterial key={tex[under]?.uuid} map={tex[under] ?? null} color="#fff" {...mat} /></mesh>
          )}
          {flying !== null && (
            <group position={[0, 0, 0.006]} rotation={[0, 0, 0]}>
              <Leaf w={w} h={h} mode="y" front={tex[flying] ?? null} back={null} angle={angle.current} max={max} curl={0.35} material={mat} />
            </group>
          )}
        </group>
      </group>
    )
  }

  return (
    <group position={[0, h / 2 + 0.1, 0]}>
      {/* подложка и подвес */}
      <mesh position={[0, -h / 2, -0.01]} castShadow receiveShadow><boxGeometry args={[w + 0.02, h + 0.02, 0.01]} /><meshStandardMaterial color="#ECE6DC" roughness={0.95} /></mesh>
      <mesh position={[0, 0.07, 0]}><torusGeometry args={[0.05, 0.003, 8, 32, Math.PI]} /><meshStandardMaterial color={spiral} metalness={0.7} roughness={0.3} /></mesh>
      <Spiral w={w} color={spiral} y={0.004} z={0.004} />
      {under < src.months && (
        <mesh position={[0, -h / 2 - 0.012, 0.002]} receiveShadow><planeGeometry args={[w, h]} />
          <meshPhysicalMaterial key={tex[under]?.uuid} map={tex[under] ?? null} color="#fff" {...mat} /></mesh>
      )}
      {flying !== null && (
        <group position={[0, -0.012, 0.006]}>
          <Leaf w={w} h={h} mode="y" front={tex[flying] ?? null} back={null} angle={angle.current} max={max} curl={0.6} material={mat} lift={0.03} />
        </group>
      )}
    </group>
  )
}
