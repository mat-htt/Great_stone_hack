import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import { bumpTexture, canvas, drawCover, loadImage } from './paint'
import { paperProps, toTexture, useCanvasTexture, type Finish } from './tex'

export interface PhotoProps { url: string; filter?: string; finish?: Finish }

/** Фото, вписанное в прямоугольник с полями — основа для большинства текстур. */
async function photoCanvas(url: string, aspect: number, filter?: string, px = 1024, border = 0, bottom = 0, bg = '#fff') {
  const W = aspect >= 1 ? px : px * aspect, H = aspect >= 1 ? px / aspect : px
  const c = canvas(W, H); const x = c.getContext('2d')!
  x.fillStyle = bg; x.fillRect(0, 0, W, H)
  const im = await loadImage(url)
  const b = Math.min(W, H) * border
  if (im) drawCover(x, im, b, b, W - 2 * b, H - 2 * b - Math.min(W, H) * bottom, {}, filter)
  return c
}

// ---------------- Кружка ----------------
const R = 0.42
const GAP = 0.42 // зазор под ручку, рад
export function Mug({ url, filter, inner = '#ffffff', chameleon = false, hot = true }: PhotoProps & { inner?: string; chameleon?: boolean; hot?: boolean }) {
  const thetaStart = Math.PI / 2 + GAP / 2
  const thetaLen = Math.PI * 2 - GAP
  const printH = 0.8
  const tex = useCanvasTexture(async () => {
    const L = R * thetaLen
    const W = 2048, H = Math.round(W * printH / L)
    const c = canvas(W, H); const x = c.getContext('2d')!
    x.fillStyle = chameleon ? '#ffffff' : '#ffffff'; x.fillRect(0, 0, W, H)
    const im = await loadImage(url)
    if (im) {
      const uFront = ((Math.PI * 2 - thetaStart) % (Math.PI * 2)) / thetaLen
      const pw = Math.min(W * 0.62, H * (im.width / im.height) * 1.05)
      const r = H * 0.04
      x.save(); x.beginPath(); x.roundRect(uFront * W - pw / 2, H * 0.03, pw, H * 0.94, r); x.clip()
      drawCover(x, im, uFront * W - pw / 2, H * 0.03, pw, H * 0.94, {}, filter)
      x.restore()
    }
    return c
  }, [url, filter, chameleon])

  const outer = useMemo(() => new THREE.LatheGeometry([
    [0, -0.5], [0.33, -0.5], [0.375, -0.494], [0.4, -0.478], [0.414, -0.45], [R, -0.4], [R, 0.47], [R - 0.002, 0.491], [R - 0.011, 0.5], [R - 0.022, 0.498], [R - 0.03, 0.486],
  ].map(([a, b]) => new THREE.Vector2(a, b)), 96), [])
  const innerGeo = useMemo(() => new THREE.LatheGeometry([
    [R - 0.03, 0.486], [R - 0.032, -0.36], [R - 0.05, -0.41], [R - 0.09, -0.425], [0, -0.43],
  ].map(([a, b]) => new THREE.Vector2(a, b)), 96), [])
  const handle = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(R - 0.03, 0.3, 0), new THREE.Vector3(R + 0.14, 0.31, 0), new THREE.Vector3(R + 0.27, 0.2, 0),
      new THREE.Vector3(R + 0.3, 0.02, 0), new THREE.Vector3(R + 0.24, -0.17, 0), new THREE.Vector3(R + 0.1, -0.25, 0), new THREE.Vector3(R - 0.03, -0.25, 0),
    ])
    return new THREE.TubeGeometry(curve, 80, 0.05, 24, false)
  }, [])
  const printMat = useRef<THREE.MeshPhysicalMaterial>(null)
  const bodyMat = useRef<THREE.MeshPhysicalMaterial>(null)
  const heat = useRef(hot ? 1 : 0)
  const black = useMemo(() => new THREE.Color('#141414'), []), white = useMemo(() => new THREE.Color('#fbfbfa'), [])
  useFrame((_, dt) => { // «хамелеон»: чёрное покрытие светлеет от горячего и проявляет фото
    if (!chameleon) return
    heat.current += ((hot ? 1 : 0) - heat.current) * Math.min(1, dt * 1.6)
    if (printMat.current) printMat.current.opacity = heat.current
    if (bodyMat.current) bodyMat.current.color.copy(black).lerp(white, heat.current)
  })
  const ceramic = { roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.03 }
  const body = chameleon ? '#141414' : '#fbfbfa'
  return (
    <group position={[0, -0.08, 0]} rotation={[0, -0.5, 0]}>
      <mesh geometry={outer} castShadow receiveShadow><meshPhysicalMaterial ref={bodyMat} color={body} {...ceramic} /></mesh>
      <mesh geometry={innerGeo}><meshPhysicalMaterial color={chameleon ? '#141414' : inner} side={THREE.DoubleSide} {...ceramic} /></mesh>
      <mesh geometry={handle} castShadow><meshPhysicalMaterial color={chameleon ? '#141414' : inner} {...ceramic} /></mesh>
      {tex && (
        <mesh position={[0, 0.02, 0]}>
          <cylinderGeometry args={[R + 0.0015, R + 0.0015, printH, 160, 1, true, thetaStart, thetaLen]} />
          <meshPhysicalMaterial key={(tex)?.uuid ?? 'none'} ref={printMat} map={tex} transparent={chameleon} opacity={chameleon ? (hot ? 1 : 0) : 1} {...ceramic} polygonOffset polygonOffsetFactor={-2} />
        </mesh>
      )}
    </group>
  )
}

