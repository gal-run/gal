import React from 'react'
import type { ReactNode } from 'react'
import { FileText } from 'lucide-react'

export function getWorkspacePolicyBundleCopy(workspaceName: string | null) {
  if (workspaceName) {
    return {
      summary: `You are viewing the approved base policy bundle for ${workspaceName}.`,
      detail:
        "Manage publication in Discovery. Use the workspace switcher to review another org's bundle. Repository-specific overrides remain part of enforcement flows, not the main Approved Config page.",
    }
  }

  return {
    summary: 'Approved Config is scoped to each org and workspace.',
    detail:
      "Select a workspace to review that org's approved base policy bundle. Manage publication in Discovery. Repository-specific overrides remain part of enforcement flows, not the main Approved Config page.",
  }
}

interface WorkspacePolicyBundlesPanelProps {
  workspaceName: string | null
  badge?: ReactNode
}

export function WorkspacePolicyBundlesPanel({ workspaceName, badge }: WorkspacePolicyBundlesPanelProps) {
  const copy = getWorkspacePolicyBundleCopy(workspaceName)

  return (
    <div className="dashboard-card p-6 mb-6">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          Workspace Policy Bundles
        </h2>
        {badge}
      </div>
      <div className="text-center py-8">
        <FileText className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
        <p className="mb-2" style={{ color: 'var(--text-muted)' }}>
          {copy.summary}
        </p>
        <p className="text-sm max-w-md mx-auto" style={{ color: 'var(--text-muted)' }}>
          {copy.detail}
        </p>
      </div>
    </div>
  )
}
