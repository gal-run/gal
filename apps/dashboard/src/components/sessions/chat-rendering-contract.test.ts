import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const structuredLogsViewSource = readFileSync(
  join(__dirname, "./StructuredLogsView.tsx"),
  "utf8",
);

describe("session chat rendering contracts", () => {
  it("keeps user messages right-aligned and rendered as user bubbles (#1458)", () => {
    expect(structuredLogsViewSource).toContain(
      "className={`flex items-start gap-3 px-4 py-3 ${isUser ? 'justify-end' : ''}`}",
    );
    expect(structuredLogsViewSource).toContain(
      "isUser ? 'bg-[var(--status-success-light)] rounded-2xl rounded-br-sm px-4 py-2' : ''",
    );
    expect(structuredLogsViewSource).toContain("{isUser ? 'You' : isSystem ? 'System' : getAgentDisplayName(agent)}");
  });

  it("keeps markdown rendering for assistant/system content instead of raw markup text (#1457)", () => {
    expect(structuredLogsViewSource).toContain(
      "<MarkdownContent content={message.content} />",
    );
    expect(structuredLogsViewSource).toContain(
      "{message.content && (",
    );
  });
});