// ---------------- Фотопечать (веер снимков) ----------------
export function Prints({ urls, filter, finish = 'gloss', polaroid = false, aspect = 1.5 }: { urls: string[]; filter?: string; finish?: Finish; polaroid?: boolean; aspect?: number }) {
  const list = (urls.length ? urls : ['']).slice(0, 4)
  const layout = [[-0.32, 0.06, 0.22], [0.02, -0.04, -0.08], [0.32, 0.1, 0.16], [0.05, 0.28, -0.3]]
  return (
    <group position={[0, -0.55, 0.1]}>
      {list.map((u, i) => <Print key={u + i} url={u} filter={filter} finish={finish} polaroid={polaroid} aspect={aspect} pos={layout[i]} y={i * 0.006} />)}
    </group>
  )
}
function Print({ url, filter, finish, polaroid, aspect, pos, y }: { url: string; filter?: string; finish: Finish; polaroid: boolean; aspect: number; pos: number[]; y: number }) {
  const a = polaroid ? 0.82 : aspect
  const w = polaroid ? 0.62 : 0.78, h = w / a
  const tex = useCanvasTexture(() => photoCanvas(url, a, filter, 900, polaroid ? 0.06 : 0, polaroid ? 0.16 : 0), [url, filter, polaroid])
  return (
    <mesh position={[pos[0], y + 0.002, pos[1]]} rotation={[-Math.PI / 2, 0, pos[2]]} castShadow receiveShadow>
      <boxGeometry args={[w, h, 0.003]} />
      {[0, 1, 2, 3].map((i) => <meshStandardMaterial key={i} attach={`material-${i}`} color="#f2f2f2" />)}
      <meshPhysicalMaterial key={(tex)?.uuid ?? 'none'} attach="material-4" map={tex} {...paperProps(finish)} />
      <meshStandardMaterial attach="material-5" color="#f6f4ef" roughness={0.9} />
    </mesh>
  )
}

// ---------------- Постер на деревянных рейках ----------------
export function Poster({ url, filter, finish = 'matte', aspect = 0.71 }: PhotoProps & { aspect?: number }) {
  const h = 1.3, w = h * aspect
  const tex = useCanvasTexture(() => photoCanvas(url, aspect, filter, 1400), [url, filter, aspect])
  const geo = useMemo(() => { const g = new THREE.PlaneGeometry(w, h, 24, 1); const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, 0.015 * Math.sin(Math.PI * (p.getX(i) / w + 0.5))); g.computeVertexNormals(); return g }, [w, h])
  const wood = { color: '#B98B5C', roughness: 0.6 }
  return (
    <group position={[0, 0.05, 0]}>
      <mesh geometry={geo} castShadow receiveShadow><meshPhysicalMaterial key={(tex)?.uuid ?? 'none'} map={tex} side={THREE.DoubleSide} {...paperProps(finish)} /></mesh>
      {[h / 2, -h / 2].map((y) => (
        <mesh key={y} position={[0, y, 0.012]} rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[0.018, 0.018, w + 0.06, 24]} /><meshStandardMaterial {...wood} /></mesh>
      ))}
      <mesh position={[0, h / 2 + 0.12, 0.01]}><torusGeometry args={[0.16, 0.002, 6, 48, Math.PI * 0.62]} /><meshStandardMaterial color="#3b3b3b" /></mesh>
    </group>
  )
}

