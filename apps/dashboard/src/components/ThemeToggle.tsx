'use client'

import { Monitor, Sun, Moon } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import type { ReactNode } from 'react'

type ThemePreference = 'system' | 'light' | 'dark'

const options: { value: ThemePreference; icon: ReactNode; label: string }[] = [
  { value: 'system', icon: <Monitor className="w-3 h-3" strokeWidth={1.75} />, label: 'System' },
  { value: 'light', icon: <Sun className="w-3 h-3" strokeWidth={1.75} />, label: 'Light' },
  { value: 'dark', icon: <Moon className="w-3 h-3" strokeWidth={1.75} />, label: 'Dark' },
]

interface ThemeToggleProps {
  /** When true, render icon-only buttons (no text labels) for narrow viewports */
  compact?: boolean
}

export function ThemeToggle({ compact = false }: ThemeToggleProps) {
  const { preference, setPreference } = useTheme()

  const selectedIndex = options.findIndex((o) => o.value === preference)
  // Each button is 1/3 of the container width minus padding.
  // Container padding: 3px each side = 6px total.
  // Thumb translates by index * (100% / 3) within the inner area.
  const thumbTranslate = selectedIndex >= 0 ? `calc(${selectedIndex} * 100%)` : '0px'

  return (
    <div
      className="relative inline-flex items-center p-[3px]"
      style={{
        borderRadius: '10px',
        background: 'var(--surface-sunken)',
        border: '1px solid var(--border-subtle)',
      }}
      role="radiogroup"
      aria-label="Theme preference"
    >
      {/* Sliding thumb */}
      <span
        aria-hidden="true"
        className="absolute top-[3px] bottom-[3px] pointer-events-none"
        style={{
          width: 'calc((100% - 6px) / 3)',
          left: '3px',
          borderRadius: '6px',
          background: 'var(--surface-raised)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)',
          transform: `translateX(${thumbTranslate})`,
          transition: 'transform 220ms cubic-bezier(0.34,1.56,0.64,1)',
        }}
      />

      {options.map((opt) => {
        const active = preference === opt.value
        return (
          <button
            key={opt.value}
            role="radio"
            aria-checked={active}
            aria-label={`${opt.label} theme`}
            onClick={() => setPreference(opt.value)}
            className={`relative z-10 flex items-center justify-center cursor-pointer ${compact ? 'px-1.5 py-1' : 'gap-1 px-2 py-1'}`}
            style={{
              width: 'calc((100% - 6px) / 3)',
              fontSize: '11px',
              fontWeight: 500,
              color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
              transition: 'color 150ms ease',
              background: 'transparent',
              border: 'none',
              borderRadius: '6px',
              whiteSpace: 'nowrap',
            }}
          >
            {opt.icon}
            {!compact && <span>{opt.label}</span>}
          </button>
        )
      })}
    </div>
  )
}
