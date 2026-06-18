import z from "zod"
import { BusEvent } from "@/bus/bus-event"
import { Bus } from "@/bus"
import { BackgroundJob } from "@/background/job"
import { makeRuntime } from "@/effect/run-service"
import { Storage } from "@/storage/storage"
import { MessageID, SessionID } from "@/session/schema"
import { Cause, Context, Effect, Layer } from "effect"
import { ulid } from "ulid"

export namespace Scheduler {
  const MAX_TIMER = 2_147_483_647

  export const Info = z
    .object({
      id: z.string(),
      sessionID: SessionID.zod,
      messageID: MessageID.zod.optional(),
      title: z.string(),
      kind: z.enum(["prompt", "shell", "subagent"]),
      prompt: z.string().optional(),
      command: z.string().optional(),
      agent: z.string().optional(),
      cron: z.string().optional(),
      at: z.number().optional(),
      delay: z.number().optional(),
      timezone: z.string().optional(),
      recurring: z.boolean(),
      status: z.enum(["active", "disabled", "deleted"]),
      missed: z.enum(["skip", "catch_up_once", "fail_closed"]),
      createdAt: z.number(),
      updatedAt: z.number(),
      nextRunAt: z.number(),
      lastRunAt: z.number().optional(),
      runCount: z.number(),
      maxRuns: z.number().optional(),
      lastJobID: z.string().optional(),
      error: z.string().optional(),
    })
    .meta({
      ref: "Schedule",
    })
  export type Info = z.infer<typeof Info>

  export const CreateInput = z.object({
    sessionID: SessionID.zod,
    messageID: MessageID.zod.optional(),
    title: z.string(),
    kind: z.enum(["prompt", "shell", "subagent"]).default("prompt"),
    prompt: z.string().optional(),
    command: z.string().optional(),
    agent: z.string().optional(),
    cron: z.string().optional(),
    at: z.number().optional(),
    delay: z.number().optional(),
    timezone: z.string().optional(),
    missed: z.enum(["skip", "catch_up_once", "fail_closed"]).default("skip"),
    maxRuns: z.number().optional(),
  })
  export type CreateInput = z.infer<typeof CreateInput>

  export const Event = {
    Created: BusEvent.define("schedule.created", z.object({ scheduleID: z.string(), info: Info })),
    Updated: BusEvent.define("schedule.updated", z.object({ scheduleID: z.string(), info: Info })),
    Deleted: BusEvent.define("schedule.deleted", z.object({ scheduleID: z.string(), info: Info })),
    Fired: BusEvent.define(
      "schedule.fired",
      z.object({ scheduleID: z.string(), info: Info, jobID: z.string().optional() }),
    ),
  }

  type State = {
    timers: Map<string, ReturnType<typeof setTimeout>>
  }

  type DueInput = {
    now?: number
    sessionID?: SessionID
    execute?: (schedule: Info) => Effect.Effect<string | void, unknown>
  }

  export interface Interface {
    readonly create: (input: CreateInput) => Effect.Effect<Info>
    readonly list: (input?: { sessionID?: SessionID; includeDeleted?: boolean }) => Effect.Effect<Info[]>
    readonly get: (scheduleID: string) => Effect.Effect<Info>
    readonly delete: (scheduleID: string) => Effect.Effect<Info>
    readonly runDue: (input?: DueInput) => Effect.Effect<Info[]>
  }

  export class Service extends Context.Service<Service, Interface>()("@gal-code/Scheduler") {}

  function key(id: string) {
    return ["schedule", id]
  }

  const fatal = <A, E, R>(self: Effect.Effect<A, E, R>) => self.pipe(Effect.catch(Effect.die))

  function disabled() {
    return process.env.GAL_CODE_DISABLE_CRON === "1"
  }

