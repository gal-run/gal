import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const organizationGitHubSectionSource = readFileSync(
  join(__dirname, "./OrganizationGitHubSection.tsx"),
  "utf8",
);

describe("organization github section contracts", () => {
  it("keeps sync-state loading/progress wiring explicit for predictable status rendering (#1540, #1360, #1431, #174, #1228)", () => {
    expect(organizationGitHubSectionSource).toContain(
      "const [syncing, setSyncing] = useState(false)",
    );
    expect(organizationGitHubSectionSource).toContain(
      "const [syncProgress, setSyncProgress] = useState<{ current: number; total: number; message: string } | null>(null)",
    );
    expect(organizationGitHubSectionSource).toContain("disabled={syncing}");
    expect(organizationGitHubSectionSource).toContain(
      "syncing ? (syncProgress ? `${syncProgress.current}/${syncProgress.total}` : 'Syncing...') : 'Sync'",
    );
    expect(organizationGitHubSectionSource).toContain(
      "{orgsLoading ? 'Checking...' : isGitHubConnected ? 'GitHub App Connected' : 'Not Connected'}",
    );
  });
});
