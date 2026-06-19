"use client";

import { useState } from "react";
import { Play, Loader2, Check, X, AlertTriangle } from "lucide-react";
import { checkPolicy, type PolicyCheckResult } from "@/lib/policy-api";
import { useSelectedWorkspace } from "@/hooks/useSelectedWorkspace";

const TOOLS = [
  "Bash",
  "Write",
  "Edit",
  "Read",
  "Glob",
  "Grep",
  "WebFetch",
  "TodoWrite",
  "TodoRead",
  "Task",
];

export function PolicyCheckForm() {
  const orgName = useSelectedWorkspace();
  const [tool, setTool] = useState("Bash");
  const [inputJson, setInputJson] = useState('{\n  "command": "ls -la"\n}');
  const [result, setResult] = useState<PolicyCheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCheck = async () => {
    if (!orgName) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const input = JSON.parse(inputJson);
      const checkResult = await checkPolicy(orgName, { tool, input });
      setResult(checkResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid JSON input");
    } finally {
      setLoading(false);
    }
  };

  const resultBg = result?.allowed
    ? "var(--status-success-light)"
    : result
      ? "var(--status-danger-light)"
      : "var(--surface-sunken)";

  const resultBorder = result?.allowed
    ? "var(--status-success)"
    : result
      ? "var(--status-danger)"
      : "var(--border-subtle)";

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label
            className="block text-sm font-medium mb-2"
            style={{ color: "var(--text-primary)" }}
          >
            Tool
          </label>
          <select
            value={tool}
            onChange={(e) => setTool(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-1"
            style={{
              backgroundColor: "var(--bg-primary)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-primary)",
            }}
          >
            {TOOLS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            className="block text-sm font-medium mb-2"
            style={{ color: "var(--text-primary)" }}
          >
            Input (JSON)
          </label>
          <textarea
            value={inputJson}
            onChange={(e) => setInputJson(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 rounded-lg border font-mono text-sm focus:outline-none focus:ring-1"
            style={{
              backgroundColor: "var(--bg-primary)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-primary)",
            }}
            placeholder='{"command": "ls -la"}'
          />
        </div>
      </div>

      <button
        onClick={handleCheck}
        disabled={loading || !orgName}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        style={{
          backgroundColor: "var(--interactive-secondary)",
          color: "var(--text-on-accent)",
        }}
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Checking...
          </>
        ) : (
          <>
            <Play className="w-4 h-4" />
            Test Enforcement
          </>
        )}
      </button>

      {error && (
        <div
          className="flex items-center gap-2 p-4 rounded-lg"
          style={{
            backgroundColor: "var(--status-danger-light)",
            border: "1px solid var(--status-danger)",
            color: "var(--status-danger-text)",
          }}
        >
          <AlertTriangle className="w-4 h-4" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {result && (
        <div
          className="p-4 rounded-lg border"
          style={{ backgroundColor: resultBg, borderColor: resultBorder }}
        >
          <div className="flex items-center gap-3 mb-3">
            {result.allowed ? (
              <Check
                className="w-5 h-5"
                style={{ color: "var(--status-success)" }}
              />
            ) : (
              <X
                className="w-5 h-5"
                style={{ color: "var(--status-danger)" }}
              />
            )}
            <span
              className="text-lg font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              {result.action.toUpperCase()}
            </span>
          </div>

          {result.matchedPolicyName && (
            <p
              className="text-sm mb-2"
              style={{ color: "var(--text-secondary)" }}
            >
              Matched policy: <strong>{result.matchedPolicyName}</strong>
            </p>
          )}

          {result.reason && (
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {result.reason}
            </p>
          )}

          {result.evaluationTime && (
            <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
              Evaluated in {result.evaluationTime}ms
            </p>
          )}
        </div>
      )}
    </div>
  );
}