// ---------------- Холст на подрамнике ----------------
export function CanvasArt({ url, filter, aspect = 1.33, depth = 0.05 }: PhotoProps & { aspect?: number; depth?: number }) {
  const w = aspect >= 1 ? 1.25 : 1.25 * aspect, h = w / aspect
  // одна текстура с запасом под загиб на торцы (галерейная натяжка)
  const tex = useCanvasTexture(async () => {
    const k = 1000 / w, d = depth * k
    const c = canvas(w * k + 2 * d, h * k + 2 * d); const x = c.getContext('2d')!
    const im = await loadImage(url)
    if (im) drawCover(x, im, 0, 0, c.width, c.height, {}, filter)
    return c
  }, [url, filter, w, h, depth])
  const faces = useMemo(() => {
    if (!tex) return null
    const W = w + 2 * depth, H = h + 2 * depth
    const part = (x0: number, y0: number, pw: number, ph: number) => { const t = tex.clone(); t.needsUpdate = true; t.repeat.set(pw / W, ph / H); t.offset.set(x0 / W, y0 / H); return t }
    return { front: part(depth, depth, w, h), right: part(depth + w, depth, depth, h), left: part(0, depth, depth, h), top: part(depth, depth + h, w, depth), bottom: part(depth, 0, w, depth) }
  }, [tex, w, h, depth])
  const bump = useMemo(() => toTexture(bumpTexture('weave'), { srgb: false, repeat: 8 }), [])
  const m = { roughness: 0.88, bumpMap: bump, bumpScale: 0.6 }
  return (
    <group position={[0, 0.05, 0]} rotation={[0, -0.35, 0]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[w, h, depth]} />
        <meshPhysicalMaterial key={(faces?.right ?? null)?.uuid ?? 'none'} attach="material-0" map={faces?.right ?? null} {...m} />
        <meshPhysicalMaterial key={(faces?.left ?? null)?.uuid ?? 'none'} attach="material-1" map={faces?.left ?? null} {...m} />
        <meshPhysicalMaterial key={(faces?.top ?? null)?.uuid ?? 'none'} attach="material-2" map={faces?.top ?? null} {...m} />
        <meshPhysicalMaterial key={(faces?.bottom ?? null)?.uuid ?? 'none'} attach="material-3" map={faces?.bottom ?? null} {...m} />
        <meshPhysicalMaterial key={(faces?.front ?? null)?.uuid ?? 'none'} attach="material-4" map={faces?.front ?? null} {...m} />
        <meshStandardMaterial attach="material-5" color="#D8C3A0" roughness={0.9} />
      </mesh>
    </group>
  )
}

// ---------------- Магниты на холодильнике ----------------
export function Magnets({ urls, filter, finish = 'gloss' }: { urls: string[]; filter?: string; finish?: Finish }) {
  const list = Array.from({ length: 4 }, (_, i) => urls[i % Math.max(1, urls.length)] || '')
  const pos = [[-0.27, 0.2, -0.06], [0.24, 0.24, 0.05], [-0.24, -0.22, 0.04], [0.27, -0.19, -0.05]]
  return (
    <group position={[0, 0.05, 0]}>
      <mesh position={[0, 0, -0.02]} receiveShadow><boxGeometry args={[1.5, 1.4, 0.02]} /><meshPhysicalMaterial color="#F1F4F7" roughness={0.25} clearcoat={0.6} /></mesh>
      {list.map((u, i) => <Magnet key={i} url={u} filter={filter} finish={finish} p={pos[i]} />)}
    </group>
  )
}
function Magnet({ url, filter, finish, p }: { url: string; filter?: string; finish: Finish; p: number[] }) {
  const tex = useCanvasTexture(() => photoCanvas(url, 1.43, filter, 700), [url, filter])
  return (
    <group position={[p[0], p[1], 0.012]} rotation={[0, 0, p[2]]}>
      <RoundedBox args={[0.46, 0.32, 0.02]} radius={0.012} smoothness={3} castShadow><meshStandardMaterial color="#fafafa" /></RoundedBox>
      <mesh position={[0, 0, 0.0105]}><planeGeometry args={[0.44, 0.3]} /><meshPhysicalMaterial key={(tex)?.uuid ?? 'none'} map={tex} {...paperProps(finish)} /></mesh>
    </group>
  )
}

