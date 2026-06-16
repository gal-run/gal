'use client'

import { type FC, useState } from 'react'
import { AlertTriangle, FileX2, Loader2, MousePointer2 } from 'lucide-react'
import { ConfigViewerToolbar } from './ConfigViewerToolbar'
import { CodeViewer } from './CodeViewer'
import { MarkdownViewer } from './MarkdownViewer'
import { VersionTabs } from './VersionTabs'
import { EmptyState } from './EmptyState'
import { ConfigDiffModal } from './ConfigDiffModal'
import type { ConfigInstance, DiffCompareMode } from './configDiffUtils'
import { isPublishedInstance, type PublishedPolicyItem } from '@/lib/discoveryPolicy'

interface ConfigViewerProps {
  config: {
    name: string
    type: string
    platform?: string
    publishedItem: PublishedPolicyItem | null
    instances: ConfigInstance[]
  } | null
  isAdmin: boolean
  loading?: boolean
  selectedVersionIndex: number
  onSelectVersion: (index: number) => void
  onApprove?: (instance: ConfigInstance) => void
  onRemove?: () => void
  policyMutationPending?: boolean
  policyRemovalPending?: boolean
  diffMode?: boolean
  diffLeftIndex?: number
  diffRightIndex?: number
  diffCompareMode?: DiffCompareMode
  diffSplitView?: boolean
  diffShowDiffOnly?: boolean
  onDiffLeftChange?: (index: number) => void
  onDiffRightChange?: (index: number) => void
  onDiffCompareModeChange?: (mode: DiffCompareMode) => void
  onDiffSplitViewChange?: (value: boolean) => void
  onDiffShowDiffOnlyChange?: (value: boolean) => void
  onCloseDiff?: () => void
  onOpenDiff?: () => void
  naturalScroll?: boolean
  contentFetchError?: string | null
}

