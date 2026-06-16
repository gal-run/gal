"use client";

import { Shield, Check, FileText, Clock } from "lucide-react";
import type { Policy } from "@/lib/policy-api";

interface PolicyCardProps {
  policy: Policy;
}

export function PolicyCard({ policy }: PolicyCardProps) {
  const statusColor = policy.isActive
    ? "var(--status-success)"
    : policy.isBuiltin
      ? "var(--accent)"
      : "var(--text-muted)";

  return (
    <div
      className="rounded-xl border p-5 transition-all hover:shadow-md"
      style={{
        borderColor: policy.isActive
          ? "var(--status-success)"
          : "var(--border-subtle)",
        backgroundColor: "var(--surface-raised)",
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-4 h-4" style={{ color: statusColor }} />
            <h3
              className="text-sm font-semibold truncate"
              style={{ color: "var(--text-primary)" }}
            >
              {policy.name}
            </h3>
            {policy.isBuiltin && (
              <span
                className="text-xs px-2 py-0.5 rounded-full"
                style={{
                  backgroundColor: "var(--accent-bg)",
                  color: "var(--accent)",
                }}
              >
                Built-in
              </span>
            )}
            {policy.isActive && (
              <span
                className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1"
                style={{
                  backgroundColor: "var(--status-success-light)",
                  color: "var(--status-success-text)",
                }}
              >
                <Check className="w-3 h-3" />
                Active
              </span>
            )}
          </div>
          {policy.description && (
            <p
              className="text-xs mb-2 line-clamp-2"
              style={{ color: "var(--text-secondary)" }}
            >
              {policy.description}
            </p>
          )}
          <div
            className="flex items-center gap-4 text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            <span className="flex items-center gap-1">
              <FileText className="w-3 h-3" />
              {policy.config?.platform || "claude"}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {new Date(policy.updatedAt).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
