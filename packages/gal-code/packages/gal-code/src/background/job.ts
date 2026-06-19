import z from "zod"
import { BusEvent } from "@/bus/bus-event"
import { Bus } from "@/bus"
import { InstanceState } from "@/effect/instance-state"
import { makeRuntime } from "@/effect/run-service"
import { Storage } from "@/storage/storage"
import { MessageID, SessionID } from "@/session/schema"
import { Effect, Deferred, Fiber, Layer, Scope, Stream, Context, Cause, Exit } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner"
import * as CrossSpawnSpawner from "@/effect/cross-spawn-spawner"
import { ulid } from "ulid"

export namespace BackgroundJob {
  const MAX_BYTES = 256 * 1024
  const Chunk = z.object({
    cursor: z.number(),
    time: z.number(),
    text: z.string(),
  })

  const OutputFile = z.object({
    cursor: z.number(),
    chunks: Chunk.array(),
    truncated: z.boolean().optional(),
  })

  export const Info = z
    .object({
      id: z.string(),
      kind: z.enum(["bash", "pty", "subagent", "prompt", "cron_run"]),
      status: z.enum(["queued", "running", "waiting", "exited", "failed", "cancelled"]),
      sessionID: SessionID.zod,
      messageID: MessageID.zod.optional(),
      callID: z.string().optional(),
      childSessionID: SessionID.zod.optional(),
      ptyID: z.string().optional(),
      pid: z.number().optional(),
      title: z.string().optional(),
      description: z.string().optional(),
      command: z.string().optional(),
      cwd: z.string().optional(),
      createdAt: z.number(),
      updatedAt: z.number(),
      startedAt: z.number().optional(),
      completedAt: z.number().optional(),
      exit: z.number().nullable().optional(),
      signal: z.string().optional(),
      error: z.string().optional(),
      outputCursor: z.number().optional(),
      truncated: z.boolean().optional(),
    })
    .meta({
      ref: "BackgroundJob",
    })
  export type Info = z.infer<typeof Info>

  export const Output = z
    .object({
      jobID: z.string(),
      cursor: z.number(),
      next: z.number(),
      text: z.string(),
      chunks: Chunk.array(),
      truncated: z.boolean(),
    })
    .meta({
      ref: "BackgroundJobOutput",
    })
  export type Output = z.infer<typeof Output>

  export const Event = {
    Created: BusEvent.define(
      "background.created",
      z.object({
        jobID: z.string(),
        info: Info,
      }),
    ),
    Updated: BusEvent.define(
      "background.updated",
      z.object({
        jobID: z.string(),
        info: Info,
      }),
    ),
    Output: BusEvent.define(
      "background.output",
      z.object({
        jobID: z.string(),
        cursor: z.number(),
        text: z.string(),
      }),
    ),
    Exited: BusEvent.define(
      "background.exited",
      z.object({
        jobID: z.string(),
        info: Info,
      }),
    ),
  }

  type Running = {
    fiber: Fiber.Fiber<Info, never>
    done: Deferred.Deferred<Info, never>
    cancel: Deferred.Deferred<void, never>
  }

  type State = {
    running: Map<string, Running>
  }

  export type StartResult = {
    status?: Extract<Info["status"], "exited" | "failed" | "cancelled">
    output?: string
    exit?: number | null
    error?: string
  }

  export type StartInput = {
    kind: Exclude<Info["kind"], "bash">
    sessionID: SessionID
    messageID?: MessageID
    callID?: string
    childSessionID?: SessionID
    ptyID?: string
    title?: string
    description?: string
    command?: string
    cwd?: string
    run: (input: { job: Info; cancel: Effect.Effect<void> }) => Effect.Effect<StartResult | void, unknown>
  }

  type ShellExit = { kind: "exit"; code: number } | { kind: "cancel"; code: null } | { kind: "timeout"; code: null }

  export interface Interface {
    readonly list: (input?: { sessionID?: SessionID }) => Effect.Effect<Info[]>
    readonly get: (jobID: string) => Effect.Effect<Info>
    readonly output: (input: { jobID: string; cursor?: number }) => Effect.Effect<Output>
    readonly wait: (input: { jobID: string; timeout?: number }) => Effect.Effect<Info>
    readonly cancel: (jobID: string) => Effect.Effect<Info>
    readonly write: (input: { jobID: string; text: string }) => Effect.Effect<Info>
    readonly start: (input: StartInput) => Effect.Effect<Info>
    readonly startShell: (input: {
      sessionID: SessionID
      messageID?: MessageID
      callID?: string
      title?: string
      description?: string
      command: string
      cwd: string
      shell: string
      args?: string[]
      name: string
      env: NodeJS.ProcessEnv
      timeout?: number
    }) => Effect.Effect<Info>
  }