// ---------------- Пазл (с вынутым кусочком) ----------------
function tabEdge(path: { bezierCurveTo: (...a: number[]) => void; lineTo: (x: number, y: number) => void }, x0: number, y0: number, x1: number, y1: number, s: number) {
  if (!s) { path.lineTo(x1, y1); return }
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), nx = -dy / L * s, ny = dx / L * s
  const P = (t: number, n: number) => [x0 + dx * t + nx * L * n, y0 + dy * t + ny * L * n]
  path.lineTo(...(P(0.36, 0) as [number, number]))
  path.bezierCurveTo(...P(0.42, 0.02), ...P(0.3, 0.22), ...P(0.5, 0.22))
  path.bezierCurveTo(...P(0.7, 0.22), ...P(0.58, 0.02), ...P(0.64, 0))
  path.lineTo(x1, y1)
}
export function Puzzle({ url, filter, aspect = 1.43 }: PhotoProps & { aspect?: number }) {
  const W = 1.2, H = W / aspect, cols = 6, rows = 4
  const signs = useMemo(() => { let s = 5; const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280 > .5 ? 1 : -1); return { h: Array.from({ length: rows * cols }, r), v: Array.from({ length: rows * cols }, r) } }, [])
  const hole = { c: 1, r: 1 }
  const pieceShape = (ctx: any, c: number, r: number, k: number) => {
    const cw = W / cols * k, rh = H / rows * k
    const x0 = c * cw, y0 = r * rh
    const top = r === 0 ? 0 : -signs.h[(r - 1) * cols + c], bottom = r === rows - 1 ? 0 : signs.h[r * cols + c]
    const left = c === 0 ? 0 : -signs.v[r * cols + c - 1], right = c === cols - 1 ? 0 : signs.v[r * cols + c]
    ctx.moveTo(x0, y0)
    tabEdge(ctx, x0, y0, x0 + cw, y0, top); tabEdge(ctx, x0 + cw, y0, x0 + cw, y0 + rh, right)
    tabEdge(ctx, x0 + cw, y0 + rh, x0, y0 + rh, bottom); tabEdge(ctx, x0, y0 + rh, x0, y0, left)
  }
  const tex = useCanvasTexture(async () => {
    const c = await photoCanvas(url, aspect, filter, 1400)
    const x = c.getContext('2d')!; const k = c.width / W
    x.lineWidth = 2; x.strokeStyle = 'rgba(0,0,0,.28)'
    for (let r = 0; r < rows; r++) for (let cc = 0; cc < cols; cc++) { x.beginPath(); pieceShape(x, cc, r, k); x.stroke() }
    x.save(); x.beginPath(); pieceShape(x, hole.c, hole.r, k); x.clip(); x.fillStyle = '#5a4f45'; x.fillRect(0, 0, c.width, c.height); x.restore()
    return c
  }, [url, filter])
  const pieceTex = useCanvasTexture(() => photoCanvas(url, aspect, filter, 1400), [url, filter])
  const piece = useMemo(() => {
    // контур в координатах холста (Y вниз) → в 3D (Y вверх): переворачиваем Y прямо при построении, без отрицательного масштаба
    const s = new THREE.Shape()
    const flip = { moveTo: (x: number, y: number) => s.moveTo(x, -y), lineTo: (x: number, y: number) => s.lineTo(x, -y),
      bezierCurveTo: (a: number, b: number, c: number, d: number, e: number, f: number) => s.bezierCurveTo(a, -b, c, -d, e, -f) }
    pieceShape(flip, hole.c, hole.r, 1)
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2, curveSegments: 10 })
    const pos = g.attributes.position, uv = new Float32Array(pos.count * 2)
    for (let i = 0; i < pos.count; i++) { uv[i * 2] = pos.getX(i) / W; uv[i * 2 + 1] = 1 + pos.getY(i) / H }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    g.translate(-(hole.c + .5) * W / cols, (hole.r + .5) * H / rows, 0)
    return g
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const pt = pieceTex
  const fly = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => { if (fly.current) { fly.current.position.y = 0.16 + Math.sin(clock.elapsedTime * 1.6) * 0.03; fly.current.rotation.z = Math.sin(clock.elapsedTime * .8) * 0.25 } })
  return (
    <group position={[0, -0.55, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]} castShadow receiveShadow>
        <boxGeometry args={[W, H, 0.012]} />
        {[0, 1, 2, 3].map((i) => <meshStandardMaterial key={i} attach={`material-${i}`} color="#d9cbb6" />)}
        <meshPhysicalMaterial key={(tex)?.uuid ?? 'none'} attach="material-4" map={tex} {...paperProps('satin')} />
        <meshStandardMaterial attach="material-5" color="#d9cbb6" />
      </mesh>
      <mesh ref={fly} geometry={piece} position={[(hole.c + .5) * W / cols - W / 2 + 0.05, 0.16, -((hole.r + .5) * H / rows - H / 2) + 0.18]} rotation={[-Math.PI / 2.6, 0, 0]} castShadow>
        <meshPhysicalMaterial key={(pt)?.uuid ?? 'none'} map={pt} {...paperProps('matte')} />
      </mesh>
    </group>
  )
}

