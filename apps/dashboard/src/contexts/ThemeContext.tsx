'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { ReactNode } from 'react'

type ColorMode = 'light' | 'dark'
type ThemePreference = 'system' | 'light' | 'dark'

interface ThemeContextType {
  /** Resolved color mode (always 'light' or 'dark') */
  theme: ColorMode
  /** User preference — 'system' follows OS, 'light'/'dark' are manual overrides */
  preference: ThemePreference
  setPreference: (pref: ThemePreference) => void
  toggleTheme: () => void
  setTheme: (theme: ColorMode) => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

const COLOR_STORAGE_KEY = 'gal-theme'

function resolveSystemTheme(): ColorMode {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyThemeClass(resolved: ColorMode) {
  const root = document.documentElement
  root.classList.remove('light', 'dark')
  root.classList.add(resolved)
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // SSR-safe defaults — 'dark' for resolved, 'system' for preference
  const [preference, setPreferenceState] = useState<ThemePreference>('system')
  const [resolved, setResolved] = useState<ColorMode>('dark')

  // Derive the resolved theme from the current preference
  const resolve = useCallback((pref: ThemePreference): ColorMode => {
    if (pref === 'system') return resolveSystemTheme()
    return pref
  }, [])

  // Two-pass render: read localStorage only after mount (client-side)
  useEffect(() => {
    const stored = localStorage.getItem(COLOR_STORAGE_KEY)
    let pref: ThemePreference = 'system'
    if (stored === 'light' || stored === 'dark') {
      pref = stored
    }
    // 'system' is the default when nothing is stored or stored value is 'system'
    if (stored === 'system') {
      pref = 'system'
    }
    setPreferenceState(pref)
    const r = resolve(pref)
    setResolved(r)
    applyThemeClass(r)
  }, [resolve])

  // Persist preference to localStorage
  useEffect(() => {
    localStorage.setItem(COLOR_STORAGE_KEY, preference)
  }, [preference])

  // Apply color mode class when resolved changes
  useEffect(() => {
    applyThemeClass(resolved)
  }, [resolved])

  // Listen for OS theme changes when preference is 'system'
  useEffect(() => {
    if (preference !== 'system') return

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => {
      const newResolved = e.matches ? 'dark' : 'light'
      setResolved(newResolved)
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [preference])

  const setPreference = (pref: ThemePreference) => {
    setPreferenceState(pref)
    const r = resolve(pref)
    setResolved(r)
  }

  const toggleTheme = () => {
    // Toggle cycles: system -> light -> dark -> system
    const next: ThemePreference =
      preference === 'system' ? 'light' : preference === 'light' ? 'dark' : 'system'
    setPreference(next)
  }

  const setTheme = (newTheme: ColorMode) => {
    setPreference(newTheme)
  }

  return (
    <ThemeContext.Provider value={{ theme: resolved, preference, setPreference, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
