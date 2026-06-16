'use client'

/**
 * GAL-395: Copilot Configuration Editor
 * Allows admins to manage GitHub Copilot configuration files:
 * - copilot-instructions.md (main instructions)
 * - Path-specific instructions (.github/instructions/{name}.instructions.md)
 * - Agents (.github/agents/{name}.agent.md)
 * - Skills (.github/skills/{name}/SKILL.md)
 */

import { Plus, FileText, X, ChevronRight, AlertCircle } from 'lucide-react'
import { useState } from 'react'

// CSS variable styles for consistency with design system
const STYLES = {
  textPrimary: { color: 'var(--text-primary)' },
  textSecondary: { color: 'var(--text-secondary)' },
  textMuted: { color: 'var(--text-muted)' },
  accent: { color: 'var(--accent)' },
} as const

// T067: Content length validation constants
const VALIDATION = {
  AGENT_MAX_CONTENT: 30000,
  SKILL_NAME_MAX: 64,
  SKILL_DESCRIPTION_MAX: 1024,
} as const

interface CopilotInstructionsData {
  content: string
  sourceRepo?: string
  sourcePath?: string
  hash?: string
}

interface CopilotPathInstructionItem {
  name: string
  fileName?: string  // Derived: `${name}.instructions.md`
  content: string
  applyTo: string
  excludeAgent?: string
  sourceRepo?: string
  sourcePath?: string
  hash?: string
}

interface CopilotAgentItem {
  name: string
  fileName?: string  // Derived: `${name}.agent.md`
  description: string
  content: string
  tools?: string[] | '*'
  target?: 'vscode' | 'github-copilot'
  infer?: boolean
  sourceRepo?: string
  sourcePath?: string
  hash?: string
}

interface CopilotSkillItem {
  name: string
  dirName?: string  // Derived: same as name
  description: string
  content: string
  sourceRepo?: string
  sourcePath?: string
  hash?: string
}

interface CopilotConfigBundle {
  copilotInstructions?: CopilotInstructionsData | null
  copilotPathInstructions: CopilotPathInstructionItem[]
  copilotAgents: CopilotAgentItem[]
  copilotSkills: CopilotSkillItem[]
}

interface CopilotConfigEditorProps {
  bundle: CopilotConfigBundle
  isAdmin: boolean
  onBundleChange: (bundle: CopilotConfigBundle) => void
  orgName: string
}

type CopilotConfigTab = 'instructions' | 'pathInstructions' | 'agents' | 'skills'

