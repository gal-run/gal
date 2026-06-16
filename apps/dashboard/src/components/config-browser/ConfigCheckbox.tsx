"use client"
import React from 'react'

interface ConfigCheckboxProps {
  checked: boolean
  indeterminate?: boolean
  onChange: (e: React.MouseEvent) => void
  className?: string
}

export function ConfigCheckbox({ checked, indeterminate = false, onChange, className = '' }: ConfigCheckboxProps) {
  return (
    <div
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      onClick={onChange}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault()
          onChange(e as unknown as React.MouseEvent)
        }
      }}
      className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border transition-all duration-150 cursor-pointer ${
        checked || indeterminate
          ? 'bg-[var(--accent)] border-[var(--accent)]'
          : 'bg-transparent border-[var(--border-default)] hover:border-[var(--accent)]'
      } ${className}`}
    >
      {checked && !indeterminate && (
        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
          <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
      {indeterminate && (
        <div className="w-2 h-0.5 bg-white rounded-full" />
      )}
    </div>
  )
}
