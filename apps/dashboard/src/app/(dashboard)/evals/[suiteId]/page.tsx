"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Beaker,
  CheckCircle2,
  Clock3,
  Loader2,
  Play,
  ShieldAlert,
  Target,
  XCircle,
} from "lucide-react";
import { useSelectedWorkspace } from "@/hooks/useSelectedWorkspace";
import { useAuth } from "@/contexts/AuthContext";
import { useFeatureFlags } from "@/contexts/FeatureFlagsContext";
import { FeatureGate } from "@/components/FeatureGate";
import { getEvalReport, runEval } from "@/lib/eval-api";
import type { EvalReport } from "@/lib/eval-api";
import { isDemoMode } from "@/lib/demo-guard";
import { DEMO_ORG } from "@/lib/demo-data";

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function EvalDetailPage() {
  const params = useParams();
  const suiteId = typeof params.suiteId === "string" ? params.suiteId : (params.suiteId as string[])?.[0] ?? "";
  const workspaceName = useSelectedWorkspace();
  const orgName = isDemoMode() ? workspaceName ?? DEMO_ORG : workspaceName;
  const { user } = useAuth();
  const { isPageVisibleForUser } = useFeatureFlags();
  const userOrgs = user?.organizations ?? [];

  const [report, setReport] = useState<EvalReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadReport = useCallback(async () => {
    if (!orgName || !suiteId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getEvalReport(orgName, suiteId);
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load eval report");
    } finally {
      setLoading(false);
    }
  }, [orgName, suiteId]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const handleRun = async () => {
    if (!orgName || !suiteId) return;
    setRunning(true);
    try {
      const result = await runEval(orgName, { suiteId });
      setReport(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eval run failed");
    } finally {
      setRunning(false);
    }
  };

  // Route guard (#6513): the eval suite detail page is part of the internal
  // background-agents surface. Block non-internal/non-EE (customer-tier) users
  // who hand-type /evals/<suiteId> with the same audience-aware FeatureGate the
  // agents/sessions pages use.
  if (!isPageVisibleForUser("background-agents", userOrgs, workspaceName)) {
    return <FeatureGate pageId="background-agents" />;
  }

  if (loading) {
    return (
      <div className="h-full overflow-auto p-6 md:p-8">
        <div className="max-w-5xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 rounded w-64 bg-[var(--bg-tertiary)]" />
            <div className="h-64 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-6 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link
            href="/evals"
            className="p-2 rounded-lg hover:bg-[var(--surface-sunken)] transition-colors"
          >
            <ArrowLeft className="w-5 h-5" style={{ color: "var(--text-secondary)" }} />
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Beaker className="w-5 h-5" style={{ color: "var(--accent)" }} />
              <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
                {report?.suiteName ?? `Suite ${suiteId}`}
              </h1>
              {report && (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold"
                  style={{
                    backgroundColor: report.passed ? "var(--status-success-light)" : "var(--status-danger-light)",
                    color: report.passed ? "var(--status-success)" : "var(--status-danger)",
                  }}
                >
                  {report.passed ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    <ShieldAlert className="w-3.5 h-3.5" />
                  )}
                  {report.passed ? "PASS" : "FAIL"}
                </span>
              )}
            </div>
            <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
              {report
                ? `${report.subject.agentId ?? report.subject.kind}${report.subject.taskType ? ` / ${report.subject.taskType}` : ""} • ${report.adapterId} • ${formatDate(report.generatedAt)}`
                : suiteId}
            </p>
          </div>
          <button
            onClick={() => void handleRun()}
            disabled={running || !orgName}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
            style={{ backgroundColor: "var(--interactive-secondary)", color: "var(--text-on-accent)" }}
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Run
          </button>
        </div>

        {error && (
          <div
            className="rounded-2xl p-4"
            style={{
              backgroundColor: "var(--status-danger-light)",
              border: "1px solid var(--status-danger)",
              color: "var(--status-danger-text)",
            }}
          >
            <p className="text-sm font-medium">Error</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        )}

        {report && (
          <>
            {/* Score overview */}
            <div className="grid gap-4 md:grid-cols-3">
              <div
                className="rounded-2xl p-5"
                style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-subtle)" }}
              >
                <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  Overall Score
                </p>
                <p
                  className="text-4xl font-bold mt-3"
                  style={{ color: report.passed ? "var(--status-success)" : "var(--status-danger)" }}
                >
                  {formatPercent(report.score)}
                </p>
              </div>
              <div
                className="rounded-2xl p-5"
                style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-subtle)" }}
              >
                <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  Cases Passed
                </p>
                <p className="text-4xl font-bold mt-3" style={{ color: "var(--text-primary)" }}>
                  {report.cases.filter((c) => c.passed).length}/{report.cases.length}
                </p>
              </div>
              <div
                className="rounded-2xl p-5"
                style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-subtle)" }}
              >
                <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  Metrics Passing
                </p>
                <p className="text-4xl font-bold mt-3" style={{ color: "var(--text-primary)" }}>
                  {report.metrics.filter((m) => m.passed).length}/{report.metrics.length}
                </p>
              </div>
            </div>

            {/* Metrics table */}
            <div
              className="rounded-2xl border overflow-hidden"
              style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface-raised)" }}
            >
              <div className="p-4 border-b" style={{ borderColor: "var(--border-subtle)" }}>
                <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                  Metrics
                </h2>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <th className="text-left p-3 font-medium" style={{ color: "var(--text-muted)" }}>
                      Metric
                    </th>
                    <th className="text-right p-3 font-medium" style={{ color: "var(--text-muted)" }}>
                      Score
                    </th>
                    <th className="text-right p-3 font-medium" style={{ color: "var(--text-muted)" }}>
                      Correct
                    </th>
                    <th className="text-right p-3 font-medium" style={{ color: "var(--text-muted)" }}>
                      Gate
                    </th>
                    <th className="text-center p-3 font-medium" style={{ color: "var(--text-muted)" }}>
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report.metrics.map((m) => (
                    <tr key={m.metric} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <td className="p-3 font-medium" style={{ color: "var(--text-primary)" }}>
                        {m.metric}
                      </td>
                      <td className="p-3 text-right font-mono" style={{ color: m.passed ? "var(--status-success)" : "var(--status-danger)" }}>
                        {formatPercent(m.score)}
                      </td>
                      <td className="p-3 text-right font-mono" style={{ color: "var(--text-secondary)" }}>
                        {m.correct}/{m.total}
                      </td>
                      <td className="p-3 text-right font-mono" style={{ color: "var(--text-muted)" }}>
                        {m.gate ? formatPercent(m.gate.minScore) : "—"}
                      </td>
                      <td className="p-3 text-center">
                        {m.passed ? (
                          <CheckCircle2 className="w-4 h-4 inline" style={{ color: "var(--status-success)" }} />
                        ) : (
                          <XCircle className="w-4 h-4 inline" style={{ color: "var(--status-danger)" }} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Case results */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                Cases ({report.cases.length})
              </h2>
              {report.cases.map((c) => (
                <div
                  key={c.caseId}
                  className="rounded-2xl border p-5"
                  style={{
                    borderColor: c.passed ? "var(--border-subtle)" : "var(--status-danger)",
                    backgroundColor: "var(--surface-raised)",
                  }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>
                          {c.title ?? c.caseId}
                        </h3>
                        {c.passed ? (
                          <CheckCircle2 className="w-4 h-4" style={{ color: "var(--status-success)" }} />
                        ) : (
                          <XCircle className="w-4 h-4" style={{ color: "var(--status-danger)" }} />
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                          {c.caseId}
                        </span>
                        {c.tags?.map((tag) => (
                          <span
                            key={tag}
                            className="text-xs rounded-full px-2 py-0.5"
                            style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <span
                      className="text-sm font-mono font-semibold shrink-0"
                      style={{ color: c.passed ? "var(--status-success)" : "var(--status-danger)" }}
                    >
                      {formatPercent(c.score)}
                    </span>
                  </div>

                  {/* Field results */}
                  <div className="mt-3 space-y-1.5">
                    {c.fields.map((f) => (
                      <div
                        key={f.path}
                        className="flex items-center gap-3 text-sm rounded-lg p-2"
                        style={{ backgroundColor: f.passed ? "transparent" : "var(--status-danger-light)" }}
                      >
                        {f.passed ? (
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--status-success)" }} />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--status-danger)" }} />
                        )}
                        <span className="font-mono text-xs shrink-0 w-24" style={{ color: "var(--text-secondary)" }}>
                          {f.metric}
                        </span>
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                          expected{" "}
                          <code style={{ color: "var(--text-primary)" }}>
                            {JSON.stringify(f.expected)}
                          </code>
                          {" → "}
                          got{" "}
                          <code style={{ color: f.passed ? "var(--text-primary)" : "var(--status-danger)" }}>
                            {JSON.stringify(f.actual)}
                          </code>
                        </span>
                      </div>
                    ))}
                  </div>

                  {c.fields.some((f) => f.suggestion) && (
                    <div className="mt-3 text-xs" style={{ color: "var(--status-warning)" }}>
                      {c.fields
                        .filter((f) => f.suggestion)
                        .map((f) => (
                          <p key={f.metric}>💡 {f.suggestion}</p>
                        ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Suggestions summary */}
            {report.suggestions.length > 0 && (
              <div
                className="rounded-2xl p-5"
                style={{
                  backgroundColor: "var(--status-warning-light)",
                  border: "1px solid var(--status-warning)",
                }}
              >
                <h2 className="text-lg font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
                  Suggested Corrections
                </h2>
                <ul className="space-y-1">
                  {report.suggestions.map((s, i) => (
                    <li key={i} className="text-sm" style={{ color: "var(--text-primary)" }}>
                      • {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {!report && !error && !loading && (
          <div
            className="rounded-2xl p-6 text-center"
            style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-subtle)" }}
          >
            <Beaker className="w-12 h-12 mx-auto mb-3" style={{ color: "var(--text-muted)" }} />
            <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              No report yet
            </h2>
            <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
              Run the evaluation to generate a report for this suite.
            </p>
            <button
              onClick={() => void handleRun()}
              disabled={running || !orgName}
              className="mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
              style={{ backgroundColor: "var(--interactive-secondary)", color: "var(--text-on-accent)" }}
            >
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Run Eval
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
