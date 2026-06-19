'use client'

import { type FC, useEffect, useRef, useState } from 'react'
import { ConfigDiff } from './ConfigDiff'
import { ConfigDiffMulti } from './ConfigDiffMulti'
import type { ConfigInstance, DiffCompareMode } from './configDiffUtils'

interface ConfigDiffModalProps {
  instances: ConfigInstance[]
  leftIndex: number
  rightIndex: number
  compareMode: DiffCompareMode
  splitView: boolean
  showDiffOnly: boolean
  onChangeLeft: (index: number) => void
  onChangeRight: (index: number) => void
  onChangeCompareMode: (mode: DiffCompareMode) => void
  onChangeSplitView: (value: boolean) => void
  onChangeShowDiffOnly: (value: boolean) => void
  onClose: () => void
}

export const ConfigDiffModal: FC<ConfigDiffModalProps> = ({
  instances,
  leftIndex,
  rightIndex,
  compareMode,
  splitView,
  showDiffOnly,
  onChangeLeft,
  onChangeRight,
  onChangeCompareMode,
  onChangeSplitView,
  onChangeShowDiffOnly,
  onClose,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [stickyOffset, setStickyOffset] = useState(72)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const header = container.querySelector<HTMLElement>('[data-config-diff-header]')
    if (!header) {
      return
    }

    const updateOffset = () => {
      setStickyOffset(header.getBoundingClientRect().height)
    }

    updateOffset()

    const observer = new ResizeObserver(updateOffset)
    observer.observe(header)

    return () => observer.disconnect()
  }, [compareMode, instances.length])

  return (
    <div className="fixed inset-0 z-50 lg:left-60" aria-modal="true" role="dialog">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative h-full p-2 md:p-4">
        <div
          ref={containerRef}
          className="flex h-full flex-col overflow-hidden rounded-2xl shadow-2xl"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-subtle)',
            ['--config-diff-sticky-offset' as any]: `${stickyOffset}px`,
          }}
        >
          {compareMode === 'all' ? (
            <ConfigDiffMulti
              instances={instances}
              leftIndex={leftIndex}
              rightIndex={rightIndex}
              compareMode={compareMode}
              splitView={splitView}
              showDiffOnly={showDiffOnly}
              onChangeLeft={onChangeLeft}
              onChangeRight={onChangeRight}
              onChangeCompareMode={onChangeCompareMode}
              onChangeSplitView={onChangeSplitView}
              onChangeShowDiffOnly={onChangeShowDiffOnly}
              onClose={onClose}
              layout="modal"
            />
          ) : (
            <ConfigDiff
              instances={instances}
              leftIndex={leftIndex}
              rightIndex={rightIndex}
              compareMode={compareMode}
              splitView={splitView}
              showDiffOnly={showDiffOnly}
              onChangeLeft={onChangeLeft}
              onChangeRight={onChangeRight}
              onChangeCompareMode={onChangeCompareMode}
              onChangeSplitView={onChangeSplitView}
              onChangeShowDiffOnly={onChangeShowDiffOnly}
              onClose={onClose}
              layout="modal"
            />
          )}
        </div>
      </div>
    </div>
  )
}