  function parseField(field: string, min: number, max: number, normalize?: (value: number) => number) {
    const values = new Set<number>()
    for (const raw of field.split(",")) {
      const part = raw.trim()
      if (!part) throw new Error(`Invalid cron field "${field}"`)
      if (part === "*") {
        for (let value = min; value <= max; value++) values.add(normalize?.(value) ?? value)
        continue
      }
      if (part.startsWith("*/")) {
        const step = Number(part.slice(2))
        if (!Number.isInteger(step) || step <= 0) throw new Error(`Invalid cron step "${part}"`)
        for (let value = min; value <= max; value += step) values.add(normalize?.(value) ?? value)
        continue
      }
      const value = Number(part)
      if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid cron value "${part}"`)
      values.add(normalize?.(value) ?? value)
    }
    return values
  }

  function parseCron(cron: string) {
    const parts = cron.trim().split(/\s+/)
    if (parts.length !== 5) throw new Error("Cron schedules must use 5 fields: minute hour day month day-of-week")
    return {
      minute: parseField(parts[0]!, 0, 59),
      hour: parseField(parts[1]!, 0, 23),
      day: parseField(parts[2]!, 1, 31),
      month: parseField(parts[3]!, 1, 12),
      dow: parseField(parts[4]!, 0, 7, (value) => (value === 7 ? 0 : value)),
    }
  }

  function nextCron(cron: string, after: number) {
    const parsed = parseCron(cron)
    const cursor = new Date(after)
    cursor.setSeconds(0, 0)
    cursor.setMinutes(cursor.getMinutes() + 1)
    const max = after + 366 * 24 * 60 * 60 * 1000
    while (cursor.getTime() <= max) {
      if (
        parsed.minute.has(cursor.getMinutes()) &&
        parsed.hour.has(cursor.getHours()) &&
        parsed.day.has(cursor.getDate()) &&
        parsed.month.has(cursor.getMonth() + 1) &&
        parsed.dow.has(cursor.getDay())
      ) {
        return cursor.getTime()
      }
      cursor.setMinutes(cursor.getMinutes() + 1)
    }
    throw new Error(`Cron expression has no run time in the next year: ${cron}`)
  }

  function nextFrom(input: CreateInput, now: number) {
    const modes = [input.cron, input.at, input.delay].filter((item) => item !== undefined)
    if (modes.length !== 1) throw new Error("Provide exactly one of cron, at, or delay")
    if (input.kind === "prompt" && !input.prompt) throw new Error("Prompt schedules require a prompt")
    if ((input.kind === "shell" || input.kind === "subagent") && !input.command && !input.prompt) {
      throw new Error(`${input.kind} schedules require a command or prompt`)
    }
    if (input.cron) return nextCron(input.cron, now)
    if (input.at !== undefined) return input.at
    if (input.delay !== undefined) {
      if (input.delay < 0) throw new Error("delay must be non-negative")
      return now + input.delay
    }
    throw new Error("Invalid schedule")
  }

  export const layer: Layer.Layer<Service, never, Storage.Service | Bus.Service | BackgroundJob.Service> = Layer.effect(
    Service,
    Effect.gen(function* () {
      const storage = yield* Storage.Service
      const bus = yield* Bus.Service
      const jobs = yield* BackgroundJob.Service
      const state: State = { timers: new Map() }

      const get: Interface["get"] = Effect.fn("Scheduler.get")(function* (scheduleID) {
        return yield* fatal(storage.read<Info>(key(scheduleID)))
      })

      const save = Effect.fn("Scheduler.save")(function* (info: Info) {
        yield* fatal(storage.write(key(info.id), info))
        yield* bus.publish(Event.Updated, { scheduleID: info.id, info })
        return info
      })

      const list: Interface["list"] = Effect.fn("Scheduler.list")(function* (input) {
        const keys = yield* fatal(storage.list(["schedule"]))
        const items = yield* Effect.forEach(
          keys,
          (item) => storage.read<Info>(item).pipe(Effect.catch(() => Effect.succeed(undefined))),
          { concurrency: "unbounded" },
        )
        return items
          .filter((item): item is Info => Boolean(item))
          .filter((item) => input?.includeDeleted || item.status !== "deleted")
          .filter((item) => !input?.sessionID || item.sessionID === input.sessionID)
          .toSorted((a, b) => a.nextRunAt - b.nextRunAt)
      })

      const clearTimer = Effect.fn("Scheduler.clearTimer")(function* (id: string) {
        const timer = state.timers.get(id)
        if (timer) clearTimeout(timer)
        state.timers.delete(id)
      })

      const scheduleTimer = Effect.fn("Scheduler.scheduleTimer")(function* (info: Info) {
        yield* clearTimer(info.id)
        if (disabled() || info.status !== "active") return
        const delay = Math.max(0, Math.min(MAX_TIMER, info.nextRunAt - Date.now()))
        const timer = setTimeout(() => {
          Effect.runFork(runDue({ now: Date.now() }).pipe(Effect.catchCause(() => Effect.void)))
        }, delay)
        state.timers.set(info.id, timer)
      })

      const executeDefault = Effect.fn("Scheduler.executeDefault")(function* (info: Info) {
        if (info.kind !== "prompt") {
          return `Scheduled ${info.kind} is due: ${info.command ?? info.prompt ?? info.title}`
        }
        const mod = yield* Effect.promise(() => import("@/session/prompt"))
        const result = yield* Effect.promise(() =>
          mod.SessionPrompt.prompt({
            sessionID: info.sessionID,
            agent: info.agent ?? "build",
            parts: [{ type: "text", text: info.prompt ?? "" }],
          }),
        )
        return `Scheduled prompt executed: ${result.info.id}`
      })

      const execute = Effect.fn("Scheduler.execute")(function* (info: Info, input?: DueInput) {
        const job = yield* jobs.start({
          kind: "cron_run",
          sessionID: info.sessionID,
          messageID: info.messageID,
          title: info.title,
          description: `Scheduled ${info.kind}: ${info.title}`,
          command: info.command ?? info.prompt,
          run: () =>
            (input?.execute ? input.execute(info) : executeDefault(info)).pipe(
              Effect.map((output) => ({
                status: "exited" as const,
                output: output ? String(output) : `Scheduled ${info.kind} completed`,
                exit: 0,
              })),
              Effect.catchCause((cause) => {
                const defect = Cause.squash(cause)
                const message = defect instanceof Error ? defect.message : String(defect)
                return Effect.succeed({
                  status: "failed" as const,
                  output: `Scheduled ${info.kind} failed: ${message}`,
                  error: message,
                  exit: null,
                })
              }),
            ),
        })
        yield* bus.publish(Event.Fired, { scheduleID: info.id, info, jobID: job.id })
        return job
      })

      const create: Interface["create"] = Effect.fn("Scheduler.create")(function* (input) {
        if (disabled()) return yield* Effect.die(new Error("GAL_CODE_DISABLE_CRON=1 disables scheduler creation"))
        const now = Date.now()
        const nextRunAt = nextFrom(input, now)
        const info: Info = {
          id: "cron_" + ulid(),
          sessionID: input.sessionID,
          messageID: input.messageID,
          title: input.title,
          kind: input.kind,
          prompt: input.prompt,
          command: input.command,
          agent: input.agent,
          cron: input.cron,
          at: input.at,
          delay: input.delay,
          timezone: input.timezone,
          recurring: Boolean(input.cron),
          missed: input.missed,
          status: "active",
          createdAt: now,
          updatedAt: now,
          nextRunAt,
          runCount: 0,
          maxRuns: input.maxRuns,
        }
        yield* fatal(storage.write(key(info.id), info))
        yield* bus.publish(Event.Created, { scheduleID: info.id, info })
        yield* scheduleTimer(info)
        return info
      })

      const remove: Interface["delete"] = Effect.fn("Scheduler.delete")(function* (scheduleID) {
        const info = yield* get(scheduleID)
        const next = yield* save({ ...info, status: "deleted", updatedAt: Date.now() })
        yield* clearTimer(scheduleID)
        yield* bus.publish(Event.Deleted, { scheduleID, info: next })
        return next
      })

      const runDue: Interface["runDue"] = Effect.fn("Scheduler.runDue")(function* (input) {
        if (disabled()) return []
        const now = input?.now ?? Date.now()
        const due = (yield* list({ sessionID: input?.sessionID })).filter(
          (item) => item.status === "active" && item.nextRunAt <= now,
        )
        const updated: Info[] = []
        for (const item of due) {
          const job = yield* execute(item, input)
          const runCount = item.runCount + 1
          const done = item.maxRuns !== undefined && runCount >= item.maxRuns
          const status = item.cron && !done ? "active" : "disabled"
          const nextRunAt = item.cron && !done ? nextCron(item.cron, now) : item.nextRunAt
          const next = yield* save({
            ...item,
            status,
            lastRunAt: now,
            nextRunAt,
            runCount,
            lastJobID: job.id,
            updatedAt: Date.now(),
          })
          yield* scheduleTimer(next)
          updated.push(next)
        }
        return updated
      })

      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          for (const timer of state.timers.values()) clearTimeout(timer)
          state.timers.clear()
        }),
      )
      for (const item of yield* list()) yield* scheduleTimer(item)

      return Service.of({
        create,
        list,
        get,
        delete: remove,
        runDue,
      })
    }),
  )

  export const defaultLayer = layer.pipe(
    Layer.provide(Storage.defaultLayer),
    Layer.provide(Bus.layer),
    Layer.provide(BackgroundJob.defaultLayer),
  )

  const { runPromise } = makeRuntime(Service, defaultLayer)

  export async function create(input: CreateInput) {
    return runPromise((svc) => svc.create(input))
  }

  export async function list(input?: { sessionID?: SessionID; includeDeleted?: boolean }) {
    return runPromise((svc) => svc.list(input))
  }

  export async function get(scheduleID: string) {
    return runPromise((svc) => svc.get(scheduleID))
  }

  export async function remove(scheduleID: string) {
    return runPromise((svc) => svc.delete(scheduleID))
  }
}
