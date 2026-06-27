'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { SendHorizontal, Trash2, AlertCircle, ChevronDown, ChevronUp, Settings2, Sparkles } from 'lucide-react'
import { FeatureGate } from '@/components/FeatureGate'
import { useAuth } from '@/contexts/AuthContext'
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext'
import { useSelectedWorkspace } from '@/hooks/useSelectedWorkspace'
import { api } from '@/lib/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

type PlaygroundModel = 'governance' | 'gal-code'

interface AssistantMeta {
  latencyMs: number
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

interface DisplayMessage {
  role: 'user' | 'assistant'
  content: string
  meta?: AssistantMeta
}

const MODEL_OPTIONS: Record<
  PlaygroundModel,
  {
    label: string
    badge: string
    description: string
    placeholder: string
    emptyState: string
    footer: string
  }
> = {
  governance: {
    label: 'Governance',
    badge: 'phi-4',
    description: 'Governance model · Read-only · Non-agentic',
    placeholder: 'Ask GAL about policy, compliance, or governance decisions...',
    emptyState:
      "I’m the Governance Agentic Layer — ask me about policies, agent behaviour, or compliance decisions for your organization.",
    footer: 'Enter to send · Shift+Enter for new line · Read-only, non-agentic',
  },
  'gal-code': {
    label: 'GAL Code',
    badge: 'GLM-4.7',
    description: 'Background-agent executor lane · Internal experiments',
    placeholder: 'Probe the GAL Code lane directly...',
    emptyState:
      'You are talking directly to the GAL Code lane for internal experiments and smoke checks.',
    footer: 'Enter to send · Shift+Enter for new line · Internal GAL Code lane',
  },
}

// ---------------------------------------------------------------------------
// GAL Avatar
// ---------------------------------------------------------------------------

function GalAvatar({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const dim =
    size === 'lg'
      ? 'h-14 w-14 text-lg'
      : size === 'sm'
        ? 'h-6 w-6 text-[10px]'
        : 'h-8 w-8 text-xs'
  return (
    <div
      className={`${dim} flex flex-shrink-0 items-center justify-center rounded-full font-bold text-white shadow-sm`}
      style={{
        background:
          'linear-gradient(135deg, var(--interactive-primary), color-mix(in srgb, var(--interactive-primary) 55%, #7c3aed))',
      }}
    >
      G
    </div>
  )
}

// ---------------------------------------------------------------------------
// Typing dots animation
// ---------------------------------------------------------------------------

function TypingDots() {
  return (
    <div className="flex items-start gap-3">
      <GalAvatar />
      <div
        className="rounded-3xl px-5 py-4"
        style={{
          backgroundColor: 'var(--surface-raised)',
          border: '1px solid var(--border-subtle)',
          borderBottomLeftRadius: '4px',
        }}
      >
        <style>{`@keyframes gal-dot{0%,80%,100%{transform:translateY(0);opacity:.4}40%{transform:translateY(-5px);opacity:1}}`}</style>
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-2 w-2 rounded-full"
              style={{
                backgroundColor: 'var(--text-muted)',
                display: 'inline-block',
                animation: 'gal-dot 1.2s ease-in-out infinite',
                animationDelay: `${i * 0.18}s`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GovernancePlaygroundPage() {
  const { user } = useAuth()
  const { isPageVisibleForUser } = useFeatureFlags()
  const selectedWorkspace = useSelectedWorkspace()
  const orgName = selectedWorkspace ?? user?.organizations?.[0] ?? null
  const userOrgs = user?.organizations ?? []

  const [messages, setMessages] = useState<DisplayMessage[]>([])
  const [input, setInput] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [showSystemPrompt, setShowSystemPrompt] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notConfigured, setNotConfigured] = useState(false)
  const [selectedModel, setSelectedModel] = useState<PlaygroundModel>('governance')

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSend = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed || loading || !orgName) return

    setError(null)
    setNotConfigured(false)

    const userMsg: DisplayMessage = { role: 'user', content: trimmed }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setLoading(true)

    const apiMessages: ChatMessage[] = []
    if (systemPrompt.trim()) {
      apiMessages.push({ role: 'system', content: systemPrompt.trim() })
    }
    for (const m of [...messages, userMsg]) {
      apiMessages.push({ role: m.role, content: m.content })
    }

    try {
      const response = await api.fetchWithAuth(
        `${api.baseUrl}/api/governance/model/chat?org=${encodeURIComponent(orgName)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: apiMessages,
            model: selectedModel,
            temperature: 0,
          }),
        },
      )

      const data = await response.json()

      if (!response.ok) {
        if (data.code === 'MODEL_NOT_CONFIGURED') {
          setNotConfigured(true)
        } else {
          setError(data.error || `Request failed (${response.status})`)
        }
        setLoading(false)
        return
      }

      const assistantMsg: DisplayMessage = {
        role: 'assistant',
        content: data.content,
        meta: {
          latencyMs: data.latencyMs,
          usage: data.usage,
        },
      }
      setMessages((prev) => [...prev, assistantMsg])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setLoading(false)
    }
  }, [input, loading, messages, orgName, selectedModel, systemPrompt])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleClear = () => {
    setMessages([])
    setError(null)
    setNotConfigured(false)
    inputRef.current?.focus()
  }

  const modelUi = MODEL_OPTIONS[selectedModel]

  // ---------------------------------------------------------------------------
  // Route guard (#5113): the governance playground is internal-only — it POSTs
  // to the model/gal-code lanes. Block non-internal/non-EE (customer-tier)
  // users with the same audience-aware FeatureGate the agents/enforcement pages
  // use, instead of leaving the page ungated.
  // ---------------------------------------------------------------------------
  if (!isPageVisibleForUser('governance-playground', userOrgs, selectedWorkspace)) {
    return <FeatureGate pageId="governance-playground" />
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-4rem)]">
      {/* Header */}
      <div
        className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 py-4 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <GalAvatar size="lg" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-[var(--text-primary)] truncate">Ask GAL</h1>
              <span
                className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium"
                style={{
                  background: 'color-mix(in srgb, var(--interactive-primary) 12%, transparent)',
                  color: 'var(--interactive-primary)',
                  border: '1px solid color-mix(in srgb, var(--interactive-primary) 25%, transparent)',
                }}
              >
                <Sparkles className="w-3 h-3" />
                {modelUi.badge}
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              {modelUi.description}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div
            className="flex items-center gap-1 p-1 rounded-xl"
            style={{
              background: 'var(--surface-sunken)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            {(['governance', 'gal-code'] as PlaygroundModel[]).map((model) => {
              const option = MODEL_OPTIONS[model]
              const active = model === selectedModel
              return (
                <button
                  key={model}
                  onClick={() => setSelectedModel(model)}
                  disabled={loading}
                  className="px-3 py-1.5 text-sm rounded-lg transition-colors disabled:opacity-50"
                  style={{
                    background: active ? 'var(--interactive-primary)' : 'transparent',
                    color: active ? 'var(--text-on-accent)' : 'var(--text-secondary)',
                  }}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
          <button
            onClick={() => setShowSystemPrompt((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors"
            style={{
              background: showSystemPrompt ? 'var(--interactive-primary)' : 'var(--surface-raised)',
              color: showSystemPrompt ? 'var(--text-on-accent)' : 'var(--text-secondary)',
              border: showSystemPrompt ? 'none' : '1px solid var(--border-subtle)',
            }}
          >
            <Settings2 className="w-3.5 h-3.5" />
            System Prompt
            {showSystemPrompt ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            onClick={handleClear}
            disabled={messages.length === 0 && !error}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors disabled:opacity-40"
            style={{
              background: 'var(--surface-raised)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </button>
        </div>
      </div>

      {/* System prompt panel */}
      {showSystemPrompt && (
        <div
          className="px-6 py-3 flex-shrink-0"
          style={{
            background: 'var(--surface-sunken)',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
            System Prompt
          </label>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="Optional: Set a system prompt for the governance model..."
            rows={3}
            className="w-full px-3 py-2 text-sm rounded-lg resize-y"
            style={{
              background: 'var(--surface-base)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-subtle)',
            }}
          />
        </div>
      )}

      {/* Not configured banner */}
      {notConfigured && (
        <div
          className="mx-6 mt-4 px-4 py-3 rounded-lg flex items-start gap-3 flex-shrink-0"
          style={{
            background: 'var(--status-warning-bg)',
            border: '1px solid var(--status-warning)',
          }}
        >
          <AlertCircle
            className="w-5 h-5 flex-shrink-0 mt-0.5"
            style={{ color: 'var(--status-warning)' }}
          />
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {selectedModel === 'gal-code'
                  ? 'GAL Code endpoint not configured'
                  : 'Governance model endpoint not configured'}
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
              Set{' '}
              <code
                className="px-1 py-0.5 rounded text-xs"
                style={{ background: 'var(--surface-raised)' }}
              >
                {selectedModel === 'gal-code'
                  ? 'GAL_AGENT_INFERENCE_ENDPOINT'
                  : 'GOVERNANCE_MODEL_ENDPOINT'}
              </code>{' '}
              in Cloud Run to enable this playground lane.
            </p>
          </div>
        </div>
      )}

      {/* Chat messages area */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
        {/* Empty state */}
        {messages.length === 0 && !loading && !error && !notConfigured && (
          <div className="flex flex-col items-center justify-center h-full text-center py-20 gap-4">
            <GalAvatar size="lg" />
            <div>
              <p className="text-base font-semibold text-[var(--text-primary)]">
                Hi, I&apos;m GAL
              </p>
              <p className="text-sm mt-1.5 max-w-xs" style={{ color: 'var(--text-secondary)' }}>
                {modelUi.emptyState}
              </p>
            </div>
          </div>
        )}

        {/* Messages */}
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' && <GalAvatar />}

            <div className={`max-w-[80%] ${msg.role === 'user' ? 'order-first' : ''}`}>
              {msg.role === 'assistant' && (
                <p
                  className="text-[11px] font-semibold mb-1 px-1"
                  style={{ color: 'var(--interactive-primary)' }}
                >
                  GAL
                </p>
              )}
              <div
                className="px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap"
                style={
                  msg.role === 'user'
                    ? {
                        background: 'var(--interactive-primary)',
                        color: 'var(--text-on-accent)',
                        borderRadius: '18px',
                        borderBottomRightRadius: '4px',
                      }
                    : {
                        background: 'var(--surface-raised)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '18px',
                        borderBottomLeftRadius: '4px',
                      }
                }
              >
                {msg.content}
              </div>
              {msg.meta && (
                <div
                  className="mt-1 px-1 flex items-center gap-3 text-[11px]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <span>{msg.meta.latencyMs.toLocaleString()}ms</span>
                  <span title="Prompt / Completion / Total tokens">
                    {msg.meta.usage.prompt_tokens} / {msg.meta.usage.completion_tokens} /{' '}
                    {msg.meta.usage.total_tokens} tokens
                  </span>
                </div>
              )}
            </div>

            {msg.role === 'user' && (
              <div
                className="h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-semibold"
                style={{
                  background: 'var(--surface-raised)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                Y
              </div>
            )}
          </div>
        ))}

        {/* Typing animation */}
        {loading && <TypingDots />}

        {/* Inline error */}
        {error && (
          <div
            className="flex items-start gap-2 px-4 py-3 rounded-lg text-sm"
            style={{
              background: 'var(--status-error-bg)',
              color: 'var(--status-error)',
              border: '1px solid var(--status-error)',
            }}
          >
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div
        className="px-6 py-4 flex-shrink-0"
        style={{
          borderTop: '1px solid var(--border-subtle)',
          background: 'var(--surface-base)',
        }}
      >
        <div
          className="flex items-end gap-2 rounded-2xl px-4 py-2"
          style={{
            background: 'var(--surface-raised)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={orgName ? modelUi.placeholder : 'Select a workspace first'}
            disabled={loading || !orgName}
            rows={1}
            className="flex-1 bg-transparent text-sm resize-none outline-none py-1.5 disabled:opacity-50"
            style={{
              color: 'var(--text-primary)',
              maxHeight: '120px',
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading || !orgName}
            className="p-2 rounded-xl transition-colors disabled:opacity-40"
            style={{
              background:
                input.trim() && !loading ? 'var(--interactive-primary)' : 'transparent',
              color:
                input.trim() && !loading ? 'var(--text-on-accent)' : 'var(--text-muted)',
            }}
          >
            <SendHorizontal className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[11px] mt-2 px-1 text-center" style={{ color: 'var(--text-muted)' }}>
          {modelUi.footer}
        </p>
      </div>
    </div>
  )
}