// ---------------- Подушка ----------------
export function Pillow({ url, filter, satin = true }: PhotoProps & { satin?: boolean }) {
  const S = 1.15
  const tex = useCanvasTexture(() => photoCanvas(url, 1, filter, 1200), [url, filter])
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(S, S, 64, 64); const p = g.attributes.position
    for (let i = 0; i < p.count; i++) {
      const u = (p.getX(i) / S) * 2, v = (p.getY(i) / S) * 2
      const f = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u), 3.2)), .55) * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(v), 3.2)), .55)
      p.setZ(i, 0.17 * f)
      p.setX(i, p.getX(i) * (1 - 0.06 * (1 - Math.abs(v)) * Math.abs(u) ** 2))   // уголки «ушками»
      p.setY(i, p.getY(i) * (1 - 0.06 * (1 - Math.abs(u)) * Math.abs(v) ** 2))
    }
    g.computeVertexNormals(); return g
  }, [])
  const fabric = satin ? { roughness: 0.55, sheen: 0.9, sheenRoughness: 0.35, sheenColor: new THREE.Color('#ffffff') } : { roughness: 0.96, sheen: 0.4, sheenRoughness: 0.8, sheenColor: new THREE.Color('#ffffff') }
  return (
    <group position={[0, 0, 0]} rotation={[-0.15, 0.4, 0.05]}>
      <mesh geometry={geo} castShadow receiveShadow><meshPhysicalMaterial key={(tex)?.uuid ?? 'none'} map={tex} {...fabric} /></mesh>
      <mesh geometry={geo} rotation={[0, Math.PI, 0]} castShadow><meshPhysicalMaterial color="#f5f3ef" {...fabric} /></mesh>
    </group>
  )
}

// ---------------- Футболка ----------------
export function Tshirt({ url, filter, color = '#F8F9FA' }: PhotoProps & { color?: string }) {
  const geo = useMemo(() => {
    const s = new THREE.Shape()
    s.moveTo(-0.15, 0.62); s.quadraticCurveTo(0, 0.5, 0.15, 0.62)
    s.lineTo(0.36, 0.56); s.lineTo(0.66, 0.34); s.lineTo(0.55, 0.16); s.lineTo(0.38, 0.27)
    s.lineTo(0.38, -0.62); s.quadraticCurveTo(0, -0.66, -0.38, -0.62)
    s.lineTo(-0.38, 0.27); s.lineTo(-0.55, 0.16); s.lineTo(-0.66, 0.34); s.lineTo(-0.36, 0.56); s.lineTo(-0.15, 0.62)
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 8, curveSegments: 24 })
    g.translate(0, 0, -0.05); return g
  }, [])
  const tex = useCanvasTexture(async () => {
    const c = await photoCanvas(url, 0.82, filter, 900, 0, 0, 'rgba(0,0,0,0)')
    return c
  }, [url, filter])
  const bump = useMemo(() => toTexture(bumpTexture('weave'), { srgb: false, repeat: 10 }), [])
  return (
    <group position={[0, 0.08, 0]}>
      <mesh geometry={geo} castShadow receiveShadow><meshPhysicalMaterial color={color} roughness={0.95} sheen={0.7} sheenRoughness={0.6} sheenColor={new THREE.Color('#ffffff')} bumpMap={bump} bumpScale={0.5} /></mesh>
      <mesh position={[0, 0.06, 0.102]}><planeGeometry args={[0.42, 0.42 / 0.82]} /><meshPhysicalMaterial key={(tex)?.uuid ?? 'none'} map={tex} roughness={0.85} bumpMap={bump} bumpScale={0.35} polygonOffset polygonOffsetFactor={-2} /></mesh>
      <mesh position={[0, 0.575, 0.06]} rotation={[Math.PI / 2 - 0.25, 0, 0]}><torusGeometry args={[0.16, 0.018, 12, 40, Math.PI]} /><meshPhysicalMaterial color={color} roughness={0.95} /></mesh>
    </group>
  )
}

