'use client'

import { useState, useEffect } from "react";
import {
  Play,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  Code,
  Terminal,
  Beaker,
  Clock,
  Zap,
  Settings,
  Upload,
  Download,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useFeatureFlags } from "@/contexts/FeatureFlagsContext";
import { isDemoMode } from "@/lib/demo-guard";

const DEMO_WORKFLOW_RESULTS: WorkflowTestResult[] = [
  {
    success: true,
    fileName: "commit.md",
    type: "command",
    platform: "claude",
    iterations: [
      {
        iteration: 1,
        content: "Stage and commit all changes with a descriptive message...",
        executionResult: {
          success: true,
          output: "✓ Staged 12 files\n✓ Commit created: feat: add user authentication\n✓ Branch pushed to origin",
          executionTimeMs: 1240,
          logs: [
            "[sandbox] Cloning acme-corp/web-app...",
            "[sandbox] Running: git add -A",
            "[sandbox] Running: git commit -m 'feat: add user auth'",
            "[sandbox] Running: git push origin main",
            "[sandbox] ✓ Complete",
          ],
        },
        evaluation: {
          score: 92,
          recommendation: "approve",
          reasoning: "Command executes reliably and produces clean commits. Git operations are atomic and follow conventional commit format. No security concerns detected.",
          issues: [],
          suggestedImprovements: [
            "Consider adding --signoff flag for corporate compliance",
          ],
        },
        timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
    ],
    finalScore: 92,
    recommendation: "approve",
    executionTimeMs: 1240,
    testedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
  },
  {
    success: true,
    fileName: "review.md",
    type: "command",
    platform: "claude",
    iterations: [
      {
        iteration: 1,
        content: "Review the current branch diff and provide structured feedback...",
        executionResult: {
          success: true,
          output: "✓ Fetched diff (47 files changed)\n✓ Analysis complete\n✓ Report generated: review-20260309.md",
          executionTimeMs: 2100,
          logs: [
            "[sandbox] Running: git diff origin/main...HEAD",
            "[sandbox] Analyzing 47 changed files...",
            "[sandbox] Security scan: 0 issues",
            "[sandbox] Style check: 3 suggestions",
            "[sandbox] ✓ Review complete",
          ],
        },
        evaluation: {
          score: 88,
          recommendation: "approve",
          reasoning: "Code review command produces thorough analysis covering security, style, and logic. Output is well-structured and actionable.",
          issues: [
            {
              type: "performance",
              message: "Large diffs (500+ files) may timeout in sandbox",
              severity: "low",
            },
          ],
          suggestedImprovements: [
            "Add --max-files parameter to handle large PRs",
            "Consider caching diff results for repeated runs",
          ],
        },
        timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      },
    ],
    finalScore: 88,
    recommendation: "approve",
    executionTimeMs: 2100,
    testedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
  },
  {
    success: true,
    fileName: "pre_tool_use.json",
    type: "hook",
    platform: "claude",
    iterations: [
      {
        iteration: 1,
        content: '{"matcher": "Bash", "hooks": [{"type": "command", "command": "echo tool: $TOOL_NAME"}]}',
        executionResult: {
          success: true,
          output: "tool: Bash\ntool: Edit\ntool: Read\n✓ Hook fired 3 times",
          executionTimeMs: 320,
          logs: [
            "[sandbox] Installing hook...",
            "[sandbox] Triggering test tool calls...",
            "[sandbox] Hook fired: Bash → exit 0",
            "[sandbox] Hook fired: Edit → exit 0",
            "[sandbox] Hook fired: Read → exit 0",
            "[sandbox] ✓ All triggers fired correctly",
          ],
        },
        evaluation: {
          score: 79,
          recommendation: "revise",
          reasoning: "Hook fires correctly on all matched tools. However, the logging format could be more structured for audit trail requirements.",
          issues: [
            {
              type: "compliance",
              message: "Hook output lacks timestamp and user context for audit logs",
              severity: "medium",
            },
          ],
          suggestedImprovements: [
            "Add ISO timestamp to each hook log entry",
            "Include $USER and $SESSION_ID in output for traceability",
            "Consider JSON output format for structured log ingestion",
          ],
        },
        timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000),
      },
    ],
    finalScore: 79,
    recommendation: "revise",
    executionTimeMs: 320,
    testedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
  },
];

