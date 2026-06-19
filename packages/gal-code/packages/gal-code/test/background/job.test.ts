import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import * as CrossSpawnSpawner from "../../src/effect/cross-spawn-spawner"
import { BackgroundJob } from "../../src/background/job"
import { SessionID } from "../../src/session/schema"
import { Shell } from "../../src/shell/shell"
import { provideTmpdirInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.mergeAll(BackgroundJob.defaultLayer, CrossSpawnSpawner.defaultLayer))

const sessionID = SessionID.make("ses_background_test")

function shellInfo() {
  const shell = process.platform === "win32" ? Shell.acceptable() : "/bin/sh"
  return { shell, name: Shell.name(shell) }
}

function bunCommand(shell: { shell: string; name: string }, script: string) {
  const exe = process.platform === "win32" ? process.execPath.replaceAll("\\", "/") : process.execPath
  const cmd = `${JSON.stringify(exe)} -e ${JSON.stringify(script)}`
  if (process.platform === "win32" && (shell.name === "powershell" || shell.name === "pwsh")) return `& ${cmd}`
  return cmd
}

describe("BackgroundJob", () => {
  it.live("runs shell jobs and retains output", () =>
    provideTmpdirInstance((dir) =>
      Effect.gen(function* () {
        const jobs = yield* BackgroundJob.Service
        const shell = shellInfo()
        const timeout = process.platform === "win32" ? 20_000 : 5_000
        const job = yield* jobs.startShell({
          sessionID,
          title: "background output",
          description: "Capture output from a background shell job",
          command: bunCommand(shell, "console.log('background-ok')"),
          cwd: dir,
          shell: shell.shell,
          name: shell.name,
          env: process.env,
          timeout,
        })

        expect(job.id).toStartWith("job_")
        expect(job.status).toBe("running")

        const done = yield* jobs.wait({ jobID: job.id, timeout })
        expect(done.status).toBe("exited")
        expect(done.exit).toBe(0)

        const output = yield* jobs.output({ jobID: job.id })
        expect(output.text).toContain("background-ok")
        expect(output.next).toBeGreaterThan(0)

        const list = yield* jobs.list({ sessionID })
        expect(list.map((item) => item.id)).toContain(job.id)
      }),
    ),
  )

  it.live("cancels running shell jobs", () =>
    provideTmpdirInstance((dir) =>
      Effect.gen(function* () {
        const jobs = yield* BackgroundJob.Service
        const shell = shellInfo()
        const job = yield* jobs.startShell({
          sessionID,
          title: "background cancel",
          description: "Cancel a long-running shell job",
          command: bunCommand(shell, "setTimeout(() => {}, 10_000)"),
          cwd: dir,
          shell: shell.shell,
          name: shell.name,
          env: process.env,
          timeout: 15_000,
        })

        const cancelled = yield* jobs.cancel(job.id)
        expect(cancelled.status).toBe("cancelled")
        expect(cancelled.exit).toBeNull()

        const stored = yield* jobs.get(job.id)
        expect(stored.status).toBe("cancelled")
      }),
    ),
  )
})
