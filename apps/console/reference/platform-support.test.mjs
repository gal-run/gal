import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import test from "node:test";

import { renderSupportedAgentsSection } from "./platform-support.mjs";

function extractMarkedSection(readme, startMarker, endMarker) {
  const start = readme.indexOf(startMarker);
  const end = readme.indexOf(endMarker);

  assert.notEqual(start, -1, `Missing start marker: ${startMarker}`);
  assert.notEqual(end, -1, `Missing end marker: ${endMarker}`);
  assert.ok(end > start, `End marker must appear after start marker: ${endMarker}`);

  return readme.slice(start + startMarker.length, end).trim();
}

test("README supported agents section matches the generated support matrix", () => {
  const referenceDir = fileURLToPath(new URL(".", import.meta.url));
  const readme = readFileSync(join(referenceDir, "..", "README.md"), "utf8");
  const actual = extractMarkedSection(
    readme,
    "<!-- SUPPORTED_AGENTS_START -->",
    "<!-- SUPPORTED_AGENTS_END -->",
  );

  assert.equal(actual, renderSupportedAgentsSection());
});