interface WorkflowTestResult {
  success: boolean;
  fileName: string;
  type: "command" | "hook";
  platform: string;
  iterations: WorkflowIteration[];
  finalScore: number;
  recommendation: "approve" | "revise" | "reject";
  executionTimeMs: number;
  testedAt: Date;
  error?: string;
}

interface WorkflowIteration {
  iteration: number;
  content: string;
  executionResult: {
    success: boolean;
    output: string;
    error?: string;
    executionTimeMs: number;
    logs: string[];
  };
  evaluation: {
    score: number;
    recommendation: "approve" | "revise" | "reject";
    reasoning: string;
    issues: Array<{
      type: string;
      message: string;
      severity: string;
    }>;
    suggestedImprovements: string[];
  };
  timestamp: Date;
}

interface WorkflowTestReport {
  workspaceName: string;
  generatedAt: Date;
  totalTests: number;
  passedTests: number;
  averageScore: number;
  results: WorkflowTestResult[];
  summary: {
    byRecommendation: {
      approve: number;
      revise: number;
      reject: number;
    };
    totalIterations: number;
    averageIterationsPerTest: number;
  };
}

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] || "http://localhost:3000";

function WorkflowTestingPage() {
  const { user } = useAuth();
  const { isPageVisibleForUser } = useFeatureFlags();
  const userOrgs = user?.organizations ?? [];

  const [testing, setTesting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<WorkflowTestResult[]>([]);
  const [selectedResult, setSelectedResult] =
    useState<WorkflowTestResult | null>(null);
  const [report, setReport] = useState<WorkflowTestReport | null>(null);

  // Form state for manual testing
  const [fileName, setFileName] = useState("");
  const [fileType, setFileType] = useState<"command" | "hook">("command");
  const [platform, setPlatform] = useState("claude");
  const [content, setContent] = useState("");
  const [testCases, setTestCases] = useState<string[]>([]);
  const [workspaceName, setOrgName] = useState<string | null>(null);

  // Demo mode: pre-populate with realistic test results
  useEffect(() => {
    if (!isDemoMode()) return;
    setResults(DEMO_WORKFLOW_RESULTS);
    setOrgName("acme-corp");
  }, []);

  // Get the first organization for the current user
  useEffect(() => {
    if (isDemoMode()) return;
    const loadOrg = async () => {
      try {
        const orgs = await api.getOrganizations();
        if (orgs.length > 0) {
          setOrgName(orgs[0].name);
        }
      } catch (err) {
        console.error("Failed to load organization:", err);
      }
    };
    loadOrg();
  }, []);

  // #2901: Workflow testing is internal only — gate the entire page
  if (!isPageVisibleForUser('workflow-testing', userOrgs)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
        <Beaker className="w-12 h-12 mb-4" style={{ color: 'var(--text-muted)' }} />
        <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
          Internal Feature
        </h2>
        <p className="text-sm text-center max-w-md" style={{ color: 'var(--text-muted)' }}>
          Workflow testing is only available to internal users.
        </p>
      </div>
    );
  }

  const testSingleWorkflow = async () => {
    if (!workspaceName || !fileName || !content) {
      alert("Please fill in all required fields");
      return;
    }

    setTesting(true);
    try {
      const response = await fetch(
        `${API_BASE}/workspaces/${workspaceName}/workflow-test`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fileName,
            type: fileType,
            platform,
            content,
            testCases: testCases.filter((tc) => tc.trim()),
            maxIterations: 3,
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to test workflow");
      }

      const data = await response.json();
      setResults([data.result, ...results]);
      setSelectedResult(data.result);

      // Clear form
      setFileName("");
      setContent("");
      setTestCases([]);
    } catch (error) {
      console.error("Failed to test workflow:", error);
      alert("Failed to test workflow. Check console for details.");
    } finally {
      setTesting(false);
    }
  };

  const testFromLocalFile = async () => {
    if (!workspaceName) {
      alert("No organization found");
      return;
    }

    // Create file input programmatically
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".md,.json,.ts,.js,.py";

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (e) => {
        const fileContent = e.target?.result as string;
        setFileName(file.name);
        setContent(fileContent);

        // Auto-detect type
        if (file.name.endsWith(".md")) {
          setFileType("command");
        } else if (file.name.includes("hook") || file.name.endsWith(".json")) {
          setFileType("hook");
        }
      };
      reader.readAsText(file);
    };

    input.click();
  };

  const generateReport = async () => {
    if (!workspaceName || results.length === 0) return;

    setLoading(true);
    try {
      const response = await fetch(
        `${API_BASE}/workspaces/${workspaceName}/workflow-test/report`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ results }),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to generate report");
      }

      const data = await response.json();
      setReport(data.report);
    } catch (error) {
      console.error("Failed to generate report:", error);
      alert("Failed to generate report. Check console for details.");
    } finally {
      setLoading(false);
    }
  };

  const downloadReport = () => {
    if (!report) return;

    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `workflow-test-report-${report.workspaceName}-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getRecommendationColor = (recommendation: string) => {
    switch (recommendation) {
      case "approve":
        return "text-[var(--status-success)] bg-[var(--status-success-light)]";
      case "revise":
        return "text-[var(--status-warning-text)] bg-[var(--status-warning-light)]";
      case "reject":
        return "text-[var(--status-danger-text)] bg-[var(--status-danger-light)]";
      default:
        return "text-[var(--text-secondary)] bg-[var(--surface-sunken)]";
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-[var(--status-success)]";
    if (score >= 60) return "text-[var(--status-warning-text)]";
    return "text-[var(--status-danger-text)]";
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <div className="section-badge mb-4">
            <span className="w-2 h-2 rounded-full bg-[var(--status-success)] status-pulse" />
            <span>// WORKFLOW_TESTING</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)] mb-2">
            Workflow Testing
          </h1>
          <p className="text-[var(--text-secondary)] text-sm sm:text-base">
            Test slash commands and hooks in isolated E2B sandboxes before
            deployment
          </p>
        </div>
        <div className="flex gap-3">
          {results.length > 0 && (
            <button
              className="btn-secondary"
              onClick={generateReport}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Generate Report
            </button>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="glass-card p-6">
          <div className="icon-container green mb-4">
            <Upload className="w-6 h-6 text-[var(--status-success)]" />
          </div>
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
            Local File Testing
          </h3>
          <p className="text-[var(--text-secondary)] text-sm mb-4">
            Upload a command or hook file from your local machine for testing
          </p>
          <button
            onClick={testFromLocalFile}
            className="btn-secondary w-full"
            disabled={testing || !workspaceName}
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload File
          </button>
        </div>

        <div className="glass-card p-6">
          <div className="icon-container green mb-4">
            <Terminal className="w-6 h-6 text-[var(--status-success)]" />
          </div>
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">CLI Testing</h3>
          <p className="text-[var(--text-secondary)] text-sm mb-4">
            Test workflows directly from the GAL CLI with sandbox execution
          </p>
          <div className="bg-[var(--surface-sunken)] rounded p-3">
            <code className="text-[var(--status-success)] text-xs">
              gal workflow test ./commands/deploy.md
            </code>
          </div>
        </div>

        <div className="glass-card p-6">
          <div className="icon-container green mb-4">
            <Beaker className="w-6 h-6 text-[var(--status-success)]" />
          </div>
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
            Dashboard Approval
          </h3>
          <p className="text-[var(--text-secondary)] text-sm mb-4">
            Review test results and approve workflows for workspace-wide
            deployment
          </p>
          <div className="text-[var(--text-tertiary)] text-xs">
            {results.filter((r) => r.recommendation === "approve").length}{" "}
            workflows approved
          </div>
        </div>
      </div>

      {/* Test Configuration */}
      <div className="glass-card p-6 mb-8">
        <div className="flex items-center gap-3 mb-6">
          <Beaker className="w-5 h-5 text-[var(--status-success)]" />
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            Test Configuration
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
              File Name
            </label>
            <input
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="my-command.md or pre_tool_use.json"
              className="w-full px-4 py-2 bg-[var(--surface-sunken)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--interactive-primary)]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
              Platform
            </label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="w-full px-4 py-2 bg-[var(--surface-sunken)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--interactive-primary)]"
            >
              <option value="claude">Claude</option>
              <option value="cursor">Cursor</option>
              <option value="gemini">Gemini</option>
              <option value="codex">Codex</option>
              <option value="windsurf">Windsurf</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
              Type
            </label>
            <select
              value={fileType}
              onChange={(e) =>
                setFileType(e.target.value as "command" | "hook")
              }
              className="w-full px-4 py-2 bg-[var(--surface-sunken)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--interactive-primary)]"
            >
              <option value="command">Slash Command (.md)</option>
              <option value="hook">Hook (.json, .py, .js)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
              Test Cases (optional)
            </label>
            <input
              type="text"
              placeholder="Test case 1, Test case 2"
              className="w-full px-4 py-2 bg-[var(--surface-sunken)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--interactive-primary)]"
              onChange={(e) =>
                setTestCases(e.target.value.split(",").map((t) => t.trim()))
              }
            />
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
            Configuration Content
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Paste your command or hook content here..."
            rows={10}
            className="w-full px-4 py-3 bg-[var(--surface-sunken)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--interactive-primary)] font-mono text-sm"
          />
        </div>

        <button
          onClick={testSingleWorkflow}
          disabled={testing || !fileName || !content || !workspaceName}
          className="btn-primary"
        >
          {testing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Testing in Sandbox...
            </>
          ) : (
            <>
              <Play className="w-4 h-4 mr-2" />
              Run Test
            </>
          )}
        </button>
      </div>

      {/* Test Results */}
      {results.length > 0 && (
        <div className="glass-card p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Code className="w-5 h-5 text-[var(--status-success)]" />
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Test Results</h2>
              <span className="text-xs text-[var(--text-tertiary)]">
                ({results.length} tests)
              </span>
            </div>
          </div>

          <div className="space-y-4">
            {results.map((result, idx) => (
              <div
                key={idx}
                onClick={() => setSelectedResult(result)}
                className={`p-4 rounded-lg border cursor-pointer transition-all ${
                  selectedResult === result
                    ? "border-[var(--status-success)] bg-[var(--status-success-light)]"
                    : "border-[var(--border-subtle)] bg-[var(--surface-sunken)] hover:bg-[var(--bg-card-hover)]"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    {result.success ? (
                      <CheckCircle className="w-5 h-5 text-[var(--status-success)]" />
                    ) : (
                      <XCircle className="w-5 h-5 text-[var(--status-danger-text)]" />
                    )}
                    <div>
                      <code className="text-[var(--text-primary)] font-medium">
                        {result.fileName}
                      </code>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-[var(--text-tertiary)]">
                          {result.type}
                        </span>
                        <span className="text-xs text-[var(--text-tertiary)]">
                          &bull;
                        </span>
                        <span className="text-xs text-[var(--text-tertiary)]">
                          {result.platform}
                        </span>
                        <span className="text-xs text-[var(--text-tertiary)]">
                          &bull;
                        </span>
                        <span className="text-xs text-[var(--text-tertiary)]">
                          {result.iterations.length} iteration
                          {result.iterations.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-2xl font-bold ${getScoreColor(result.finalScore)}`}
                    >
                      {result.finalScore}
                    </span>
                    <span
                      className={`px-3 py-1 rounded-lg text-xs font-medium ${getRecommendationColor(result.recommendation)}`}
                    >
                      {result.recommendation.toUpperCase()}
                    </span>
                  </div>
                </div>

                {result.error && (
                  <div className="mt-3 p-3 bg-[var(--status-danger-light)] border border-[var(--status-danger-text)]/30 rounded">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-[var(--status-danger-text)] flex-shrink-0 mt-0.5" />
                      <p className="text-[var(--status-danger-text)] text-sm">
                        {result.error}
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-4 mt-3 text-xs text-[var(--text-tertiary)]">
                  <div className="flex items-center gap-2">
                    <Clock className="w-3 h-3" />
                    {result.executionTimeMs}ms
                  </div>
                  <div>{new Date(result.testedAt).toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detailed Result View */}
      {selectedResult && (
        <div className="glass-card p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Zap className="w-5 h-5 text-[var(--status-success)]" />
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                Detailed Analysis
              </h2>
            </div>
            <button
              onClick={() => setSelectedResult(null)}
              className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Close
            </button>
          </div>

          <div className="space-y-6">
            {selectedResult.iterations.map((iteration, idx) => (
              <div
                key={idx}
                className="border border-[var(--border-subtle)] rounded-lg overflow-hidden"
              >
                <div className="p-4 bg-[var(--surface-sunken)]">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[var(--text-primary)] font-medium">
                      Iteration {iteration.iteration}
                    </h3>
                    <span
                      className={`px-3 py-1 rounded-lg text-xs font-medium ${getRecommendationColor(iteration.evaluation.recommendation)}`}
                    >
                      Score: {iteration.evaluation.score} / 100
                    </span>
                  </div>
                </div>

                <div className="p-4 space-y-4">
                  {/* Execution Result */}
                  <div>
                    <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-2">
                      Execution Output
                    </h4>
                    <div className="bg-[var(--surface-sunken)] rounded p-3">
                      <pre className="text-xs text-[var(--text-primary)] overflow-x-auto whitespace-pre-wrap">
                        {iteration.executionResult.output}
                      </pre>
                      {iteration.executionResult.error && (
                        <div className="mt-2 pt-2 border-t border-[var(--status-danger-text)]/20">
                          <p className="text-xs text-[var(--status-danger-text)]">
                            {iteration.executionResult.error}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Evaluation */}
                  <div>
                    <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-2">
                      LLM Evaluation
                    </h4>
                    <p className="text-sm text-[var(--text-primary)]">
                      {iteration.evaluation.reasoning}
                    </p>
                  </div>

                  {/* Issues */}
                  {iteration.evaluation.issues.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-2">
                        Issues Found
                      </h4>
                      <div className="space-y-2">
                        {iteration.evaluation.issues.map((issue, i) => (
                          <div
                            key={i}
                            className={`p-3 rounded border ${
                              issue.severity === "critical" ||
                              issue.severity === "high"
                                ? "bg-[var(--status-danger-light)] border-[var(--status-danger-text)]/20"
                                : issue.severity === "medium"
                                  ? "bg-[var(--status-warning-light)] border-[var(--status-warning-text)]/20"
                                  : "bg-[var(--status-info-light)] border-[var(--status-info-text)]/20"
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              <span
                                className={`text-xs font-medium px-2 py-1 rounded ${
                                  issue.severity === "critical" ||
                                  issue.severity === "high"
                                    ? "bg-[var(--status-danger-light)] text-[var(--status-danger-text)]"
                                    : issue.severity === "medium"
                                      ? "bg-[var(--status-warning-light)] text-[var(--status-warning-text)]"
                                      : "bg-[var(--status-info-light)] text-[var(--status-info-text)]"
                                }`}
                              >
                                {issue.severity.toUpperCase()}
                              </span>
                              <p className="text-sm text-[var(--text-primary)]">
                                {issue.message}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Suggestions */}
                  {iteration.evaluation.suggestedImprovements.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-2">
                        Suggested Improvements
                      </h4>
                      <ul className="list-disc list-inside space-y-1">
                        {iteration.evaluation.suggestedImprovements.map(
                          (improvement, i) => (
                            <li
                              key={i}
                              className="text-sm text-[var(--text-primary)]"
                            >
                              {improvement}
                            </li>
                          ),
                        )}
                      </ul>
                    </div>
                  )}

                  {/* Logs */}
                  <div>
                    <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-2">
                      Execution Logs
                    </h4>
                    <div className="bg-[var(--surface-sunken)] rounded p-3 max-h-40 overflow-y-auto">
                      {iteration.executionResult.logs.map((log, i) => (
                        <div
                          key={i}
                          className="text-xs text-[var(--text-tertiary)] font-mono"
                        >
                          {log}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Test Report */}
      {report && (
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Settings className="w-5 h-5 text-[var(--status-success)]" />
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Test Report</h2>
            </div>
            <button onClick={downloadReport} className="btn-secondary">
              <Download className="w-4 h-4 mr-2" />
              Download JSON
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            <StatCard
              label="Total Tests"
              value={report.totalTests}
              color="blue"
            />
            <StatCard label="Passed" value={report.passedTests} color="green" />
            <StatCard
              label="Average Score"
              value={`${report.averageScore}%`}
              color={report.averageScore >= 80 ? "green" : "amber"}
            />
            <StatCard
              label="Avg Iterations"
              value={report.summary.averageIterationsPerTest.toFixed(1)}
              color="purple"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <RecommendationCard
              label="Approved"
              count={report.summary.byRecommendation.approve}
              color="green"
            />
            <RecommendationCard
              label="Needs Revision"
              count={report.summary.byRecommendation.revise}
              color="amber"
            />
            <RecommendationCard
              label="Rejected"
              count={report.summary.byRecommendation.reject}
              color="red"
            />
          </div>
        </div>
      )}

      {/* Empty State */}
      {results.length === 0 && (
        <div className="text-center py-12">
          <Beaker className="w-16 h-16 mx-auto mb-4 text-[var(--text-tertiary)] opacity-50" />
          <p className="text-[var(--text-secondary)]">No test results yet</p>
          <p className="text-[var(--text-tertiary)] text-sm mt-1">
            Upload a file or paste configuration content to start testing
          </p>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color: string;
}) {
  const colorClasses = {
    green: "text-[var(--status-success)]",
    blue: "text-[var(--status-info-text)]",
    amber: "text-[var(--status-warning-text)]",
    purple: "text-[var(--brand-gemini)]",
  };

  return (
    <div className="glass-card p-4">
      <p
        className={`text-2xl font-bold ${colorClasses[color as keyof typeof colorClasses]} mb-1`}
      >
        {value}
      </p>
      <p className="text-sm text-[var(--text-secondary)]">{label}</p>
    </div>
  );
}

function RecommendationCard({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  const colorClasses = {
    green: "border-[var(--status-success)]/50 bg-[var(--status-success-light)]",
    amber:
      "border-[var(--status-warning-text)]/50 bg-[var(--status-warning-light)]",
    red: "border-[var(--status-danger-text)]/50 bg-[var(--status-danger-light)]",
  };

  const textClasses = {
    green: "text-[var(--status-success)]",
    amber: "text-[var(--status-warning-text)]",
    red: "text-[var(--status-danger-text)]",
  };

  return (
    <div
      className={`p-4 rounded-lg border ${colorClasses[color as keyof typeof colorClasses]}`}
    >
      <p
        className={`text-3xl font-bold ${textClasses[color as keyof typeof textClasses]} mb-1`}
      >
        {count}
      </p>
      <p className="text-sm text-[var(--text-primary)]">{label}</p>
    </div>
  );
}

export default WorkflowTestingPage;
