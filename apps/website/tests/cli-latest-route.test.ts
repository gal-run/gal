import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const cliLatestRouteSource = readFileSync(
  join(__dirname, "../app/cli/LATEST/route.ts"),
  "utf8",
);

describe("CLI latest endpoint", () => {
  it("uses npm latest so install.sh installs the newest published CLI", () => {
    expect(cliLatestRouteSource).toContain(
      "https://registry.npmjs.org/@scheduler-systems/gal-run/latest",
    );
    expect(cliLatestRouteSource).toContain("force-dynamic");
    expect(cliLatestRouteSource).toContain("cache: 'no-store'");
    expect(cliLatestRouteSource).toContain("'Cache-Control': 'no-store'");
    expect(cliLatestRouteSource).not.toContain(
      "api.github.com/repos/gal-run/gal-run/releases/latest",
    );
    expect(cliLatestRouteSource).not.toContain("0.0.281");
  });
});
