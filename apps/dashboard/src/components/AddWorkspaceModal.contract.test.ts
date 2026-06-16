import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const addWorkspaceModalSource = readFileSync(
  join(__dirname, "./AddWorkspaceModal.tsx"),
  "utf8",
);

describe("add workspace modal contracts", () => {
  it("keeps GitHub App redirects pinned to the installation flow (not settings/installations) (#548)", () => {
    expect(addWorkspaceModalSource).toContain(
      "const installUrl = `https://github.com/apps/${githubAppSlug}/installations/new`",
    );
    expect(addWorkspaceModalSource).toContain(
      "window.location.href = installUrl",
    );
    expect(addWorkspaceModalSource).not.toContain("/settings/installations");
  });
});
