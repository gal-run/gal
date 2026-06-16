"use client";

import { useState } from "react";
import { Plus, Trash2, GripVertical } from "lucide-react";

interface Rule {
  id: string;
  type: "allow" | "deny" | "audit";
  pattern?: string;
  description?: string;
}

interface PolicyRuleEditorProps {
  value: Rule[];
  onChange: (rules: Rule[]) => void;
  readOnly?: boolean;
}

export function PolicyRuleEditor({
  value,
  onChange,
  readOnly,
}: PolicyRuleEditorProps) {
  const [newRuleType, setNewRuleType] = useState<"allow" | "deny" | "audit">(
    "deny",
  );

  const addRule = () => {
    const rule: Rule = {
      id: crypto.randomUUID(),
      type: newRuleType,
    };
    onChange([...value, rule]);
  };

  const removeRule = (id: string) => {
    onChange(value.filter((r) => r.id !== id));
  };

  const updateRule = (id: string, updates: Partial<Rule>) => {
    onChange(value.map((r) => (r.id === id ? { ...r, ...updates } : r)));
  };

  const typeColors: Record<
    string,
    { bg: string; text: string; border: string }
  > = {
    allow: {
      bg: "var(--status-success-light)",
      text: "var(--status-success-text)",
      border: "var(--status-success)",
    },
    deny: {
      bg: "var(--status-danger-light)",
      text: "var(--status-danger-text)",
      border: "var(--status-danger)",
    },
    audit: {
      bg: "var(--status-warning-light)",
      text: "var(--status-warning-text)",
      border: "var(--status-warning)",
    },
  };

  return (
    <div className="space-y-3">
      {value.length === 0 ? (
        <div
          className="text-center py-8 rounded-lg border border-dashed"
          style={{
            borderColor: "var(--border-subtle)",
            color: "var(--text-muted)",
          }}
        >
          No rules defined. Add rules to control agent behavior.
        </div>
      ) : (
        <div className="space-y-2">
          {value.map((rule, index) => (
            <div
              key={rule.id}
              className="flex items-start gap-3 p-3 rounded-lg border"
              style={{
                backgroundColor: "var(--surface-sunken)",
                borderColor: typeColors[rule.type].border,
              }}
            >
              {!readOnly && (
                <GripVertical
                  className="w-4 h-4 mt-2 cursor-grab opacity-50"
                  style={{ color: "var(--text-muted)" }}
                />
              )}
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <select
                    value={rule.type}
                    onChange={(e) =>
                      updateRule(rule.id, {
                        type: e.target.value as Rule["type"],
                      })
                    }
                    disabled={readOnly}
                    className="px-2 py-1 text-xs rounded border"
                    style={{
                      backgroundColor: typeColors[rule.type].bg,
                      color: typeColors[rule.type].text,
                      borderColor: typeColors[rule.type].border,
                    }}
                  >
                    <option value="allow">Allow</option>
                    <option value="deny">Deny</option>
                    <option value="audit">Audit</option>
                  </select>
                  <span
                    className="text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Rule {index + 1}
                  </span>
                </div>
                <input
                  type="text"
                  value={rule.pattern || ""}
                  onChange={(e) =>
                    updateRule(rule.id, { pattern: e.target.value })
                  }
                  placeholder="Pattern (e.g., Bash:rmdir *, Write:*.env)"
                  disabled={readOnly}
                  className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-1"
                  style={{
                    backgroundColor: "var(--bg-primary)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-primary)",
                  }}
                />
                <input
                  type="text"
                  value={rule.description || ""}
                  onChange={(e) =>
                    updateRule(rule.id, { description: e.target.value })
                  }
                  placeholder="Description (optional)"
                  disabled={readOnly}
                  className="w-full px-3 py-2 text-xs rounded-lg border focus:outline-none focus:ring-1"
                  style={{
                    backgroundColor: "var(--bg-primary)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-secondary)",
                  }}
                />
              </div>
              {!readOnly && (
                <button
                  onClick={() => removeRule(rule.id)}
                  className="p-1.5 rounded hover:bg-[var(--status-danger-light)] transition-colors"
                  style={{ color: "var(--text-muted)" }}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!readOnly && (
        <div className="flex items-center gap-2">
          <select
            value={newRuleType}
            onChange={(e) =>
              setNewRuleType(e.target.value as "allow" | "deny" | "audit")
            }
            className="px-3 py-2 text-sm rounded-lg border"
            style={{
              backgroundColor: "var(--bg-primary)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-primary)",
            }}
          >
            <option value="allow">Allow</option>
            <option value="deny">Deny</option>
            <option value="audit">Audit</option>
          </select>
          <button
            onClick={addRule}
            className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-dashed transition-colors"
            style={{
              borderColor: "var(--border-interactive)",
              color: "var(--text-secondary)",
            }}
          >
            <Plus className="w-4 h-4" />
            Add Rule
          </button>
        </div>
      )}
    </div>
  );
}