export const ConfigViewer: FC<ConfigViewerProps> = ({
  config,
  isAdmin,
  loading,
  selectedVersionIndex,
  onSelectVersion,
  onApprove,
  onRemove,
  policyMutationPending = false,
  policyRemovalPending = false,
  diffMode,
  diffLeftIndex = 0,
  diffRightIndex = 1,
  diffCompareMode = 'single',
  diffSplitView = true,
  diffShowDiffOnly = true,
  onDiffLeftChange,
  onDiffRightChange,
  onDiffCompareModeChange,
  onDiffSplitViewChange,
  onDiffShowDiffOnlyChange,
  onCloseDiff,
  onOpenDiff,
  naturalScroll = false,
  contentFetchError,
}) => {
  const configKey = config ? `${config.type}:${config.name}` : ''
  const [markdownState, setMarkdownState] = useState<{
    key: string
    mode: 'source' | 'rendered'
  }>({ key: '', mode: 'source' })

  const markdownViewMode: 'source' | 'rendered' =
    markdownState.key === configKey ? markdownState.mode : 'source'

  const handleViewModeChange = (mode: 'source' | 'rendered') => {
    setMarkdownState({ key: configKey, mode })
  }

  if (!config) {
    return (
      <div className="h-full flex items-center justify-center">
        <EmptyState
          icon={MousePointer2}
          message="Select a config from the list to view its content"
        />
      </div>
    )
  }

  const selectedInstance = config.instances[selectedVersionIndex]
  const isMarkdown = selectedInstance.path.endsWith('.md')
  const exactPublished = isPublishedInstance(config.publishedItem, selectedInstance)
  const statusLabel = config.publishedItem
    ? exactPublished
      ? 'Published to org policy'
      : 'Another published variant exists'
    : 'Not yet published'
  const primaryActionLabel = config.publishedItem
    ? exactPublished
      ? undefined
      : 'Replace Published Policy'
    : 'Publish to Org Policy'
  const secondaryActionLabel = config.publishedItem ? 'Remove from Org Policy' : undefined

  const getLanguage = (path: string) => {
    if (path.endsWith('.md')) return 'markdown'
    if (path.endsWith('.json')) return 'json'
    if (path.endsWith('.toml')) return 'toml'
    if (path.endsWith('.yaml') || path.endsWith('.yml')) return 'yaml'
    if (path.endsWith('.sh')) return 'bash'
    return 'text'
  }

  const language = getLanguage(selectedInstance.path)

  return (
    <div
      className={`flex flex-col ${naturalScroll ? 'min-h-[32rem] overflow-visible' : 'h-full overflow-hidden'}`}
      style={{ backgroundColor: 'var(--bg-secondary)' }}
    >
      <div className="flex-shrink-0">
        <ConfigViewerToolbar
          configName={config.name}
          configType={config.type}
          platform={config.platform}
          repo={selectedInstance.repo}
          path={selectedInstance.path}
          lastModified={selectedInstance.lastModified}
          content={selectedInstance.content}
          isMarkdown={isMarkdown}
          viewMode={markdownViewMode}
          onViewModeChange={handleViewModeChange}
          isAdmin={isAdmin}
          policyStatusLabel={statusLabel}
          policyStatusTone={config.publishedItem ? (exactPublished ? 'success' : 'warning') : 'neutral'}
          primaryActionLabel={primaryActionLabel}
          onPrimaryAction={primaryActionLabel && onApprove ? () => onApprove(selectedInstance) : undefined}
          secondaryActionLabel={secondaryActionLabel}
          onSecondaryAction={secondaryActionLabel && onRemove ? () => onRemove() : undefined}
          primaryActionPending={policyMutationPending}
          secondaryActionPending={policyRemovalPending}
        />
      </div>

      <div className={`flex-1 p-4 min-h-0 ${naturalScroll ? 'overflow-visible' : 'overflow-auto'}`}>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent)' }} />
          </div>
        ) : selectedInstance.content ? (
          isMarkdown && markdownViewMode === 'rendered' ? (
            <MarkdownViewer content={selectedInstance.content} />
          ) : (
            <CodeViewer
              content={selectedInstance.content}
              // Source view: Prism's markdown grammar recursively tokenizes
              // nested fenced code blocks, and those tokens render as chip
              // badges that overlap lines. Pass plain text so the Source
              // tab shows raw bytes (see Scheduler-Systems/gal-run#368).
              language={isMarkdown ? 'text' : language}
              showLineNumbers={true}
            />
          )
        ) : contentFetchError ? (
          <div className="flex items-start gap-3 p-4 rounded-lg" style={{ backgroundColor: 'var(--status-warning-light)', border: '1px solid var(--status-warning)' }}>
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--status-warning-text)' }} />
            <p className="text-sm" style={{ color: 'var(--status-warning-text)' }}>{contentFetchError}</p>
          </div>
        ) : (
          <EmptyState icon={FileX2} message="No content available for this config" />
        )}
      </div>

      {config.instances.length > 1 && !diffMode && (
        <div className="flex-shrink-0">
          <VersionTabs
            instances={config.instances}
            publishedItem={config.publishedItem}
            selectedIndex={selectedVersionIndex}
            onSelectVersion={onSelectVersion}
            onCompare={onOpenDiff}
          />
        </div>
      )}

      {diffMode &&
        onDiffLeftChange &&
        onDiffRightChange &&
        onDiffCompareModeChange &&
        onDiffSplitViewChange &&
        onDiffShowDiffOnlyChange &&
        onCloseDiff && (
          <ConfigDiffModal
            instances={config.instances}
            leftIndex={diffLeftIndex}
            rightIndex={diffRightIndex}
            compareMode={diffCompareMode}
            splitView={diffSplitView}
            showDiffOnly={diffShowDiffOnly}
            onChangeLeft={onDiffLeftChange}
            onChangeRight={onDiffRightChange}
            onChangeCompareMode={onDiffCompareModeChange}
            onChangeSplitView={onDiffSplitViewChange}
            onChangeShowDiffOnly={onDiffShowDiffOnlyChange}
            onClose={onCloseDiff}
          />
        )}
    </div>
  )
}
