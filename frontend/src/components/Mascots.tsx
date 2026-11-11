import type { ReactNode } from 'react'
import { motion } from 'framer-motion'

/** Кот — креативный директор: рыжий, «с именем», живёт с компанией давно. */
export function Cat({ size = 56, mood = 'happy', className = '' }: { size?: number; mood?: 'happy' | 'think' | 'wow'; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" className={className} role="img" aria-label="Кот picPac">
      <defs>
        <radialGradient id="catFur" cx="50%" cy="40%" r="65%">
          <stop offset="0%" stopColor="#F6A964" />
          <stop offset="100%" stopColor="#E07B39" />
        </radialGradient>
      </defs>
      <path d="M22 50 L18 14 Q19 9 24 12 L48 30 Z" fill="#E07B39" />
      <path d="M98 50 L102 14 Q101 9 96 12 L72 30 Z" fill="#E07B39" />
      <path d="M25 42 L23 20 L40 32 Z" fill="#F9C6B3" />
      <path d="M95 42 L97 20 L80 32 Z" fill="#F9C6B3" />
      <ellipse cx="60" cy="66" rx="44" ry="40" fill="url(#catFur)" />
      <path d="M52 30 Q55 40 52 46 M60 28 Q62 38 60 46 M68 30 Q65 40 68 46" stroke="#C9612A" strokeWidth="4" strokeLinecap="round" fill="none" />
      <ellipse cx="60" cy="84" rx="22" ry="16" fill="#FFE9D6" />
      {mood === 'wow' ? (
        <>
          <circle cx="42" cy="62" r="8" fill="#1F2B29" /><circle cx="78" cy="62" r="8" fill="#1F2B29" />
          <circle cx="45" cy="59" r="2.6" fill="#fff" /><circle cx="81" cy="59" r="2.6" fill="#fff" />
        </>
      ) : mood === 'think' ? (
        <>
          <path d="M34 63 Q42 56 50 63" stroke="#1F2B29" strokeWidth="4.5" strokeLinecap="round" fill="none" />
          <circle cx="78" cy="60" r="6.5" fill="#1F2B29" className="blink" /><circle cx="80" cy="58" r="2" fill="#fff" />
        </>
      ) : (
        <g className="blink">
          <ellipse cx="42" cy="62" rx="6.5" ry="7.5" fill="#1F2B29" /><ellipse cx="78" cy="62" rx="6.5" ry="7.5" fill="#1F2B29" />
          <circle cx="44.5" cy="59" r="2.2" fill="#fff" /><circle cx="80.5" cy="59" r="2.2" fill="#fff" />
        </g>
      )}
      <path d="M55 76 Q60 81 65 76 Q60 73 55 76 Z" fill="#DD5757" />
      <path d="M60 80 Q60 86 53 87 M60 80 Q60 86 67 87" stroke="#1F2B29" strokeWidth="2.6" strokeLinecap="round" fill="none" />
      <path d="M30 78 L10 74 M30 83 L11 86 M90 78 L110 74 M90 83 L109 86" stroke="#7A4A2A" strokeWidth="1.8" strokeLinecap="round" opacity=".55" />
      <ellipse cx="33" cy="76" rx="6" ry="3.5" fill="#F48A8A" opacity=".55" />
      <ellipse cx="87" cy="76" rx="6" ry="3.5" fill="#F48A8A" opacity=".55" />
    </svg>
  )
}

/** Робот — ОТК и производство: появился в этом году вместе с AI. */
export function Robot({ size = 56, mood = 'happy', className = '' }: { size?: number; mood?: 'happy' | 'scan' | 'alert'; className?: string }) {
  const eye = mood === 'alert' ? '#FFE36E' : '#7CF0C9'
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" className={className} role="img" aria-label="Робот picPac">
      <line x1="60" y1="10" x2="60" y2="26" stroke="#364C49" strokeWidth="4" strokeLinecap="round" />
      <circle cx="60" cy="10" r="7" fill="#DD5757">
        <animate attributeName="opacity" values="1;.45;1" dur="1.6s" repeatCount="indefinite" />
      </circle>
      <rect x="12" y="50" width="12" height="26" rx="6" fill="#364C49" />
      <rect x="96" y="50" width="12" height="26" rx="6" fill="#364C49" />
      <rect x="18" y="24" width="84" height="78" rx="28" fill="#F4EFE7" stroke="#364C49" strokeWidth="4" />
      <rect x="28" y="40" width="64" height="38" rx="17" fill="#1B2422" />
      {mood === 'scan' ? (
        <rect x="34" y="56" width="52" height="6" rx="3" fill={eye}>
          <animate attributeName="y" values="46;66;46" dur="1.3s" repeatCount="indefinite" />
        </rect>
      ) : (
        <g className="blink">
          <rect x="40" y="52" width="13" height="15" rx="6.5" fill={eye} />
          <rect x="67" y="52" width="13" height="15" rx="6.5" fill={eye} />
        </g>
      )}
      <path d="M48 88 Q60 95 72 88" stroke="#364C49" strokeWidth="4" strokeLinecap="round" fill="none" />
      <circle cx="31" cy="88" r="5" fill="#DD5757" opacity=".45" />
      <circle cx="89" cy="88" r="5" fill="#DD5757" opacity=".45" />
    </svg>
  )
}

export function Say({ who = 'cat', children, hand = false, dark = false, mood }: { who?: 'cat' | 'robot'; children: ReactNode; hand?: boolean; dark?: boolean; mood?: any }) {
  return (
    <motion.div className="mascot-line" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 26 }}>
      <div className="float" style={{ flexShrink: 0 }}>{who === 'cat' ? <Cat size={50} mood={mood} /> : <Robot size={50} mood={mood} />}</div>
      <div className={`bubble ${hand ? 'hand' : ''} ${dark ? 'dark' : ''}`}>{children}</div>
    </motion.div>
  )
}

export function Logo({ size = 28, light = false }: { size?: number; light?: boolean }) {
  return (
    <span className="logo" style={{ fontSize: size, color: light ? '#fff' : undefined }} aria-label="picPac">
      PicPac
    </span>
  )
}

export function Heart({ size = 18, color = '#DD5757' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M12 21s-7.5-4.6-9.6-9.4C.9 8.2 3 4.5 6.6 4.5c2.1 0 3.6 1.1 4.4 2.6.8-1.5 2.3-2.6 4.4-2.6 3.6 0 5.7 3.7 4.2 7.1C19.5 16.4 12 21 12 21z" fill={color} />
    </svg>
  )
}