  export class Service extends Context.Service<Service, Interface>()("@gal-code/BackgroundJob") {}

  function key(id: string) {
    return ["background", "job", id]
  }

  function outputKey(id: string) {
    return ["background", "output", id]
  }

  const empty: z.infer<typeof OutputFile> = { cursor: 0, chunks: [], truncated: false }

  const fatal = <A, E, R>(self: Effect.Effect<A, E, R>) => self.pipe(Effect.catch(Effect.die))

  function command(input: Parameters<Interface["startShell"]>[0]) {
    if (input.args) {
      return ChildProcess.make(input.shell, input.args, {
        cwd: input.cwd,
        env: input.env,
        stdin: "ignore",
        detached: process.platform !== "win32",
        forceKillAfter: "3 seconds",
      })
    }

    if (process.platform === "win32" && (input.name === "powershell" || input.name === "pwsh")) {
      return ChildProcess.make(input.shell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", input.command], {
        cwd: input.cwd,
        env: input.env,
        stdin: "ignore",
        detached: false,
        forceKillAfter: "3 seconds",
      })
    }

    return ChildProcess.make(input.command, [], {
      shell: input.shell,
      cwd: input.cwd,
      env: input.env,
      stdin: "ignore",
      detached: process.platform !== "win32",
      forceKillAfter: "3 seconds",
    })
  }

  export const layer: Layer.Layer<Service, never, Storage.Service | Bus.Service | ChildProcessSpawner> = Layer.effect(
    Service,
    Effect.gen(function* () {
      const storage = yield* Storage.Service
      const bus = yield* Bus.Service
      const spawner = yield* ChildProcessSpawner
      const scope = yield* Scope.Scope
      const state = yield* InstanceState.make<State>(
        Effect.fn("BackgroundJob.state")(() => Effect.succeed({ running: new Map() })),
      )

      const readOutput = Effect.fn("BackgroundJob.readOutput")(function* (id: string) {
        return yield* storage
          .read<z.infer<typeof OutputFile>>(outputKey(id))
          .pipe(Effect.catch(() => Effect.succeed(empty)))
      })

      const get: Interface["get"] = Effect.fn("BackgroundJob.get")(function* (jobID: string) {
        return yield* fatal(storage.read<Info>(key(jobID)))
      })

      const save = Effect.fn("BackgroundJob.save")(function* (info: Info) {
        yield* fatal(storage.write(key(info.id), info))
        yield* bus.publish(Event.Updated, { jobID: info.id, info })
        if (["exited", "failed", "cancelled"].includes(info.status)) {
          yield* bus.publish(Event.Exited, { jobID: info.id, info })
        }
        return info
      })

      const patch = Effect.fn("BackgroundJob.patch")(function* (jobID: string, fn: (info: Info) => Info) {
        const info = yield* get(jobID)
        return yield* save(fn({ ...info, updatedAt: Date.now() }))
      })

      const append = Effect.fn("BackgroundJob.append")(function* (jobID: string, text: string) {
        if (!text) return
        const prev = yield* readOutput(jobID)
        const chunk = {
          cursor: prev.cursor,
          time: Date.now(),
          text,
        }
        const chunks = [...prev.chunks, chunk]
        let bytes = chunks.reduce((sum, item) => sum + Buffer.byteLength(item.text), 0)
        let truncated = prev.truncated ?? false
        while (bytes > MAX_BYTES && chunks.length > 0) {
          const item = chunks.shift()!
          bytes -= Buffer.byteLength(item.text)
          truncated = true
        }
        const next = {
          cursor: prev.cursor + 1,
          chunks,
          truncated,
        }
        yield* fatal(storage.write(outputKey(jobID), next))
        yield* patch(jobID, (info) => ({ ...info, outputCursor: next.cursor, truncated }))
        yield* bus.publish(Event.Output, { jobID, cursor: chunk.cursor, text })
      })

      const runShell = Effect.fn("BackgroundJob.runShell")(function* (
        job: Info,
        input: Parameters<Interface["startShell"]>[0],
        cancel: Deferred.Deferred<void, never>,
      ) {
        const exit = yield* Effect.scoped(
          Effect.gen(function* () {
            const handle = yield* spawner.spawn(command(input))
            const pid = Number(handle.pid)
            if (Number.isFinite(pid)) yield* patch(job.id, (info) => ({ ...info, pid }))

            const output = yield* Stream.runForEach(Stream.decodeText(handle.all), (chunk) =>
              append(job.id, chunk),
            ).pipe(Effect.forkScoped)

            const waiters: Array<Effect.Effect<ShellExit, unknown>> = [
              handle.exitCode.pipe(Effect.map((code): ShellExit => ({ kind: "exit", code }))),
              Deferred.await(cancel).pipe(Effect.map((): ShellExit => ({ kind: "cancel", code: null }))),
            ]
            if (input.timeout !== undefined) {
              waiters.push(
                Effect.sleep(`${input.timeout} millis`).pipe(
                  Effect.map((): ShellExit => ({ kind: "timeout", code: null })),
                ),
              )
            }
            const result = yield* Effect.raceAll(waiters)
            if (result.kind !== "exit") yield* handle.kill({ forceKillAfter: "3 seconds" }).pipe(Effect.orDie)
            yield* Fiber.join(output).pipe(Effect.catchCause(() => Effect.void))
            return result
          }),
        )

        if (exit.kind === "cancel") {
          return yield* patch(job.id, (info) => ({
            ...info,
            status: "cancelled",
            completedAt: Date.now(),
            exit: null,
          }))
        }

        if (exit.kind === "timeout") {
          return yield* patch(job.id, (info) => ({
            ...info,
            status: "failed",
            completedAt: Date.now(),
            exit: null,
            error: `Command exceeded timeout ${input.timeout} ms`,
          }))
        }

        return yield* patch(job.id, (info) => ({
          ...info,
          status: "exited",
          completedAt: Date.now(),
          exit: Number(exit.code),
        }))
      })

      const list: Interface["list"] = Effect.fn("BackgroundJob.list")(function* (input) {
        const keys = yield* fatal(storage.list(["background", "job"]))
        const jobs = yield* Effect.forEach(
          keys,
          (item) => storage.read<Info>(item).pipe(Effect.catch(() => Effect.succeed(undefined))),
          { concurrency: "unbounded" },
        )
        return jobs
          .filter((item): item is Info => Boolean(item))
          .filter((item) => !input?.sessionID || item.sessionID === input.sessionID)
          .toSorted((a, b) => b.createdAt - a.createdAt)
      })

      const output: Interface["output"] = Effect.fn("BackgroundJob.output")(function* (input) {
        const file = yield* readOutput(input.jobID)
        const cursor = input.cursor ?? 0
        const chunks = file.chunks.filter((item) => item.cursor >= cursor)
        return {
          jobID: input.jobID,
          cursor,
          next: file.cursor,
          chunks,
          text: chunks.map((item) => item.text).join(""),
          truncated: file.truncated ?? false,
        }
      })

      const wait: Interface["wait"] = Effect.fn("BackgroundJob.wait")(function* (input) {
        const s = yield* InstanceState.get(state)
        const running = s.running.get(input.jobID)
        if (!running) return yield* get(input.jobID)
        if (!input.timeout) return yield* Deferred.await(running.done)
        return yield* Effect.race(
          Deferred.await(running.done),
          Effect.sleep(`${input.timeout} millis`).pipe(Effect.flatMap(() => get(input.jobID))),
        )
      })

      const cancel: Interface["cancel"] = Effect.fn("BackgroundJob.cancel")(function* (jobID: string) {
        const s = yield* InstanceState.get(state)
        const running = s.running.get(jobID)
        if (running) {
          yield* Deferred.succeed(running.cancel, undefined)
          return yield* Deferred.await(running.done)
        }
        const info = yield* get(jobID)
        if (!["queued", "running", "waiting"].includes(info.status)) return info
        return yield* patch(jobID, (item) => ({
          ...item,
          status: "cancelled",
          completedAt: Date.now(),
          exit: null,
        }))
      })

      const write: Interface["write"] = Effect.fn("BackgroundJob.write")(function* (input) {
        const info = yield* get(input.jobID)
        return info
      })

      const start: Interface["start"] = Effect.fn("BackgroundJob.start")(function* (input) {
        const id = "job_" + ulid()
        const now = Date.now()
        const info: Info = {
          id,
          kind: input.kind,
          status: "running",
          sessionID: input.sessionID,
          messageID: input.messageID,
          callID: input.callID,
          childSessionID: input.childSessionID,
          ptyID: input.ptyID,
          title: input.title,
          description: input.description,
          command: input.command,
          cwd: input.cwd,
          createdAt: now,
          updatedAt: now,
          startedAt: now,
          outputCursor: 0,
        }
        const done = yield* Deferred.make<Info, never>()
        const cancel = yield* Deferred.make<void, never>()
        yield* fatal(storage.write(key(id), info))
        yield* fatal(storage.write(outputKey(id), empty))
        yield* bus.publish(Event.Created, { jobID: id, info })

        const s = yield* InstanceState.get(state)
        const fiber = yield* input.run({ job: info, cancel: Deferred.await(cancel) }).pipe(
          Effect.flatMap((result) =>
            Effect.gen(function* () {
              if (result?.output) yield* append(id, result.output)
              return yield* patch(id, (item) => ({
                ...item,
                status: result?.status ?? "exited",
                completedAt: Date.now(),
                exit: result?.exit ?? null,
                error: result?.error,
              }))
            }),
          ),
          Effect.exit,
          Effect.flatMap((exit) => {
            if (Exit.isSuccess(exit)) return Effect.succeed(exit.value)
            if (Cause.hasInterruptsOnly(exit.cause)) {
              return patch(id, (item) => ({
                ...item,
                status: "cancelled",
                completedAt: Date.now(),
                exit: null,
              }))
            }
            return patch(id, (item) => ({
              ...item,
              status: "failed",
              completedAt: Date.now(),
              exit: null,
              error: Cause.pretty(exit.cause),
            }))
          }),
          Effect.tap((item) => Deferred.succeed(done, item)),
          Effect.ensuring(
            Effect.sync(() => {
              s.running.delete(id)
            }),
          ),
          Effect.forkIn(scope),
        )
        s.running.set(id, { fiber, done, cancel })
        return info
      })

      const startShell: Interface["startShell"] = Effect.fn("BackgroundJob.startShell")(function* (input) {
        const id = "job_" + ulid()
        const now = Date.now()
        const info: Info = {
          id,
          kind: "bash",
          status: "running",
          sessionID: input.sessionID,
          messageID: input.messageID,
          callID: input.callID,
          title: input.title,
          description: input.description,
          command: input.command,
          cwd: input.cwd,
          createdAt: now,
          updatedAt: now,
          startedAt: now,
          outputCursor: 0,
        }
        const done = yield* Deferred.make<Info, never>()
        const cancel = yield* Deferred.make<void, never>()
        yield* fatal(storage.write(key(id), info))
        yield* fatal(storage.write(outputKey(id), empty))
        yield* bus.publish(Event.Created, { jobID: id, info })

        const s = yield* InstanceState.get(state)
        const fiber = yield* runShell(info, input, cancel).pipe(
          Effect.exit,
          Effect.flatMap((exit) => {
            if (Exit.isSuccess(exit)) return Effect.succeed(exit.value)
            if (Cause.hasInterruptsOnly(exit.cause)) {
              return patch(id, (item) => ({
                ...item,
                status: "cancelled",
                completedAt: Date.now(),
                exit: null,
              }))
            }
            return patch(id, (item) => ({
              ...item,
              status: "failed",
              completedAt: Date.now(),
              exit: null,
              error: Cause.pretty(exit.cause),
            }))
          }),
          Effect.tap((item) => Deferred.succeed(done, item)),
          Effect.ensuring(
            Effect.sync(() => {
              s.running.delete(id)
            }),
          ),
          Effect.forkIn(scope),
        )
        s.running.set(id, { fiber, done, cancel })
        return info
      })

      return Service.of({
        list,
        get,
        output,
        wait,
        cancel,
        write,
        start,
        startShell,
      })
    }),
  )

  export const defaultLayer = layer.pipe(
    Layer.provide(Storage.defaultLayer),
    Layer.provide(Bus.layer),
    Layer.provide(CrossSpawnSpawner.defaultLayer),
  )

  const { runPromise } = makeRuntime(Service, defaultLayer)

  export async function list(input?: { sessionID?: SessionID }) {
    return runPromise((svc) => svc.list(input))
  }

  export async function get(jobID: string) {
    return runPromise((svc) => svc.get(jobID))
  }

  export async function output(input: { jobID: string; cursor?: number }) {
    return runPromise((svc) => svc.output(input))
  }

  export async function wait(input: { jobID: string; timeout?: number }) {
    return runPromise((svc) => svc.wait(input))
  }

  export async function cancel(jobID: string) {
    return runPromise((svc) => svc.cancel(jobID))
  }

  export async function write(input: { jobID: string; text: string }) {
    return runPromise((svc) => svc.write(input))
  }

  export async function start(input: StartInput) {
    return runPromise((svc) => svc.start(input))
  }

  export async function startShell(input: Parameters<Interface["startShell"]>[0]) {
    return runPromise((svc) => svc.startShell(input))
  }
}