export function CopilotConfigEditor({
  bundle,
  isAdmin,
  onBundleChange,
  orgName,
}: CopilotConfigEditorProps) {
  const [activeTab, setActiveTab] = useState<CopilotConfigTab>('instructions')
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const [showEditor, setShowEditor] = useState(false)
  const [editingType, setEditingType] = useState<CopilotConfigTab>('instructions')
  const [editingContent, setEditingContent] = useState('')
  const [editingName, setEditingName] = useState('')
  const [editingDescription, setEditingDescription] = useState('')
  const [editingApplyTo, setEditingApplyTo] = useState('')
  const [editingTools, setEditingTools] = useState<string>('')
  const [editingTarget, setEditingTarget] = useState<'vscode' | 'github-copilot'>('vscode')
  const [editingInfer, setEditingInfer] = useState(true)
  const [validationErrors, setValidationErrors] = useState<string[]>([])

  // T067: Validate content based on type
  const validateContent = (): string[] => {
    const errors: string[] = []

    if (editingType === 'agents') {
      if (editingContent.length > VALIDATION.AGENT_MAX_CONTENT) {
        errors.push(`Agent content exceeds maximum ${VALIDATION.AGENT_MAX_CONTENT} characters (current: ${editingContent.length})`)
      }
      if (!editingDescription.trim()) {
        errors.push('Agent description is required')
      }
      if (!editingName.trim()) {
        errors.push('Agent name is required')
      }
    }

    if (editingType === 'skills') {
      if (editingName.length > VALIDATION.SKILL_NAME_MAX) {
        errors.push(`Skill name exceeds maximum ${VALIDATION.SKILL_NAME_MAX} characters`)
      }
      if (!/^[a-z0-9-]+$/.test(editingName)) {
        errors.push('Skill name must contain only lowercase letters, numbers, and hyphens')
      }
      if (editingDescription.length > VALIDATION.SKILL_DESCRIPTION_MAX) {
        errors.push(`Skill description exceeds maximum ${VALIDATION.SKILL_DESCRIPTION_MAX} characters`)
      }
      if (!editingDescription.trim()) {
        errors.push('Skill description is required')
      }
    }

    if (editingType === 'pathInstructions') {
      if (!editingApplyTo.trim()) {
        errors.push('Path pattern (applyTo) is required')
      }
      if (!editingName.trim()) {
        errors.push('Instruction name is required')
      }
    }

    return errors
  }

  const handleAddConfig = (type: CopilotConfigTab) => {
    setEditingType(type)
    setValidationErrors([])

    if (type === 'instructions') {
      setEditingContent(`# ${orgName} Copilot Instructions

## Code Quality Standards
- Follow existing patterns in the codebase
- Write clear, maintainable code
- Include appropriate error handling

## Best Practices
- Keep functions small and focused
- Use meaningful names
- Document complex logic`)
    } else if (type === 'pathInstructions') {
      setEditingName('')
      setEditingApplyTo('**/*.ts')
      setEditingContent(`# TypeScript Guidelines

When working with TypeScript files:
- Use strict type checking
- Prefer interfaces over type aliases for objects
- Use const assertions where appropriate`)
    } else if (type === 'agents') {
      setEditingName('')
      setEditingDescription('')
      setEditingContent(`# Agent Instructions

This agent specializes in:
- Task 1
- Task 2

## Guidelines
- Follow best practices
- Be thorough and accurate`)
      setEditingTools('')
      setEditingTarget('vscode')
      setEditingInfer(true)
    } else if (type === 'skills') {
      setEditingName('')
      setEditingDescription('')
      setEditingContent(`# Skill Instructions

This skill provides:
- Capability 1
- Capability 2

## Usage
Invoke this skill when you need to...`)
    }

    setShowEditor(true)
  }

  const handleSaveEdit = async () => {
    const errors = validateContent()
    if (errors.length > 0) {
      setValidationErrors(errors)
      return
    }

    const hash = await generateHash(editingContent)
    const newBundle = { ...bundle }

    if (editingType === 'instructions') {
      newBundle.copilotInstructions = {
        content: editingContent,
        hash,
      }
    } else if (editingType === 'pathInstructions') {
      const fileName = editingName.endsWith('.instructions.md')
        ? editingName
        : `${editingName.replace(/\.md$/, '')}.instructions.md`
      newBundle.copilotPathInstructions = [
        ...newBundle.copilotPathInstructions,
        {
          name: editingName,
          fileName,
          content: editingContent,
          applyTo: editingApplyTo,
          hash,
        },
      ]
    } else if (editingType === 'agents') {
      const fileName = editingName.endsWith('.agent.md')
        ? editingName
        : `${editingName.replace(/\.md$/, '')}.agent.md`
      const tools = editingTools.trim() === '*'
        ? '*' as const
        : editingTools.split(',').map(t => t.trim()).filter(Boolean)
      newBundle.copilotAgents = [
        ...newBundle.copilotAgents,
        {
          name: editingName,
          fileName,
          description: editingDescription,
          content: editingContent,
          tools: tools.length > 0 ? tools : undefined,
          target: editingTarget,
          infer: editingInfer,
          hash,
        },
      ]
    } else if (editingType === 'skills') {
      const sanitizedName = editingName
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, VALIDATION.SKILL_NAME_MAX)
      newBundle.copilotSkills = [
        ...newBundle.copilotSkills,
        {
          name: sanitizedName,
          dirName: sanitizedName,
          description: editingDescription,
          content: editingContent,
          hash,
        },
      ]
    }

    onBundleChange(newBundle)
    setShowEditor(false)
    resetEditingState()
  }

  const resetEditingState = () => {
    setEditingContent('')
    setEditingName('')
    setEditingDescription('')
    setEditingApplyTo('')
    setEditingTools('')
    setEditingTarget('vscode')
    setEditingInfer(true)
    setValidationErrors([])
  }

  const handleRemoveItem = (type: CopilotConfigTab, index: number) => {
    const newBundle = { ...bundle }
    if (type === 'pathInstructions') {
      newBundle.copilotPathInstructions = newBundle.copilotPathInstructions.filter((_, i) => i !== index)
    } else if (type === 'agents') {
      newBundle.copilotAgents = newBundle.copilotAgents.filter((_, i) => i !== index)
    } else if (type === 'skills') {
      newBundle.copilotSkills = newBundle.copilotSkills.filter((_, i) => i !== index)
    }
    onBundleChange(newBundle)
  }

  const handleRemoveInstructions = () => {
    const newBundle = { ...bundle, copilotInstructions: null }
    onBundleChange(newBundle)
  }

  const toggleExpand = (key: string) => {
    const newExpanded = new Set(expandedItems)
    if (newExpanded.has(key)) {
      newExpanded.delete(key)
    } else {
      newExpanded.add(key)
    }
    setExpandedItems(newExpanded)
  }

  async function generateHash(content: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(content)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16)
  }

  const tabs: { key: CopilotConfigTab; label: string; count: number }[] = [
    { key: 'instructions', label: 'Instructions', count: bundle.copilotInstructions ? 1 : 0 },
    { key: 'pathInstructions', label: 'Path Instructions', count: bundle.copilotPathInstructions.length },
    { key: 'agents', label: 'Agents', count: bundle.copilotAgents.length },
    { key: 'skills', label: 'Skills', count: bundle.copilotSkills.length },
  ]

  return (
    <div>
      {/* Tab Navigation */}
      <div className="flex gap-2 mb-4 overflow-x-auto">
        {tabs.map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className="px-4 py-2 rounded-lg text-sm transition-all whitespace-nowrap"
            style={{
              backgroundColor: activeTab === key ? 'var(--accent-bg)' : 'var(--bg-tertiary)',
              color: activeTab === key ? 'var(--accent)' : 'var(--text-secondary)',
              border: `1px solid ${activeTab === key ? 'var(--accent)' : 'var(--border-subtle)'}`
            }}
          >
            {label} ({count})
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="min-h-[200px]">
        {/* T061: Instructions Tab */}
        {activeTab === 'instructions' && (
          bundle.copilotInstructions ? (
            <div>
              <pre
                className="text-sm rounded-lg p-4 max-h-64 overflow-auto whitespace-pre-wrap font-mono mb-3"
                style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}
              >
                {bundle.copilotInstructions.content}
              </pre>
              <div className="flex items-center justify-between">
                {bundle.copilotInstructions.sourceRepo && (
                  <p className="text-xs" style={STYLES.textMuted}>
                    From: {bundle.copilotInstructions.sourceRepo}/{bundle.copilotInstructions.sourcePath}
                  </p>
                )}
                {isAdmin && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setEditingType('instructions')
                        setEditingContent(bundle.copilotInstructions?.content || '')
                        setShowEditor(true)
                      }}
                      className="btn-secondary text-sm"
                    >
                      Edit
                    </button>
                    <button
                      onClick={handleRemoveInstructions}
                      className="text-[var(--status-danger-text)] hover:text-[var(--status-danger-text)] text-sm"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
              <p className="text-xs mt-2" style={STYLES.textMuted}>
                Writes to: .github/copilot-instructions.md
              </p>
            </div>
          ) : (
            <EmptyState
              type="instructions"
              description="Main Copilot instructions file"
              path=".github/copilot-instructions.md"
              isAdmin={isAdmin}
              onAdd={() => handleAddConfig('instructions')}
            />
          )
        )}

        {/* T062: Path Instructions Tab */}
        {activeTab === 'pathInstructions' && (
          bundle.copilotPathInstructions.length > 0 ? (
            <div className="space-y-2">
              {bundle.copilotPathInstructions.map((instruction, idx) => {
                const itemKey = `path-${idx}`
                const isExpanded = expandedItems.has(itemKey)
                return (
                  <div
                    key={idx}
                    className="rounded-lg overflow-hidden"
                    style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}
                  >
                    <div
                      className="p-3 flex items-start justify-between cursor-pointer hover:opacity-80"
                      onClick={() => toggleExpand(itemKey)}
                    >
                      <div className="flex-1 flex items-center gap-2">
                        <ChevronRight
                          className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                          style={STYLES.textMuted}
                        />
                        <div>
                          <p className="font-medium text-sm mb-1" style={STYLES.textPrimary}>{instruction.name}</p>
                          <p className="text-xs" style={STYLES.textMuted}>
                            Applies to: <code className="px-1 rounded" style={{ backgroundColor: 'var(--bg-secondary)' }}>{instruction.applyTo}</code>
                          </p>
                        </div>
                      </div>
                      {isAdmin && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRemoveItem('pathInstructions', idx) }}
                          className="text-[var(--status-danger-text)] hover:text-[var(--status-danger-text)]"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    {isExpanded && (
                      <div className="px-3 pb-3">
                        <pre
                          className="text-xs p-3 rounded overflow-x-auto max-h-64 overflow-y-auto"
                          style={{ backgroundColor: 'var(--bg-code)', color: 'var(--text-code)' }}
                        >
                          {instruction.content}
                        </pre>
                      </div>
                    )}
                  </div>
                )
              })}
              {isAdmin && (
                <button onClick={() => handleAddConfig('pathInstructions')} className="btn-secondary text-sm mt-4">
                  <Plus className="w-4 h-4 inline mr-2" />Add Path Instruction
                </button>
              )}
            </div>
          ) : (
            <EmptyState
              type="path instruction"
              description="Instructions that apply to specific file patterns"
              path=".github/instructions/*.instructions.md"
              isAdmin={isAdmin}
              onAdd={() => handleAddConfig('pathInstructions')}
            />
          )
        )}

        {/* T063: Agents Tab */}
        {activeTab === 'agents' && (
          bundle.copilotAgents.length > 0 ? (
            <div className="space-y-2">
              {bundle.copilotAgents.map((agent, idx) => {
                const itemKey = `agent-${idx}`
                const isExpanded = expandedItems.has(itemKey)
                return (
                  <div
                    key={idx}
                    className="rounded-lg overflow-hidden"
                    style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}
                  >
                    <div
                      className="p-3 flex items-start justify-between cursor-pointer hover:opacity-80"
                      onClick={() => toggleExpand(itemKey)}
                    >
                      <div className="flex-1 flex items-center gap-2">
                        <ChevronRight
                          className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                          style={STYLES.textMuted}
                        />
                        <div>
                          <p className="font-medium text-sm mb-1" style={STYLES.textPrimary}>{agent.name}</p>
                          <p className="text-xs" style={STYLES.textMuted}>{agent.description}</p>
                          <div className="flex gap-2 mt-1 flex-wrap">
                            {agent.target && (
                              <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--accent-bg)', color: 'var(--accent)' }}>
                                {agent.target}
                              </span>
                            )}
                            {agent.tools && (
                              <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>
                                {agent.tools === '*' ? 'All tools' : `${(agent.tools as string[]).length} tools`}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {isAdmin && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRemoveItem('agents', idx) }}
                          className="text-[var(--status-danger-text)] hover:text-[var(--status-danger-text)]"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    {isExpanded && (
                      <div className="px-3 pb-3">
                        <pre
                          className="text-xs p-3 rounded overflow-x-auto max-h-64 overflow-y-auto"
                          style={{ backgroundColor: 'var(--bg-code)', color: 'var(--text-code)' }}
                        >
                          {agent.content}
                        </pre>
                        <p className="text-xs mt-2" style={STYLES.textMuted}>
                          Content: {agent.content.length.toLocaleString()} / {VALIDATION.AGENT_MAX_CONTENT.toLocaleString()} chars
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}
              {isAdmin && (
                <button onClick={() => handleAddConfig('agents')} className="btn-secondary text-sm mt-4">
                  <Plus className="w-4 h-4 inline mr-2" />Add Agent
                </button>
              )}
            </div>
          ) : (
            <EmptyState
              type="agent"
              description="Custom Copilot agents with specialized capabilities"
              path=".github/agents/*.agent.md"
              isAdmin={isAdmin}
              onAdd={() => handleAddConfig('agents')}
            />
          )
        )}

        {/* T064: Skills Tab */}
        {activeTab === 'skills' && (
          bundle.copilotSkills.length > 0 ? (
            <div className="space-y-2">
              {bundle.copilotSkills.map((skill, idx) => {
                const itemKey = `skill-${idx}`
                const isExpanded = expandedItems.has(itemKey)
                return (
                  <div
                    key={idx}
                    className="rounded-lg overflow-hidden"
                    style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}
                  >
                    <div
                      className="p-3 flex items-start justify-between cursor-pointer hover:opacity-80"
                      onClick={() => toggleExpand(itemKey)}
                    >
                      <div className="flex-1 flex items-center gap-2">
                        <ChevronRight
                          className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                          style={STYLES.textMuted}
                        />
                        <div>
                          <p className="font-medium text-sm mb-1" style={STYLES.textPrimary}>{skill.name}</p>
                          <p className="text-xs" style={STYLES.textMuted}>{skill.description}</p>
                        </div>
                      </div>
                      {isAdmin && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRemoveItem('skills', idx) }}
                          className="text-[var(--status-danger-text)] hover:text-[var(--status-danger-text)]"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    {isExpanded && (
                      <div className="px-3 pb-3">
                        <pre
                          className="text-xs p-3 rounded overflow-x-auto max-h-64 overflow-y-auto"
                          style={{ backgroundColor: 'var(--bg-code)', color: 'var(--text-code)' }}
                        >
                          {skill.content}
                        </pre>
                        <p className="text-xs mt-2" style={STYLES.textMuted}>
                          Path: .github/skills/{skill.dirName}/SKILL.md
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}
              {isAdmin && (
                <button onClick={() => handleAddConfig('skills')} className="btn-secondary text-sm mt-4">
                  <Plus className="w-4 h-4 inline mr-2" />Add Skill
                </button>
              )}
            </div>
          ) : (
            <EmptyState
              type="skill"
              description="Reusable skills with folder-based structure"
              path=".github/skills/*/SKILL.md"
              isAdmin={isAdmin}
              onAdd={() => handleAddConfig('skills')}
            />
          )
        )}
      </div>

      {/* Editor Modal */}
      {showEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <div
            className="rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col"
            style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)' }}
          >
            <div className="p-6 pb-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <h3 className="text-xl font-semibold mb-2" style={STYLES.textPrimary}>
                Add {editingType === 'instructions' ? 'Copilot Instructions' :
                     editingType === 'pathInstructions' ? 'Path Instruction' :
                     editingType === 'agents' ? 'Copilot Agent' : 'Copilot Skill'}
              </h3>
              <p className="text-sm" style={STYLES.textSecondary}>
                This will be included in the workspace config bundle for GitHub Copilot
              </p>
            </div>

            <div className="p-6 flex-1 overflow-y-auto min-h-0">
              {/* Validation Errors */}
              {validationErrors.length > 0 && (
                <div className="mb-4 p-3 rounded-lg bg-[var(--status-danger-light)] border border-[var(--status-danger-text)]/30">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-[var(--status-danger-text)] mt-0.5 flex-shrink-0" />
                    <div>
                      {validationErrors.map((err, idx) => (
                        <p key={idx} className="text-sm text-[var(--status-danger-text)]">{err}</p>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Name field (for path instructions, agents, skills) */}
              {editingType !== 'instructions' && (
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-1" style={STYLES.textPrimary}>
                    Name {editingType === 'skills' && <span className="text-xs" style={STYLES.textMuted}>(lowercase, hyphens, max 64 chars)</span>}
                  </label>
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    placeholder={editingType === 'agents' ? 'code-reviewer' : editingType === 'skills' ? 'my-skill' : 'typescript'}
                    className="input-field w-full"
                  />
                </div>
              )}

              {/* Description field (for agents, skills) */}
              {(editingType === 'agents' || editingType === 'skills') && (
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-1" style={STYLES.textPrimary}>
                    Description {editingType === 'skills' && <span className="text-xs" style={STYLES.textMuted}>(max 1024 chars)</span>}
                  </label>
                  <input
                    type="text"
                    value={editingDescription}
                    onChange={(e) => setEditingDescription(e.target.value)}
                    placeholder={editingType === 'agents' ? 'Reviews code for quality and best practices' : 'What this skill does and when to use it'}
                    className="input-field w-full"
                  />
                  {editingType === 'skills' && (
                    <p className="text-xs mt-1" style={STYLES.textMuted}>
                      {editingDescription.length} / {VALIDATION.SKILL_DESCRIPTION_MAX} characters
                    </p>
                  )}
                </div>
              )}

              {/* ApplyTo field (for path instructions) */}
              {editingType === 'pathInstructions' && (
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-1" style={STYLES.textPrimary}>
                    Apply To <span className="text-xs" style={STYLES.textMuted}>(glob pattern)</span>
                  </label>
                  <input
                    type="text"
                    value={editingApplyTo}
                    onChange={(e) => setEditingApplyTo(e.target.value)}
                    placeholder="**/*.ts,**/*.tsx"
                    className="input-field w-full"
                  />
                  <p className="text-xs mt-1" style={STYLES.textMuted}>
                    Use glob patterns separated by commas (e.g., **/*.ts,**/*.tsx)
                  </p>
                </div>
              )}

              {/* Agent-specific fields */}
              {editingType === 'agents' && (
                <>
                  <div className="mb-4">
                    <label className="block text-sm font-medium mb-1" style={STYLES.textPrimary}>
                      Tools <span className="text-xs" style={STYLES.textMuted}>(comma-separated or * for all)</span>
                    </label>
                    <input
                      type="text"
                      value={editingTools}
                      onChange={(e) => setEditingTools(e.target.value)}
                      placeholder="read, editFiles, runTerminalCommand"
                      className="input-field w-full"
                    />
                  </div>
                  <div className="mb-4 flex gap-4">
                    <div className="flex-1">
                      <label className="block text-sm font-medium mb-1" style={STYLES.textPrimary}>Target</label>
                      <select
                        value={editingTarget}
                        onChange={(e) => setEditingTarget(e.target.value as 'vscode' | 'github-copilot')}
                        className="input-field w-full"
                      >
                        <option value="vscode">VS Code</option>
                        <option value="github-copilot">GitHub Copilot</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2 pt-6">
                      <input
                        type="checkbox"
                        id="infer"
                        checked={editingInfer}
                        onChange={(e) => setEditingInfer(e.target.checked)}
                        className="rounded"
                      />
                      <label htmlFor="infer" className="text-sm" style={STYLES.textPrimary}>
                        Enable inference
                      </label>
                    </div>
                  </div>
                </>
              )}

              {/* Content field */}
              <div>
                <label className="block text-sm font-medium mb-1" style={STYLES.textPrimary}>
                  Content {editingType === 'agents' && <span className="text-xs" style={STYLES.textMuted}>(max 30,000 chars)</span>}
                </label>
                <textarea
                  value={editingContent}
                  onChange={(e) => setEditingContent(e.target.value)}
                  className="input-field w-full h-64 resize-none font-mono"
                  placeholder="# Instructions..."
                />
                {editingType === 'agents' && (
                  <p className="text-xs mt-1" style={STYLES.textMuted}>
                    {editingContent.length.toLocaleString()} / {VALIDATION.AGENT_MAX_CONTENT.toLocaleString()} characters
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 p-6 pt-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <button
                onClick={() => { setShowEditor(false); resetEditingState() }}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="btn-primary"
                disabled={!editingContent.trim()}
              >
                Add to Bundle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Empty state component for consistency
function EmptyState({
  type,
  description,
  path,
  isAdmin,
  onAdd,
}: {
  type: string
  description: string
  path: string
  isAdmin: boolean
  onAdd: () => void
}) {
  return (
    <div className="text-center py-8">
      <FileText className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
      <p className="mb-2" style={{ color: 'var(--text-muted)' }}>No {type} configured</p>
      <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>{description}</p>
      <p className="text-xs mb-4 font-mono" style={{ color: 'var(--text-muted)' }}>Path: {path}</p>
      {isAdmin && (
        <button onClick={onAdd} className="btn-secondary text-sm">
          <Plus className="w-4 h-4 inline mr-2" />Add {type}
        </button>
      )}
    </div>
  )
}

export default CopilotConfigEditor
