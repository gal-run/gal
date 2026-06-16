'use client'

import { type FC, useEffect, useMemo, useState } from 'react'
import { ConfigDiffFileSection } from './ConfigDiffFileSection'
import { ConfigDiffHeader } from './ConfigDiffHeader'
import { ConfigDiffToc } from './ConfigDiffToc'
import type { ConfigInstance, DiffCompareMode, DiffSummary } from './configDiffUtils'
import { computeDiffSummary } from './configDiffUtils'

interface ConfigDiffMultiProps {
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
  layout?: 'panel' | 'modal'
}

function buildAggregateSummary(sections: { summary: DiffSummary }[]): DiffSummary {
  const added = sections.reduce((total, section) => total + section.summary.added, 0)
  const removed = sections.reduce((total, section) => total + section.summary.removed, 0)

  return {
    added,
    removed,
    identical: sections.every((section) => section.summary.identical),
  }
}

export const ConfigDiffMulti: FC<ConfigDiffMultiProps> = ({
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
  const sections = useMemo(
    () =>
      instances
        .map((instance, index) => ({ instance, index }))
        .filter(({ index }) => index !== leftIndex)
        .map(({ instance, index }) => ({
          id: `compare-section-${index}`,
          rightInstance: instance,
          summary: computeDiffSummary(leftInstance.content, instance.content),
        })),
    [instances, leftIndex, leftInstance.content],
  )
  const [tocOpen, setTocOpen] = useState(false)
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(sections.map((section) => [section.id, section.summary.identical])),
  )
  const aggregateSummary = useMemo(() => buildAggregateSummary(sections), [sections])

  useEffect(() => {
    setCollapsedSections((current) =>
      Object.fromEntries(
        sections.map((section) => [section.id, current[section.id] ?? section.summary.identical]),
      ),
    )
  }, [sections])

  const tocItems = useMemo(
    () =>
      sections.map((section) => ({
        id: section.id,
        label: section.rightInstance.repo,
        caption: section.rightInstance.path,
        summary: section.summary,
      })),
    [sections],
  )

  const toggleCollapsed = (id: string) => {
    setCollapsedSections((current) => ({
      ...current,
      [id]: !current[id],
    }))
  }

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id)
    if (!element) {
      return
    }

    element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setTocOpen(false)
  }

  return (
    <div
      className={isModal ? 'relative flex h-full min-h-0 flex-col overflow-hidden' : 'h-full flex flex-col overflow-hidden'}
      style={{ backgroundColor: 'var(--bg-secondary)' }}
    >
      <ConfigDiffHeader
        instances={instances}
        leftIndex={leftIndex}
        rightIndex={rightIndex}
        leftInstance={leftInstance}
        rightInstance={rightInstance}
        summary={aggregateSummary}
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

      <div className={isModal ? 'relative flex-1 min-h-0' : 'relative flex-1 min-h-0'}>
        <ConfigDiffToc
          items={tocItems}
          open={tocOpen}
          onToggle={() => setTocOpen((open) => !open)}
          onSelect={scrollToSection}
        />

        <div className={isModal ? 'h-full overflow-y-auto p-4 pb-6' : 'h-full overflow-y-auto p-4'}>
          <div className="space-y-4">
            {sections.map((section) => (
              <ConfigDiffFileSection
                key={section.id}
                sectionId={section.id}
                leftInstance={leftInstance}
                rightInstance={section.rightInstance}
                summary={section.summary}
                splitView={splitView}
                showDiffOnly={showDiffOnly}
                collapsed={collapsedSections[section.id]}
                onToggleCollapsed={() => toggleCollapsed(section.id)}
                stickyOffset={isModal ? 'var(--config-diff-sticky-offset, 72px)' : 0}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
