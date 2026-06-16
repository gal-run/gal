// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultDeniedLaunchBackends,
  defaultDeniedRunnerEnv,
  referenceSandboxPlan,
  validateSandboxPlan
} from "../src/contracts.mjs";

test("reference sandbox plan satisfies the contract", () => {
  assert.deepEqual(validateSandboxPlan(referenceSandboxPlan), []);
});

test("default-denied dispatch backends stay denied", () => {
  for (const backend of ["gha", "github-actions", "warm-pool"]) {
    assert.ok(defaultDeniedLaunchBackends.includes(backend), `${backend} should stay denied`);
    assert.match(
      validateSandboxPlan({ ...referenceSandboxPlan, launchBackend: backend }).join("\n"),
      /denied|must be one of/
    );
    assert.match(
      validateSandboxPlan({ ...referenceSandboxPlan, dispatchBuses: [backend] }).join("\n"),
      /denied|dispatch bus/
    );
  }
});

test("an explicit allowlist rejects unlisted launch backends and buses", () => {
  const options = {
    allowedLaunchBackends: ["example-runtime"],
    allowedDispatchBuses: ["example-bus"]
  };
  assert.deepEqual(validateSandboxPlan(referenceSandboxPlan, options), []);
  assert.match(
    validateSandboxPlan({ ...referenceSandboxPlan, launchBackend: "other" }, options).join("\n"),
    /must be one of/
  );
  assert.match(
    validateSandboxPlan({ ...referenceSandboxPlan, dispatchBuses: ["other-bus"] }, options).join("\n"),
    /not allowed/
  );
});

test("runner environment does not carry provider or dispatch secrets", () => {
  for (const envName of defaultDeniedRunnerEnv) {
    const errors = validateSandboxPlan({
      ...referenceSandboxPlan,
      runnerEnv: [...referenceSandboxPlan.runnerEnv, envName]
    });
    assert.ok(errors.includes(`runnerEnv must not include ${envName}`));
  }
});

test("repo hydration cannot use warm pool or alternate workspace roots", () => {
  assert.match(
    validateSandboxPlan({
      ...referenceSandboxPlan,
      repoHydration: { mode: "warm-pool", workspacePath: "/workspace" }
    }).join("\n"),
    /repoHydration.mode warm-pool is denied|repoHydration.mode must be checkout/
  );

  assert.match(
    validateSandboxPlan({
      ...referenceSandboxPlan,
      repoHydration: { mode: "checkout", workspacePath: "/tmp/cache" }
    }).join("\n"),
    /repoHydration.workspacePath must be \/workspace/
  );
});

test("weak pod or container enforcement is rejected", () => {
  const errors = validateSandboxPlan({
    ...referenceSandboxPlan,
    namespace: "default",
    runtimeClassName: "runc",
    podSecurityContext: {
      ...referenceSandboxPlan.podSecurityContext,
      automountServiceAccountToken: true,
      runAsNonRoot: false,
      seccompProfile: "Unconfined"
    },
    containerSecurityContext: {
      ...referenceSandboxPlan.containerSecurityContext,
      allowPrivilegeEscalation: true,
      readOnlyRootFilesystem: false,
      runAsNonRoot: false,
      capabilitiesDrop: []
    },
    networkPolicy: {
      defaultDeny: false,
      egressMode: "open"
    }
  });

  assert.match(errors.join("\n"), /namespace must be explicit/);
  assert.match(errors.join("\n"), /runtimeClassName must use a Kata runtime class/);
  assert.match(errors.join("\n"), /automountServiceAccountToken must be false/);
  assert.match(errors.join("\n"), /runAsNonRoot must be true/);
  assert.match(errors.join("\n"), /seccompProfile must be one of/);
  assert.match(errors.join("\n"), /allowPrivilegeEscalation must be false/);
  assert.match(errors.join("\n"), /readOnlyRootFilesystem must be true/);
  assert.match(errors.join("\n"), /capabilitiesDrop must include ALL/);
  assert.match(errors.join("\n"), /networkPolicy.defaultDeny must be true/);
  assert.match(errors.join("\n"), /networkPolicy.egressMode must be allowlist/);
});
