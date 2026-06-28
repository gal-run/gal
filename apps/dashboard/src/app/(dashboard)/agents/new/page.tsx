"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Bot,
  Beaker,
  Link2,
  Loader2,
  Mail,
  AlertCircle,
  Plus,
  Shield,
  Target,
  Trash2,
} from "lucide-react";
import { useSelectedWorkspace } from "@/hooks/useSelectedWorkspace";
import { useAuth } from "@/contexts/AuthContext";
import { useFeatureFlags } from "@/contexts/FeatureFlagsContext";
import { FeatureGate } from "@/components/FeatureGate";
import { createAgentCard } from "@/lib/agent-card-api";
import type { CreateAgentCardRequest } from "@/lib/agent-card-api";
import { getGmailOAuthUrl } from "@/lib/gmail-credential-api";

const BRIDGE_OPTIONS = [
  { value: "email-triage-reply", label: "Email Triage & Reply", description: "Gmail connector — classifies, drafts replies, sends after approval" },
  { value: "stratus", label: "Stratus Infrastructure", description: "Ansible health checks, fleet ops, Tailscale" },
  { value: "gal-managed-agent", label: "GAL Managed Agent", description: "Background dispatch, swarm prep, work items" },
  { value: "agent-network", label: "Agent Network", description: "A2A delegation, cross-agent handoffs" },
  { value: "customer-support", label: "Customer Support", description: "Intercom digest, draft assist, escalation" },
];

const APPROVAL_OPTIONS = [
  { value: "draft" as const, label: "Draft", description: "Agent drafts, operator reviews and approves" },
  { value: "approve" as const, label: "Approve", description: "Requires explicit operator approval before any action" },
  { value: "auto" as const, label: "Auto (read-only)", description: "Read-only actions only — summaries, status checks" },
];

const TOOL_OPTIONS = [
  "gmail-read",
  "gmail-send",
  "gmail-draft",
  "intercom-read",
  "intercom-reply",
  "github-read",
  "github-pr",
  "slack-message",
  "ansible-check",
  "tailscale-status",
  "obsidian-read",
  "web-search",
];