// ---------------- Открытка / приглашение ----------------
export function Card({ front, finish = 'matte', aspect = 1.5 }: { front: () => Promise<HTMLCanvasElement>; finish?: Finish; aspect?: number; key2?: string }) {
  const w = aspect >= 1 ? 1.1 : 1.1 * aspect, h = w / aspect
  const tex = useCanvasTexture(front, [front])
  const back = useCanvasTexture(() => {
    const c = canvas(1024, 1024 / aspect); const x = c.getContext('2d')!
    x.fillStyle = '#FBFAF7'; x.fillRect(0, 0, c.width, c.height)
    x.strokeStyle = '#cfc7bb'; x.lineWidth = 2
    for (let i = 0; i < 4; i++) { x.beginPath(); x.moveTo(c.width * .55, c.height * (.45 + i * .12)); x.lineTo(c.width * .92, c.height * (.45 + i * .12)); x.stroke() }
    x.beginPath(); x.moveTo(c.width / 2, c.height * .1); x.lineTo(c.width / 2, c.height * .9); x.stroke()
    x.strokeRect(c.width * .78, c.height * .1, c.width * .14, c.width * .16)
    x.fillStyle = '#b8aea0'; x.font = '500 28px sans-serif'; x.fillText('picPac', c.width * .06, c.height * .9)
    return c
  }, [aspect])
  return (
    <group position={[0, -0.55 + h / 2 * Math.cos(0.22), -0.05]} rotation={[-0.22, 0.3, 0]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[w, h, 0.008]} />
        {[0, 1, 2, 3].map((i) => <meshStandardMaterial key={i} attach={`material-${i}`} color="#f4f1ea" />)}
        <meshPhysicalMaterial key={(tex)?.uuid ?? 'none'} attach="material-4" map={tex} {...paperProps(finish)} />
        <meshPhysicalMaterial key={(back)?.uuid ?? 'none'} attach="material-5" map={back} {...paperProps('matte')} />
      </mesh>
    </group>
  )
}

// ---------------- Фотоконверт (клапан открывается) ----------------
export function Envelope({ url, filter, open }: PhotoProps & { open: boolean }) {
  const w = 1.2, h = 0.82
  const tex = useCanvasTexture(() => photoCanvas(url, w / h, filter, 1200), [url, filter])
  const flapGeo = useMemo(() => { const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.quadraticCurveTo(0.06, -h * 0.55, 0, -h * 0.58); s.quadraticCurveTo(-0.06, -h * 0.55, -w / 2, 0); return new THREE.ShapeGeometry(s, 24) }, [])
  const flap = useRef<THREE.Group>(null)
  useFrame((_, dt) => { if (flap.current) { const t = open ? Math.PI * 0.9 : 0; flap.current.rotation.x += (t - flap.current.rotation.x) * Math.min(1, dt * 3) } })
  return (
    <group position={[0, 0.02, 0]} rotation={[0, Math.PI + 0.35, 0]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[w, h, 0.01]} />
        {[0, 1, 2, 3].map((i) => <meshStandardMaterial key={i} attach={`material-${i}`} color="#efe9df" />)}
        <meshStandardMaterial attach="material-4" color="#F3EEE6" roughness={0.9} />
        <meshPhysicalMaterial key={(tex)?.uuid ?? 'none'} attach="material-5" map={tex} {...paperProps('satin')} />
      </mesh>
      <group ref={flap} position={[0, h / 2, 0.006]}>
        <mesh geometry={flapGeo} castShadow><meshStandardMaterial color="#EAE3D6" roughness={0.85} side={THREE.DoubleSide} /></mesh>
      </group>
    </group>
  )
}
