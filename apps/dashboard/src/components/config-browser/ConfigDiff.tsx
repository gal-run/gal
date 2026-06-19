'use client'

import { type FC, useMemo } from 'react'
import { ConfigDiffFileSection } from './ConfigDiffFileSection'
import { ConfigDiffHeader } from './ConfigDiffHeader'
import type { ConfigInstance, DiffCompareMode } from './configDiffUtils'
import { computeDiffSummary } from './configDiffUtils'

interface ConfigDiffProps {
  instances: ConfigInstance[]
  leftIndex: number
  rightIndex: number
  compareMode: DiffCompareMode
  splitView: boolean
  showDiffOnly: boolean
  onChangeLeft: (index: number) => void
  onChangeRight: (index: number) => void
  onChangeCompareMode?: (mode: DiffCompareMode) => void
  onChangeSplitView?: (value: boolean) => void
  onChangeShowDiffOnly?: (value: boolean) => void
  onClose: () => void
  layout?: 'panel' | 'modal'
}

export const ConfigDiff: FC<ConfigDiffProps> = ({
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
  layout = 'panel',
}) => {
  const isModal = layout === 'modal'
  const leftInstance = instances[leftIndex]
  const rightInstance = instances[rightIndex]
  const summary = useMemo(
    () => computeDiffSummary(leftInstance.content, rightInstance.content),
    [leftInstance.content, rightInstance.content],
  )

  return (
    <div
      className={isModal ? 'flex h-full min-h-0 flex-col overflow-hidden' : 'h-full flex flex-col overflow-hidden'}
      style={{ backgroundColor: 'var(--bg-secondary)' }}
    >
      <ConfigDiffHeader
        instances={instances}
        leftIndex={leftIndex}
        rightIndex={rightIndex}
        leftInstance={leftInstance}
        rightInstance={rightInstance}
        summary={summary}
        compareMode={compareMode}
        onCompareModeChange={onChangeCompareMode}
        splitView={splitView}
        onSplitViewChange={onChangeSplitView}
        showDiffOnly={showDiffOnly}
        onShowDiffOnlyChange={onChangeShowDiffOnly}
        onChangeLeft={onChangeLeft}
        onChangeRight={onChangeRight}
        onClose={onClose}
        compact={isModal}
        sticky={isModal}
      />

      <div className={isModal ? 'flex-1 min-h-0 overflow-y-auto px-4 py-4 pb-6' : 'flex-1 min-h-0 overflow-y-auto p-4'}>
        <ConfigDiffFileSection
          sectionId="config-diff-single"
          leftInstance={leftInstance}
          rightInstance={rightInstance}
          summary={summary}
          splitView={splitView}
          showDiffOnly={showDiffOnly}
          showSectionHeader={false}
          collapsible={false}
          stickyOffset={isModal ? 'var(--config-diff-sticky-offset, 72px)' : 0}
        />
      </div>
    </div>
  )
}