export default function NewAgentPage() {
  const router = useRouter();
  const orgName = useSelectedWorkspace();
  const { user } = useAuth();
  const { isPageVisibleForUser } = useFeatureFlags();
  const userOrgs = user?.organizations ?? [];

  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [bridge, setBridge] = useState("email-triage-reply");
  const [modelProvider, setModelProvider] = useState("anthropic");
  const [modelId, setModelId] = useState("claude-sonnet-4-6");
  const [temperature, setTemperature] = useState("0.3");
  const [maxTokens, setMaxTokens] = useState("1024");
  const [approvalClass, setApprovalClass] = useState<CreateAgentCardRequest["approvalClass"]>("draft");
  const [channel, setChannel] = useState("");
  const [tools, setTools] = useState<string[]>(["gmail-read", "gmail-draft"]);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gmailConnecting, setGmailConnecting] = useState(false);

  const handleConnectGmail = async () => {
    setGmailConnecting(true);
    try {
      const authUrl = await getGmailOAuthUrl();
      const w = 600, h = 700;
      const left = (screen.width - w) / 2, top = (screen.height - h) / 2;
      const popup = window.open(authUrl, "gmail-oauth", `width=${w},height=${h},left=${left},top=${top}`);
      if (!popup) throw new Error("Popup blocked");
      await new Promise<void>((resolve, reject) => {
        const interval = setInterval(() => {
          try { if (popup.closed) { clearInterval(interval); resolve(); } }
          catch { clearInterval(interval); reject(new Error("Closed")); }
        }, 500);
        setTimeout(() => { clearInterval(interval); reject(new Error("Timeout")); }, 120000);
      });
    } catch (e) { /* user closed popup or timeout */ }
    finally { setGmailConnecting(false); }
  };

  const toggleTool = (tool: string) => {
    setTools((prev) =>
      prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName) return;

    setLoading(true);
    setError(null);

    try {
      const agent = await createAgentCard(orgName, {
        name,
        role: role || `${name} agent`,
        bridge,
        capabilities: [bridge],
        channel: channel || `#${name.toLowerCase().replace(/\s+/g, "-")}`,
        approvalClass,
        tools,
        systemPrompt: systemPrompt || buildDefaultPrompt(name, role, bridge),
        modelProvider: {
          provider: modelProvider,
          model: modelId,
          temperature: parseFloat(temperature) || undefined,
          maxTokens: parseInt(maxTokens, 10) || undefined,
          systemPrompt: systemPrompt || undefined,
        },
      });
      router.push(`/agents`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create agent");
    } finally {
      setLoading(false);
    }
  };

  // Route guard (#6513): creating background-agent cards is part of the
  // internal background-agents surface (same as the parent /agents list). Block
  // non-internal/non-EE (customer-tier) users who hand-type /agents/new with
  // the same audience-aware FeatureGate the /agents page uses.
  if (!isPageVisibleForUser("background-agents", userOrgs, orgName)) {
    return <FeatureGate pageId="background-agents" />;
  }

  if (!orgName) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-12">
          <AlertCircle className="w-12 h-12 mx-auto mb-3" style={{ color: "var(--text-muted)" }} />
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Select a workspace to create agents.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-4 mb-8">
        <Link
          href="/agents"
          className="p-2 rounded-lg hover:bg-[var(--surface-sunken)] transition-colors"
        >
          <ArrowLeft className="w-5 h-5" style={{ color: "var(--text-secondary)" }} />
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5" style={{ color: "var(--accent)" }} />
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
              Create Agent
            </h1>
          </div>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Define an agent that Operator Hub and other systems can discover and orchestrate
          </p>
        </div>
      </div>

      {error && (
        <div
          className="flex items-center gap-2 p-4 rounded-lg mb-6"
          style={{
            backgroundColor: "var(--status-danger-light)",
            border: "1px solid var(--status-danger)",
            color: "var(--status-danger-text)",
          }}
        >
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Identity */}
        <div
          className="rounded-xl border p-6"
          style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface-raised)" }}
        >
          <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
            Identity
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
                Name <span style={{ color: "var(--status-danger)" }}>*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={100}
                className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-1"
                style={{ backgroundColor: "var(--bg-primary)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                placeholder="Sarah"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
                Channel
              </label>
              <input
                type="text"
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                maxLength={100}
                className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-1"
                style={{ backgroundColor: "var(--bg-primary)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                placeholder="#sarah-support"
              />
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                Auto-generated from name if left blank
              </p>
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
              Role
            </label>
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              maxLength={200}
              className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-1"
              style={{ backgroundColor: "var(--bg-primary)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
              placeholder="Customer email — draft replies, handle refunds, flag escalations"
            />
          </div>
        </div>

        {/* Gmail Connection */}
        <div
          className="rounded-xl border p-6"
          style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface-raised)" }}
        >
          <h2 className="text-lg font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
            Gmail Connection
          </h2>
          <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
            Connect your Gmail account so this agent can read and reply to emails.
            Only you control which agents access your inbox.
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void handleConnectGmail()}
              disabled={gmailConnecting}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
              style={{ backgroundColor: "var(--bg-tertiary)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}
            >
              {gmailConnecting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Mail className="w-4 h-4" />
              )}
              Connect Gmail
            </button>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              Opens Google OAuth in a popup. Tokens stored securely, never shared.
            </span>
          </div>
        </div>

        {/* Model Provider */}
        <div
          className="rounded-xl border p-6"
          style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface-raised)" }}
        >
          <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
            Model
          </h2>
          <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
            The LLM that powers this agent&apos;s reasoning. Change this without touching code.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
                Provider
              </label>
              <select
                value={modelProvider}
                onChange={(e) => {
                  setModelProvider(e.target.value);
                  if (e.target.value === "anthropic") setModelId("claude-sonnet-4-6");
                  if (e.target.value === "google") setModelId("gemini-2.5-flash");
                  if (e.target.value === "openai") setModelId("gpt-5.5");
                }}
                className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-1"
                style={{ backgroundColor: "var(--bg-primary)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
              >
                <option value="anthropic">Anthropic</option>
                <option value="google">Google</option>
                <option value="openai">OpenAI</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
                Model
              </label>
              <select
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-1"
                style={{ backgroundColor: "var(--bg-primary)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
              >
                {modelProvider === "anthropic" && (
                  <>
                    <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
                    <option value="claude-opus-4-7">Claude Opus 4.7</option>
                    <option value="claude-haiku-4-5">Claude Haiku 4.5</option>
                  </>
                )}
                {modelProvider === "google" && (
                  <>
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                    <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                    <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
                  </>
                )}
                {modelProvider === "openai" && (
                  <>
                    <option value="gpt-5.5">GPT-5.5</option>
                    <option value="gpt-5.5-mini">GPT-5.5 Mini</option>
                  </>
                )}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
                Temperature
              </label>
              <input
                type="number"
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
                min="0"
                max="2"
                step="0.1"
                className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-1"
                style={{ backgroundColor: "var(--bg-primary)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
              />
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                0 = deterministic, 2 = creative
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
                Max Tokens
              </label>
              <input
                type="number"
                value={maxTokens}
                onChange={(e) => setMaxTokens(e.target.value)}
                min="64"
                max="8192"
                step="64"
                className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-1"
                style={{ backgroundColor: "var(--bg-primary)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
              />
            </div>
          </div>
        </div>

        {/* Runtime */}
        <div
          className="rounded-xl border p-6"
          style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface-raised)" }}
        >
          <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
            Runtime & Permissions
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
                Bridge <span style={{ color: "var(--status-danger)" }}>*</span>
              </label>
              <select
                value={bridge}
                onChange={(e) => setBridge(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-1"
                style={{ backgroundColor: "var(--bg-primary)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
              >
                {BRIDGE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                {BRIDGE_OPTIONS.find((b) => b.value === bridge)?.description}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
                Approval Class
              </label>
              <div className="space-y-2">
                {APPROVAL_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors"
                    style={{
                      borderColor: approvalClass === opt.value ? "var(--accent)" : "var(--border-subtle)",
                      backgroundColor: approvalClass === opt.value ? "var(--surface-sunken)" : "var(--bg-primary)",
                    }}
                  >
                    <input
                      type="radio"
                      name="approvalClass"
                      value={opt.value}
                      checked={approvalClass === opt.value}
                      onChange={() => setApprovalClass(opt.value)}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                        {opt.label}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                        {opt.description}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Tools */}
        <div
          className="rounded-xl border p-6"
          style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface-raised)" }}
        >
          <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
            Tools
          </h2>
          <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
            Select the tools this agent can use. Tools determine what actions the agent can perform.
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {TOOL_OPTIONS.map((tool) => {
              const selected = tools.includes(tool);
              return (
                <button
                  key={tool}
                  type="button"
                  onClick={() => toggleTool(tool)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors text-left"
                  style={{
                    borderColor: selected ? "var(--accent)" : "var(--border-subtle)",
                    backgroundColor: selected ? "var(--surface-sunken)" : "var(--bg-primary)",
                    color: selected ? "var(--text-primary)" : "var(--text-secondary)",
                  }}
                >
                  <span
                    className="w-4 h-4 rounded border flex items-center justify-center shrink-0"
                    style={{
                      borderColor: selected ? "var(--accent)" : "var(--border-subtle)",
                      backgroundColor: selected ? "var(--accent)" : "transparent",
                    }}
                  >
                    {selected && <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: "var(--text-on-accent)" }} />}
                  </span>
                  {tool}
                </button>
              );
            })}
          </div>
        </div>

        {/* Governance */}
        <div
          className="rounded-xl border p-6"
          style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface-raised)" }}
        >
          <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
            Governance & Eval Gate
          </h2>
          <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
            Governance rules control what this agent can do and what evidence it must provide.
            The eval gate blocks deployment until the agent passes its evaluation suite.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div
              className="rounded-lg border p-4"
              style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--bg-primary)" }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-4 h-4" style={{ color: "var(--accent)" }} />
                <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  Evidence Required
                </span>
              </div>
              <div className="space-y-2">
                {["draft", "approval-receipt", "send-confirmation"].map((artifact) => (
                  <label key={artifact} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" defaultChecked className="accent-[var(--accent)]" />
                    <span style={{ color: "var(--text-secondary)" }}>{artifact}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
                Every action must produce these audit artifacts.
              </p>
            </div>

            <div
              className="rounded-lg border p-4"
              style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--bg-primary)" }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Beaker className="w-4 h-4" style={{ color: "var(--accent)" }} />
                <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  Eval Gate
                </span>
              </div>
              <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                <p>Suite: <code>gal.ops-triage.email-reply.v1</code></p>
                <p className="mt-1">Gate: 85% overall, 100% no_refund_promise</p>
                <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                  Agent cannot deploy until eval passes. Run evals after creation.
                </p>
              </div>
            </div>

            <div
              className="rounded-lg border p-4"
              style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--bg-primary)" }}
            >
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="w-4 h-4" style={{ color: "var(--status-warning)" }} />
                <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  Hard Blocks
                </span>
              </div>
              <ul className="text-sm space-y-1" style={{ color: "var(--text-secondary)" }}>
                <li>• Never promises refunds</li>
                <li>• Never sends without approval</li>
                <li>• Never commits code or pushes branches</li>
                <li>• Credentials never stored in repo</li>
              </ul>
            </div>

            <div
              className="rounded-lg border p-4"
              style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--bg-primary)" }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-4 h-4" style={{ color: "var(--accent)" }} />
                <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  Correlation Required
                </span>
              </div>
              <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                <p>Parent task ID required for all sends.</p>
                <p className="mt-1">Status events track: state, action, messageId, recipient.</p>
                <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                  Every email send is traced to a parent task.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* System Prompt */}
        <div
          className="rounded-xl border p-6"
          style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface-raised)" }}
        >
          <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
            System Prompt
          </h2>
          <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
            The system prompt defines the agent&apos;s personality, responsibilities, and operating constraints.
            Markdown supported.
          </p>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={10}
            className="w-full px-3 py-3 rounded-lg border font-mono text-sm focus:outline-none focus:ring-1"
            style={{ backgroundColor: "var(--bg-primary)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
            placeholder={
              "You are Sarah, a customer support agent.\n\nYour job is to:\n- Read incoming customer emails\n- Draft helpful, empathetic replies\n- Flag refunds and escalations for operator review\n- Learn from every correction\n\nNever send without approval."
            }
          />
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            Auto-generated if left blank based on name, role, and bridge selection.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Link
            href="/agents"
            className="px-4 py-2 text-sm rounded-lg border"
            style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            style={{ backgroundColor: "var(--interactive-secondary)", color: "var(--text-on-accent)" }}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Create Agent
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

function buildDefaultPrompt(name: string, role: string, bridge: string): string {
  const bridgeLabel = BRIDGE_OPTIONS.find((b) => b.value === bridge)?.label ?? bridge;
  return [
    `You are ${name || "an AI agent"}, ${role || "a specialized operator"}.`,
    "",
    `Runtime: ${bridgeLabel}`,
    "",
    "Your responsibilities:",
    "- Execute tasks within your approved scope",
    "- Surface decisions that need operator review",
    "- Learn from feedback and improve over time",
    "",
    "Never act without required approval.",
  ].join("\n");
}
