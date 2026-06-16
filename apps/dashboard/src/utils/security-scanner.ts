/**
 * Security Scanner Utility
 *
 * Scans config content for potentially dangerous patterns.
 * Used by BulkApproveDialog to flag risky configs before approval.
 *
 * Migrated from apps/dashboard/src/utils/security-scanner.ts
 */

export interface SecurityFlag {
  groupKey: string
  groupName: string
  groupType: string
  severity: 'warning' | 'danger'
  reason: string
  matchedPattern: string
}

interface ScanInput {
  key: string
  name: string
  type: string
  content: string
}

interface PatternDef {
  pattern: RegExp
  severity: 'warning' | 'danger'
  reason: string
  label: string
}

const PATTERNS: PatternDef[] = [
  // Danger patterns
  { pattern: /eval\s*\(/, severity: 'danger', reason: 'Arbitrary code execution via eval()', label: 'eval(' },
  { pattern: /rm\s+-rf\s+\//, severity: 'danger', reason: 'Destructive filesystem deletion', label: 'rm -rf /' },
  { pattern: /chmod\s+777/, severity: 'danger', reason: 'World-writable file permissions', label: 'chmod 777' },
  { pattern: /"dangerouslySkipPermissions"\s*:\s*true/, severity: 'danger', reason: 'Disables permission safety checks', label: '"dangerouslySkipPermissions": true' },
  { pattern: /sudo\s+/, severity: 'danger', reason: 'Elevated privilege execution', label: 'sudo ' },

  // Warning patterns
  { pattern: /"allowedTools"\s*:\s*\[\s*"\*"\s*\]/, severity: 'warning', reason: 'Overly permissive tool access', label: '"allowedTools": ["*"]' },
  { pattern: /sh\s+-c\s/, severity: 'warning', reason: 'Shell command execution', label: 'sh -c' },
  { pattern: /child_process/, severity: 'warning', reason: 'Spawns child processes', label: 'child_process' },
  { pattern: /subprocess/, severity: 'warning', reason: 'Spawns subprocesses', label: 'subprocess' },
  { pattern: /API_KEY|SECRET|TOKEN|PASSWORD/i, severity: 'warning', reason: 'May reference secrets or credentials', label: 'secret reference' },
  { pattern: /curl\s+/, severity: 'warning', reason: 'External network request via curl', label: 'curl ' },
  { pattern: /wget\s+/, severity: 'warning', reason: 'External network request via wget', label: 'wget ' },
]

export function scanForSecurityIssues(groups: ScanInput[]): SecurityFlag[] {
  const flags: SecurityFlag[] = []

  for (const group of groups) {
    if (!group.content) continue

    for (const def of PATTERNS) {
      if (def.pattern.test(group.content)) {
        flags.push({
          groupKey: group.key,
          groupName: group.name,
          groupType: group.type,
          severity: def.severity,
          reason: def.reason,
          matchedPattern: def.label,
        })
      }
    }
  }

  // Sort: danger first, then warnings
  flags.sort((a, b) => {
    if (a.severity === b.severity) return 0
    return a.severity === 'danger' ? -1 : 1
  })

  return flags
}
