import { describe, expect } from "bun:test"
import { Effect, Exit, Layer } from "effect"
import { BackgroundJob } from "../../src/background/job"
import * as CrossSpawnSpawner from "../../src/effect/cross-spawn-spawner"
import { Scheduler } from "../../src/scheduler/scheduler"
import { SessionID } from "../../src/session/schema"
import { provideTmpdirInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(
  Layer.mergeAll(Scheduler.defaultLayer, BackgroundJob.defaultLayer, CrossSpawnSpawner.defaultLayer),
)

const sessionID = SessionID.make("ses_scheduler_test")

function promptSchedule(title: string, input: Partial<Scheduler.CreateInput> = {}): Scheduler.CreateInput {
  return {
    sessionID,
    title,
    kind: "prompt",
    prompt: `run ${title}`,
    delay: 60_000,
    missed: "skip",
    ...input,
  }
}

describe("Scheduler", () => {
  it.live("creates, lists, and deletes one-shot prompt schedules", () =>
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const scheduler = yield* Scheduler.Service
        const schedule = yield* scheduler.create(promptSchedule("one-shot"))

        expect(schedule.id).toStartWith("cron_")
        expect(schedule.recurring).toBe(false)
        expect(schedule.status).toBe("active")

        const listed = yield* scheduler.list({ sessionID })
        expect(listed.map((item) => item.id)).toContain(schedule.id)

        const deleted = yield* scheduler.delete(schedule.id)
        expect(deleted.status).toBe("deleted")
        expect((yield* scheduler.list({ sessionID })).map((item) => item.id)).not.toContain(schedule.id)
      }),
    ),
  )

  it.live("runs recurring cron schedules and records cron_run jobs", () =>
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const scheduler = yield* Scheduler.Service
        const jobs = yield* BackgroundJob.Service
        let count = 0
        const schedule = yield* scheduler.create(
          promptSchedule("recurring", {
            delay: undefined,
            cron: "* * * * *",
            maxRuns: 2,
          }),
        )

        const first = yield* scheduler.runDue({
          now: schedule.nextRunAt,
          sessionID,
          execute: () =>
            Effect.sync(() => {
              count++
              return `run ${count}`
            }),
        })
        expect(first[0]?.runCount).toBe(1)
        expect(first[0]?.status).toBe("active")
        yield* jobs.wait({ jobID: first[0]!.lastJobID!, timeout: 5_000 })

        const afterFirst = yield* scheduler.get(schedule.id)
        const second = yield* scheduler.runDue({
          now: afterFirst.nextRunAt,
          sessionID,
          execute: () =>
            Effect.sync(() => {
              count++
              return `run ${count}`
            }),
        })

        expect(second[0]?.runCount).toBe(2)
        expect(second[0]?.status).toBe("disabled")

        const done = yield* jobs.wait({ jobID: second[0]!.lastJobID!, timeout: 5_000 })
        expect(done.kind).toBe("cron_run")
        expect(done.status).toBe("exited")
        expect(count).toBe(2)
        const output = yield* jobs.output({ jobID: done.id })
        expect(output.text).toContain("run 2")

        yield* scheduler.delete(schedule.id)
      }),
    ),
  )

  it.live("reloads persisted schedules through a fresh layer", () =>
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const scheduler = yield* Scheduler.Service
        const schedule = yield* scheduler.create(promptSchedule("persisted"))

        const reloaded = yield* Scheduler.Service.use((svc) => svc.get(schedule.id)).pipe(
          Effect.provide(Layer.fresh(Scheduler.defaultLayer)),
        )
        expect(reloaded.id).toBe(schedule.id)
        expect(reloaded.nextRunAt).toBe(schedule.nextRunAt)

        yield* scheduler.delete(schedule.id)
      }),
    ),
  )

  it.live("rejects invalid cron expressions", () =>
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const scheduler = yield* Scheduler.Service
        const exit = yield* scheduler
          .create(promptSchedule("bad cron", { delay: undefined, cron: "bad cron" }))
          .pipe(Effect.exit)
        expect(Exit.isFailure(exit)).toBe(true)
      }),
    ),
  )

  it.live("blocks scheduler creation when disabled", () =>
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const prev = process.env.GAL_CODE_DISABLE_CRON
        process.env.GAL_CODE_DISABLE_CRON = "1"
        try {
          const scheduler = yield* Scheduler.Service
          const exit = yield* scheduler.create(promptSchedule("disabled")).pipe(Effect.exit)
          expect(Exit.isFailure(exit)).toBe(true)
        } finally {
          if (prev === undefined) delete process.env.GAL_CODE_DISABLE_CRON
          else process.env.GAL_CODE_DISABLE_CRON = prev
        }
      }),
    ),
  )
})
