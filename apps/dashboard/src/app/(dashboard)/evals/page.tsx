"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Beaker,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Loader2,
  Play,
  ShieldAlert,
  Target,
  XCircle,
  TrendingUp,
} from "lucide-react";
import { useSelectedWorkspace } from "@/hooks/useSelectedWorkspace";
import { useAuth } from "@/contexts/AuthContext";
import { useFeatureFlags } from "@/contexts/FeatureFlagsContext";
import { FeatureGate } from "@/components/FeatureGate";
import { listEvalSuites, runEval } from "@/lib/eval-api";
import type { EvalSuiteSummary } from "@/lib/eval-api";
import { isDemoMode } from "@/lib/demo-guard";
import { DEMO_ORG, DEMO_EVAL_SUITES } from "@/lib/demo-data";

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Never";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function ScoreBadge({ score, passed }: { score: number; passed: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{
        backgroundColor: passed ? "var(--status-success-light)" : "var(--status-danger-light)",
        color: passed ? "var(--status-success)" : "var(--status-danger)",
      }}
    >
      {passed ? (
        <CheckCircle2 className="w-3.5 h-3.5" />
      ) : (
        <ShieldAlert className="w-3.5 h-3.5" />
      )}
      {formatPercent(score)}
    </span>
  );
}

export default function EvalsPage() {
  const workspaceName = useSelectedWorkspace();
  const orgName = isDemoMode() ? workspaceName ?? DEMO_ORG : workspaceName;
  const { user } = useAuth();
  const { isPageVisibleForUser } = useFeatureFlags();
  const userOrgs = user?.organizations ?? [];

  const [suites, setSuites] = useState<EvalSuiteSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runningSuite, setRunningSuite] = useState<string | null>(null);

  const loadSuites = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Demo mode: serve pre-seeded suites without hitting the real API, which
      // is unavailable on the public live demo (#507).
      if (isDemoMode()) {
        setSuites(DEMO_EVAL_SUITES);
        return;
      }
      if (!orgName) {
        setSuites([]);
        return;
      }
      const data = await listEvalSuites(orgName);
      setSuites(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load eval suites");
    } finally {
      setLoading(false);
    }
  }, [orgName]);

  useEffect(() => {
    void loadSuites();
  }, [loadSuites]);

  const handleRunEval = async (suiteId: string) => {
    if (!orgName) return;
    setRunningSuite(suiteId);
    try {
      await runEval(orgName, { suiteId });
      await loadSuites();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eval run failed");
    } finally {
      setRunningSuite(null);
    }
  };

  const summary = useMemo(() => {
    const total = suites.length;
    const passing = suites.filter((s) => s.latestReport?.passed).length;
    const avgScore =
      total === 0
        ? 0
        : suites.reduce((sum, s) => sum + (s.latestReport?.score ?? 0), 0) / total;
    return { total, passing, avgScore };
  }, [suites]);

  // Route guard (#6513): the evals dashboard is part of the internal
  // background-agents surface (agents must pass eval gates before deployment).
  // Block non-internal/non-EE (customer-tier) users who hand-type /evals with
  // the same audience-aware FeatureGate the agents/sessions pages use.
  if (!isPageVisibleForUser("background-agents", userOrgs, workspaceName)) {
    return <FeatureGate pageId="background-agents" />;
  }

  if (loading) {
    return (
      <div className="h-full overflow-auto p-6 md:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 rounded w-48 bg-[var(--bg-tertiary)]" />
            <div className="grid gap-4 md:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-24 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]"
                />
              ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <div
                  key={i}
                  className="h-48 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]"
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium"
              style={{
                backgroundColor: "var(--bg-secondary)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-secondary)",
              }}
            >
              <Beaker className="w-3.5 h-3.5" />
              <span>Agent Evaluation</span>
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
                Evals
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6" style={{ color: "var(--text-secondary)" }}>
                Evaluation suites for{" "}
                <span style={{ color: "var(--text-primary)" }}>{orgName ?? "this workspace"}</span>.
                Agents must pass eval gates before deployment. Run evals to validate agent behavior.
              </p>
            </div>
          </div>
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
            <p className="text-sm font-medium">Unable to load eval suites</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        )}

        {/* Summary cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <div
            className="rounded-2xl p-5"
            style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-subtle)" }}
          >
            <div className="flex items-center gap-2 mb-3" style={{ color: "var(--text-secondary)" }}>
              <Beaker className="w-4 h-4" />
              <span className="text-sm font-medium">Suites</span>
            </div>
            <div className="text-3xl font-semibold" style={{ color: "var(--text-primary)" }}>
              {summary.total}
            </div>
            <p className="text-sm mt-2" style={{ color: "var(--text-muted)" }}>
              Evaluation suites defined
            </p>
          </div>
          <div
            className="rounded-2xl p-5"
            style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-subtle)" }}
          >
            <div className="flex items-center gap-2 mb-3" style={{ color: "var(--text-secondary)" }}>
              <CheckCircle2 className="w-4 h-4" />
              <span className="text-sm font-medium">Passing</span>
            </div>
            <div className="text-3xl font-semibold" style={{ color: "var(--text-primary)" }}>
              {summary.passing}/{summary.total}
            </div>
            <p className="text-sm mt-2" style={{ color: "var(--text-muted)" }}>
              Suites above eval gate threshold
            </p>
          </div>
          <div
            className="rounded-2xl p-5"
            style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-subtle)" }}
          >
            <div className="flex items-center gap-2 mb-3" style={{ color: "var(--text-secondary)" }}>
              <TrendingUp className="w-4 h-4" />
              <span className="text-sm font-medium">Avg Score</span>
            </div>
            <div className="text-3xl font-semibold" style={{ color: "var(--text-primary)" }}>
              {formatPercent(summary.avgScore)}
            </div>
            <p className="text-sm mt-2" style={{ color: "var(--text-muted)" }}>
              Across all suite reports
            </p>
          </div>
        </div>

        {!orgName && !isDemoMode() && (
          <div
            className="rounded-2xl p-6"
            style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-subtle)" }}
          >
            <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              Select a workspace
            </h2>
            <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
              Choose an organization from the sidebar to view its evaluation suites.
            </p>
          </div>
        )}

        {suites.length === 0 && !error && orgName && (
          <div
            className="rounded-2xl p-6"
            style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-subtle)" }}
          >
            <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              No eval suites yet
            </h2>
            <p className="mt-2 text-sm max-w-2xl" style={{ color: "var(--text-secondary)" }}>
              Define evaluation suites to validate agent behavior before deployment. Each suite tests a specific agent task type against expected outputs.
            </p>
          </div>
        )}

        {suites.length > 0 && (
          <div className="grid gap-4 lg:grid-cols-2">
            {suites.map((suite) => {
              const report = suite.latestReport;
              const subjectLabel = suite.subject.agentId ?? suite.subject.taskType ?? suite.subject.kind;

              return (
                <article
                  key={suite.id}
                  className="rounded-2xl p-5 transition-colors"
                  style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-subtle)" }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                        style={{ backgroundColor: "var(--bg-tertiary)", border: "1px solid var(--border-subtle)" }}
                      >
                        <Target className="w-5 h-5" style={{ color: "var(--text-primary)" }} />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                          {suite.name}
                        </h2>
                        <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
                          {suite.description ?? `${suite.caseCount} cases`}
                        </p>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span
                            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                            style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
                          >
                            {subjectLabel}
                          </span>
                          <span
                            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
                            style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-muted)" }}
                          >
                            {suite.caseCount} cases
                          </span>
                        </div>
                      </div>
                    </div>
                    {report && <ScoreBadge score={report.score} passed={report.passed} />}
                  </div>

                  {/* Mini metric bar */}
                  {report && (
                    <div className="mt-4 space-y-2">
                      {report.metrics.slice(0, 4).map((m) => (
                        <div key={m.metric} className="flex items-center gap-2">
                          <span className="text-xs w-20 shrink-0" style={{ color: "var(--text-secondary)" }}>
                            {m.metric}
                          </span>
                          <div className="flex-1 h-1.5 rounded-full" style={{ backgroundColor: "var(--bg-tertiary)" }}>
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${m.score * 100}%`,
                                backgroundColor: m.passed ? "var(--status-success)" : "var(--status-danger)",
                              }}
                            />
                          </div>
                          <span
                            className="text-xs w-10 text-right font-medium"
                            style={{ color: m.passed ? "var(--status-success)" : "var(--status-danger)" }}
                          >
                            {formatPercent(m.score)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
                      <Clock3 className="w-3 h-3" />
                      {report ? formatDate(report.generatedAt) : "Never run"}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => void handleRunEval(suite.id)}
                        disabled={runningSuite === suite.id}
                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
                        style={{
                          backgroundColor: "var(--bg-tertiary)",
                          border: "1px solid var(--border-subtle)",
                          color: "var(--text-primary)",
                        }}
                      >
                        {runningSuite === suite.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Play className="w-3.5 h-3.5" />
                        )}
                        Run
                      </button>
                      {report && (
                        <Link
                          href={`/evals/${suite.id}`}
                          className="inline-flex items-center gap-1.5 text-xs font-medium"
                          style={{ color: "var(--interactive-primary)" }}
                        >
                          Details
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
