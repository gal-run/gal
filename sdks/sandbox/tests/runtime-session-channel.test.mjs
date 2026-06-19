// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";

import { defaultDeniedRunnerEnv, defaultRequiredRunnerEnv } from "../src/contracts.mjs";
import {
  RUNTIME_SESSION_CHANNEL_KIND,
  resolveRuntimeSessionChannel,
  validateRuntimeSessionEnv
} from "../src/runtime-session-channel.mjs";

function validEnv(overrides = {}) {
  return {
    SESSION_ID: "session_123",
    ORGANIZATION_ID: "org_123",
    SELECTED_AGENT: "example-agent",
    INITIAL_PROMPT: "summarize status",
    PROJECT_CONTEXT: "example",
    PROJECT_PATH: "/workspace/repo",
    API_ENDPOINT: "https://api.example.local/sessions/session_123",
    RUNNER_TOKEN: "runner-token",
    SESSION_TOKEN: "session-token",
    ...overrides
  };
}

test("runtime session channel resolves from the startup env only", () => {
  const channel = resolveRuntimeSessionChannel(validEnv());

  assert.equal(channel.kind, RUNTIME_SESSION_CHANNEL_KIND);
  assert.equal(channel.endpoint, "https://api.example.local/sessions/session_123");
  assert.equal(channel.sessionId, "session_123");
  assert.equal(channel.organizationId, "org_123");
  assert.equal(channel.auth.mode, "scoped-session");
  assert.deepEqual(channel.buildHeaders(), {
    authorization: "Bearer session-token",
    "x-runner-token": "runner-token",
    "x-session-id": "session_123",
    "x-organization-id": "org_123"
  });
});

test("runtime session env requires every narrow startup field", () => {
  for (const name of defaultRequiredRunnerEnv) {
    const env = validEnv({ [name]: "" });
    assert.ok(validateRuntimeSessionEnv(env).includes(`env missing ${name}`));
  }
});

test("runtime session env rejects denied dispatch and provider secrets", () => {
  for (const name of defaultDeniedRunnerEnv) {
    const env = validEnv({ [name]: "present" });
    assert.ok(validateRuntimeSessionEnv(env).includes(`env must not include ${name}`));
  }
});

test("a clean runtime session env needs no provider credentials", () => {
  assert.deepEqual(validateRuntimeSessionEnv(validEnv()), []);
});

test("runtime session env rejects unsafe API endpoints and workspace roots", () => {
  assert.match(validateRuntimeSessionEnv(validEnv({ API_ENDPOINT: "not a url" })).join("\n"), /valid URL/);
  assert.match(validateRuntimeSessionEnv(validEnv({ API_ENDPOINT: "http://api.example" })).join("\n"), /must use https/);
  assert.deepEqual(validateRuntimeSessionEnv(validEnv({ API_ENDPOINT: "http://localhost:8080" })), []);
  assert.match(validateRuntimeSessionEnv(validEnv({ PROJECT_PATH: "/tmp/repo" })).join("\n"), /under \/workspace/);
});

test("invalid runtime env fails before runner startup", () => {
  assert.throws(
    () => resolveRuntimeSessionChannel(validEnv({ GITHUB_TOKEN: "x" })),
    (error) =>
      error.code === "SANDBOX_RUNTIME_ENV_INVALID" &&
      error.errors.includes("env must not include GITHUB_TOKEN")
  );
});
