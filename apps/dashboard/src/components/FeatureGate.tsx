'use client'

/**
 * FeatureGate — route-level feature flag guard (#6513)
 *
 * Client-side gate that prevents access to pages when feature flags
 * or audience tier restrictions apply. Use at the top of page components
 * to provide defense-in-depth alongside sidebar filtering.
 *
 * Usage:
 *   const { user } = useAuth()
 *   const selectedWorkspace = useSelectedWorkspace()
 *   const userOrgs = user?.organizations ?? []
 *
 *   if (!isPageVisibleForUser('background-agents', userOrgs, selectedWorkspace)) {
 *     return <FeatureGate pageId="background-agents" />
 *   }
 */

import type { LucideIcon } from 'lucide-react'
import { Bot, CreditCard, Shield, Terminal, FlaskConical, BarChart3, FileText, ScrollText, Globe, Webhook, GitBranch, Lock, Wrench, Server, FileCheck, Search, Users, Rocket, BookOpen, Settings, Key, CloudLightning } from 'lucide-react'
import type { PageId } from '@gal/types'

interface FeatureGateProps {
  pageId: PageId
  title?: string
  message?: string
}

const PAGE_META: Partial<Record<PageId, { icon: LucideIcon; title: string; message: string }>> = {
  'background-agents': {
    icon: Terminal,
    title: 'Background Agents Unavailable',
    message: 'Background agents and sessions are not available for this workspace. Feature flags may restrict access, or your workspace tier does not include this feature.',
  },
  'billing': {
    icon: CreditCard,
    title: 'Billing Unavailable',
    message: 'Billing management is not available for this workspace. Contact your organization admin or check your plan.',
  },
  'workflow-testing': {
    icon: FlaskConical,
    title: 'Internal Feature',
    message: 'Workflow testing is only available to internal users.',
  },
  'token-spend': {
    icon: BarChart3,
    title: 'Internal Feature',
    message: 'Token spend analytics is only available to internal users.',
  },
  'governance-playground': {
    icon: FlaskConical,
    title: 'Internal Feature',
    message: 'The governance model playground is only available to internal users.',
  },
  'proposals': {
    icon: FileText,
    title: 'Proposals Unavailable',
    message: 'Config change proposals are not available for this workspace.',
  },
  'enforcement-overrides': {
    icon: Shield,
    title: 'Enforcement Overrides Unavailable',
    message: 'Enforcement overrides are only available to internal users.',
  },
  'enforcement-policies': {
    icon: Shield,
    title: 'Policies Unavailable',
    message: 'Policy management is only available to internal users.',
  },
  'enforcement-audit': {
    icon: ScrollText,
    title: 'Audit Log Unavailable',
    message: 'Audit logs are only available to internal users.',
  },
  'enforcement-domains': {
    icon: Globe,
    title: 'Domain Management Unavailable',
    message: 'Domain management is only available to internal users.',
  },
  'enforcement-hooks': {
    icon: Webhook,
    title: 'Hooks Unavailable',
    message: 'Webhook configuration is only available to internal users.',
  },
  'enforcement-sdlc': {
    icon: GitBranch,
    title: 'SDLC Enforcement Unavailable',
    message: 'SDLC enforcement is only available to internal users.',
  },
  'enforcement-security': {
    icon: Lock,
    title: 'Security Settings Unavailable',
    message: 'Security settings are only available to internal users.',
  },
  'enforcement-tools': {
    icon: Wrench,
    title: 'Tool Enforcement Unavailable',
    message: 'Tool enforcement is only available to internal users.',
  },
  'enforcement-system': {
    icon: Server,
    title: 'System Settings Unavailable',
    message: 'System settings are only available to internal users.',
  },
  'audit-logs': {
    icon: ScrollText,
    title: 'Audit Logs Unavailable',
    message: 'Audit logs are only available to internal users.',
  },
  'browser-profiles': {
    icon: Globe,
    title: 'Browser Profiles Unavailable',
    message: 'Browser profile management is only available to internal users.',
  },
  'domain-compliance': {
    icon: Globe,
    title: 'Domain Compliance Unavailable',
    message: 'Domain compliance is only available to internal users.',
  },
  'tool-compliance': {
    icon: Wrench,
    title: 'Tool Compliance Unavailable',
    message: 'Tool compliance is only available to internal users.',
  },
  swarm: {
    icon: CloudLightning,
    title: 'Swarm Unavailable',
    message: 'GPU burst capacity planning is only available to internal workspaces.',
  },
}

export function FeatureGate({ pageId, title, message }: FeatureGateProps) {
  const meta = PAGE_META[pageId]
  const Icon = meta?.icon ?? Bot
  const displayTitle = title ?? meta?.title ?? 'Feature Unavailable'
  const displayMessage = message ?? meta?.message ?? 'This feature is not available for your current workspace or account tier.'

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
      <Icon className="w-12 h-12 mb-4" style={{ color: 'var(--text-muted)' }} />
      <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
        {displayTitle}
      </h2>
      <p className="text-sm text-center max-w-md" style={{ color: 'var(--text-muted)' }}>
        {displayMessage}
      </p>
    </div>
  )
}
