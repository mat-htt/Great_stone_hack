import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { ContactShadows, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

/** Студийное освещение без загрузки HDR: процедурная «комната» даёт мягкие отражения на глянце. */
function StudioEnv({ intensity = 0.9 }: { intensity?: number }) {
  const { gl, scene } = useThree()
  useEffect(() => {
    const pm = new THREE.PMREMGenerator(gl)
    const env = pm.fromScene(new RoomEnvironment(), 0.035).texture
    scene.environment = env
    ;(scene as any).environmentIntensity = intensity
    return () => { scene.environment = null; env.dispose(); pm.dispose() }
  }, [gl, scene, intensity])
  return null
}

/** Узкий экран телефона — отодвигаем камеру, чтобы изделие (например, раскрытая книга) влезало по ширине. */
function AutoFit({ base, target, wide }: { base: [number, number, number]; target: [number, number, number]; wide: number }) {
  const { camera, size } = useThree()
  useEffect(() => {
    const k = Math.max(1, wide / Math.max(0.3, size.width / size.height))
    camera.position.set(target[0] + (base[0] - target[0]) * k, target[1] + (base[1] - target[1]) * k, target[2] + (base[2] - target[2]) * k)
    camera.updateProjectionMatrix()
  }, [camera, size.width, size.height, wide]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

export interface StageProps {
  wide?: number
  children: ReactNode
  camera?: [number, number, number]
  target?: [number, number, number]
  fov?: number
  floor?: number
  autoRotate?: boolean
  rotate?: boolean
  minPolar?: number
  maxPolar?: number
  minDistance?: number
  maxDistance?: number
  shadowScale?: number
  style?: React.CSSProperties
  onPointerDown?: (e: React.PointerEvent) => void
  onPointerUp?: (e: React.PointerEvent) => void
}

export default function Stage({ children, camera = [0, 0.5, 3.4], target = [0, 0, 0], fov = 30, floor = -0.6, autoRotate = true, rotate = true,
  minPolar = 0.25, maxPolar = Math.PI / 2 - 0.02, minDistance = 1.6, maxDistance = 6, shadowScale = 5, style, wide = 0.95, onPointerDown, onPointerUp }: StageProps) {
  const [spin, setSpin] = useState(autoRotate)
  const idle = useRef<any>(null)
  useEffect(() => setSpin(autoRotate), [autoRotate])
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', touchAction: rotate ? 'none' : 'pan-y', ...style }} onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
      <Canvas shadows dpr={[1, 2]} camera={{ position: camera, fov, near: 0.05, far: 50 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.02; gl.outputColorSpace = THREE.SRGBColorSpace }}>
        <StudioEnv />
        <AutoFit base={camera} target={target} wide={wide} />
        <hemisphereLight args={['#ffffff', '#c9c2b8', 0.35]} />
        <directionalLight position={[2.4, 4.2, 3.2]} intensity={1.5} castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0005} shadow-normalBias={0.02}>
          <orthographicCamera attach="shadow-camera" args={[-2, 2, 2, -2, 0.1, 12]} />
        </directionalLight>
        <directionalLight position={[-3, 1.5, -2]} intensity={0.45} color="#ffe9d6" />
        {children}
        <ContactShadows position={[0, floor, 0]} opacity={0.42} scale={shadowScale} blur={2.4} far={2.2} resolution={512} frames={1} />
        <OrbitControls makeDefault enablePan={false} enableRotate={rotate} enableDamping dampingFactor={0.08} target={target}
          autoRotate={spin} autoRotateSpeed={0.9} minPolarAngle={minPolar} maxPolarAngle={maxPolar} minDistance={minDistance} maxDistance={maxDistance * 2}
          onStart={() => { setSpin(false); clearTimeout(idle.current) }}
          onEnd={() => { clearTimeout(idle.current); if (autoRotate) idle.current = setTimeout(() => setSpin(true), 4500) }} />
      </Canvas>
    </div>
  )
}
