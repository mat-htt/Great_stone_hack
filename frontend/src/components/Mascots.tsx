import type { ReactNode } from 'react'
import { motion } from 'framer-motion'

// 3D-персонажи из презентации «Фотопринта», вырезанные нейросетью и увеличенные FSRCNN.
export type Pose = 'cat-point' | 'cat-head' | 'robot-book' | 'robot-head' | 'duo-cables'
export const MASCOT = (pose: Pose) => `/mascots/${pose}.webp`

export function Mascot({ pose, size = 160, className = '', style }: { pose: Pose; size?: number; className?: string; style?: React.CSSProperties }) {
  return <img src={MASCOT(pose)} alt={pose.startsWith('cat') ? 'Кот picPac' : pose.startsWith('robot') ? 'Робот picPac' : 'Кот и Робот'}
    className={`mascot ${className}`} style={{ width: size, height: 'auto', ...style }} draggable={false} />
}

/** Круглый аватар персонажа: фон и обводка — в цветах темы. */
export function Avatar({ who = 'cat', size = 44 }: { who?: 'cat' | 'robot'; size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size, placeItems: who === 'robot' ? 'center' : undefined }} aria-label={who === 'cat' ? 'Кот' : 'Робот'} role="img">
      <img src={MASCOT(who === 'cat' ? 'cat-head' : 'robot-head')} alt="" draggable={false} style={who === 'robot' ? { width: '92%', transform: 'none' } : undefined} />
    </span>
  )
}

export const Cat = ({ size = 44 }: { size?: number; mood?: string }) => <Avatar who="cat" size={size} />
export const Robot = ({ size = 44 }: { size?: number; mood?: string }) => <Avatar who="robot" size={size} />

export function Say({ who = 'cat', children }: { who?: 'cat' | 'robot'; children: ReactNode }) {
  return (
    <motion.div className="say" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 320, damping: 28 }}>
      <Avatar who={who} size={46} />
      <div className="bubble">{children}</div>
    </motion.div>
  )
}

/** Логотип: фирменная надпись в цвете темы. */
export function Logo({ size = 26, color }: { size?: number; color?: string }) {
  return <span className="logo" style={{ fontSize: size, color }} aria-label="PicPac">PicPac</span>
}
