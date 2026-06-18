import { afterEach, describe, expect } from "bun:test"
import { Deferred, Effect, Layer } from "effect"
import { Agent } from "../../src/agent/agent"
import { BackgroundJob } from "../../src/background/job"
import { Config } from "../../src/config/config"
import * as CrossSpawnSpawner from "../../src/effect/cross-spawn-spawner"
import { Instance } from "../../src/project/instance"
import { Session } from "../../src/session"
import { MessageV2 } from "../../src/session/message-v2"
import type { SessionPrompt } from "../../src/session/prompt"
import { MessageID, PartID } from "../../src/session/schema"
import { ModelID, ProviderID } from "../../src/provider/schema"
import { TaskTool, type TaskPromptOps } from "../../src/tool/task"
import { Truncate } from "../../src/tool/truncate"
import { ToolRegistry } from "../../src/tool/registry"
import { provideTmpdirInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

afterEach(async () => {
  await Instance.disposeAll()
})

const ref = {
  providerID: ProviderID.make("test"),
  modelID: ModelID.make("test-model"),
}

const it = testEffect(
  Layer.mergeAll(
    Agent.defaultLayer,
    Config.defaultLayer,
    CrossSpawnSpawner.defaultLayer,
    Session.defaultLayer,
    Truncate.defaultLayer,
    ToolRegistry.defaultLayer,
    BackgroundJob.defaultLayer,
  ),
)

const seed = Effect.fn("TaskToolTest.seed")(function* (title = "Pinned") {
  const session = yield* Session.Service
  const chat = yield* session.create({ title })
  const user = yield* session.updateMessage({
    id: MessageID.ascending(),
    role: "user",
    sessionID: chat.id,
    agent: "build",
    model: ref,
    time: { created: Date.now() },
  })
  const assistant: MessageV2.Assistant = {
    id: MessageID.ascending(),
    role: "assistant",
    parentID: user.id,
    sessionID: chat.id,
    mode: "build",
    agent: "build",
    cost: 0,
    path: { cwd: "/tmp", root: "/tmp" },
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    modelID: ref.modelID,
    providerID: ref.providerID,
    time: { created: Date.now() },
  }
  yield* session.updateMessage(assistant)
  return { chat, assistant }
})

function stubOps(opts?: { onPrompt?: (input: SessionPrompt.PromptInput) => void; text?: string }): TaskPromptOps {
  return {
    cancel() {},
    resolvePromptParts: (template) => Effect.succeed([{ type: "text" as const, text: template }]),
    prompt: (input) =>
      Effect.sync(() => {
        opts?.onPrompt?.(input)
        return reply(input, opts?.text ?? "done")
      }),
  }
}

function reply(input: Parameters<typeof SessionPrompt.prompt>[0], text: string): MessageV2.WithParts {
  const id = MessageID.ascending()
  return {
    info: {
      id,
      role: "assistant",
      parentID: input.messageID ?? MessageID.ascending(),
      sessionID: input.sessionID,
      mode: input.agent ?? "general",
      agent: input.agent ?? "general",
      cost: 0,
      path: { cwd: "/tmp", root: "/tmp" },
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      modelID: input.model?.modelID ?? ref.modelID,
      providerID: input.model?.providerID ?? ref.providerID,
      time: { created: Date.now() },
      finish: "stop",
    },
    parts: [
      {
        id: PartID.ascending(),
        messageID: id,
        sessionID: input.sessionID,
        type: "text",
        text,
      },
    ],
  }
}

describe("tool.task", () => {
  it.live("description sorts subagents by name and is stable across calls", () =>
    provideTmpdirInstance(
      () =>
        Effect.gen(function* () {
          const agent = yield* Agent.Service
          const build = yield* agent.get("build")
          const registry = yield* ToolRegistry.Service
          const get = Effect.fnUntraced(function* () {
            const tools = yield* registry.tools({ ...ref, agent: build })
            return tools.find((tool) => tool.id === TaskTool.id)?.description ?? ""
          })
          const first = yield* get()
          const second = yield* get()

          expect(first).toBe(second)

          const alpha = first.indexOf("- alpha: Alpha agent")
          const explore = first.indexOf("- explore:")
          const general = first.indexOf("- general:")
          const zebra = first.indexOf("- zebra: Zebra agent")

          expect(alpha).toBeGreaterThan(-1)
          expect(explore).toBeGreaterThan(alpha)
          expect(general).toBeGreaterThan(explore)
          expect(zebra).toBeGreaterThan(general)
        }),
      {
        config: {
          agent: {
            zebra: {
              description: "Zebra agent",
              mode: "subagent",
            },
            alpha: {
              description: "Alpha agent",
              mode: "subagent",
            },
          },
        },
      },
    ),
  )

  it.live("description hides denied subagents for the caller", () =>
    provideTmpdirInstance(
      () =>
        Effect.gen(function* () {
          const agent = yield* Agent.Service
          const build = yield* agent.get("build")
          const registry = yield* ToolRegistry.Service
          const description =
            (yield* registry.tools({ ...ref, agent: build })).find((tool) => tool.id === TaskTool.id)?.description ?? ""

          expect(description).toContain("- alpha: Alpha agent")
          expect(description).not.toContain("- zebra: Zebra agent")
        }),
      {
        config: {
          permission: {
            task: {
              "*": "allow",
              zebra: "deny",
            },
          },
          agent: {
            zebra: {
              description: "Zebra agent",
              mode: "subagent",
            },
            alpha: {
              description: "Alpha agent",
              mode: "subagent",
            },
          },
        },
      },
    ),
  )

  it.live("execute resumes an existing task session from task_id", () =>
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const sessions = yield* Session.Service
        const { chat, assistant } = yield* seed()
        const child = yield* sessions.create({ parentID: chat.id, title: "Existing child" })
        const tool = yield* TaskTool
        const def = yield* tool.init()
        let seen: SessionPrompt.PromptInput | undefined
        const promptOps = stubOps({ text: "resumed", onPrompt: (input) => (seen = input) })

        const result = yield* def.execute(
          {
            description: "inspect bug",
            prompt: "look into the cache key path",
            subagent_type: "general",
            task_id: child.id,
          },
          {
            sessionID: chat.id,
            messageID: assistant.id,
            agent: "build",
            abort: new AbortController().signal,
            extra: { promptOps },
            messages: [],
            metadata: () => Effect.void,
            ask: () => Effect.void,
          },
        )

        const kids = yield* sessions.children(chat.id)
        expect(kids).toHaveLength(1)
        expect(kids[0]?.id).toBe(child.id)
        expect(result.metadata.sessionId).toBe(child.id)
        expect(result.output).toContain(`task_id: ${child.id}`)
        expect(seen?.sessionID).toBe(child.id)
      }),
    ),
  )

  it.live("execute asks by default and skips checks when bypassed", () =>
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const { chat, assistant } = yield* seed()
        const tool = yield* TaskTool
        const def = yield* tool.init()
        const calls: unknown[] = []
        const promptOps = stubOps()

        const exec = (extra?: Record<string, any>) =>
          def.execute(
            {
              description: "inspect bug",
              prompt: "look into the cache key path",
              subagent_type: "general",
            },
            {
              sessionID: chat.id,
              messageID: assistant.id,
              agent: "build",
              abort: new AbortController().signal,
              extra: { promptOps, ...extra },
              messages: [],
              metadata: () => Effect.void,
              ask: (input) =>
                Effect.sync(() => {
                  calls.push(input)
                }),
            },
          )

        yield* exec()
        yield* exec({ bypassAgentCheck: true })

        expect(calls).toHaveLength(1)
        expect(calls[0]).toEqual({
          permission: "task",
          patterns: ["general"],
          always: ["*"],
          metadata: {
            description: "inspect bug",
            subagent_type: "general",
          },
        })
      }),
    ),
  )

  it.live("execute creates a child when task_id does not exist", () =>
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const sessions = yield* Session.Service
        const { chat, assistant } = yield* seed()
        const tool = yield* TaskTool
        const def = yield* tool.init()
        let seen: SessionPrompt.PromptInput | undefined
        const promptOps = stubOps({ text: "created", onPrompt: (input) => (seen = input) })

        const result = yield* def.execute(
          {
            description: "inspect bug",
            prompt: "look into the cache key path",
            subagent_type: "general",
            task_id: "ses_missing",
          },
          {
            sessionID: chat.id,
            messageID: assistant.id,
            agent: "build",
            abort: new AbortController().signal,
            extra: { promptOps },
            messages: [],
            metadata: () => Effect.void,
            ask: () => Effect.void,
          },
        )

        const kids = yield* sessions.children(chat.id)
        expect(kids).toHaveLength(1)
        expect(kids[0]?.id).toBe(result.metadata.sessionId)
        expect(result.metadata.sessionId).not.toBe("ses_missing")
        expect(result.output).toContain(`task_id: ${result.metadata.sessionId}`)
        expect(seen?.sessionID).toBe(result.metadata.sessionId)
      }),
    ),
  )

  it.live("starts a fresh detached task as a background job", () =>
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const sessions = yield* Session.Service
        const jobs = yield* BackgroundJob.Service
        const { chat, assistant } = yield* seed()
        const tool = yield* TaskTool
        const def = yield* tool.init()
        const gate = yield* Deferred.make<void, never>()
        let seen: SessionPrompt.PromptInput | undefined
        const promptOps: TaskPromptOps = {
          cancel() {},
          resolvePromptParts: (template) => Effect.succeed([{ type: "text" as const, text: template }]),
          prompt: (input) =>
            Deferred.await(gate).pipe(
              Effect.map(() => {
                seen = input
                return reply(input, "detached done")
              }),
            ),
        }

        const result = yield* def.execute(
          {
            description: "inspect bug",
            prompt: "look into the cache key path",
            subagent_type: "general",
            background: true,
          },
          {
            sessionID: chat.id,
            messageID: assistant.id,
            callID: "call_detached",
            agent: "build",
            abort: new AbortController().signal,
            extra: { promptOps },
            messages: [],
            metadata: () => Effect.void,
            ask: () => Effect.void,
          },
        )

        const jobID = (result.metadata as Record<string, unknown>).job_id as string
        expect(jobID).toStartWith("job_")
        expect(result.output).toContain(`job_id: ${jobID}`)
        expect(result.metadata.sessionId).toBeTruthy()

        const job = yield* jobs.get(jobID)
        expect(job.kind).toBe("subagent")
        expect(job.status).toBe("running")
        expect(job.childSessionID).toBe(result.metadata.sessionId)

        yield* Deferred.succeed(gate, undefined)
        const done = yield* jobs.wait({ jobID, timeout: 5_000 })
        expect(done.status).toBe("exited")
        expect(done.exit).toBe(0)

        const output = yield* jobs.output({ jobID })
        expect(output.text).toContain("detached done")
        expect(seen?.sessionID).toBe(result.metadata.sessionId)

        const kids = yield* sessions.children(chat.id)
        expect(kids.map((item) => item.id)).toContain(result.metadata.sessionId)
      }),
    ),
  )

  it.live("resumes an existing task session in detached mode", () =>
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const sessions = yield* Session.Service
        const jobs = yield* BackgroundJob.Service
        const { chat, assistant } = yield* seed()
        const child = yield* sessions.create({ parentID: chat.id, title: "Existing child" })
        const tool = yield* TaskTool
        const def = yield* tool.init()
        const promptOps = stubOps({ text: "resumed detached" })

        const result = yield* def.execute(
          {
            description: "inspect bug",
            prompt: "look into the cache key path",
            subagent_type: "general",
            task_id: child.id,
            background: true,
          },
          {
            sessionID: chat.id,
            messageID: assistant.id,
            callID: "call_resumed",
            agent: "build",
            abort: new AbortController().signal,
            extra: { promptOps },
            messages: [],
            metadata: () => Effect.void,
            ask: () => Effect.void,
          },
        )

        const jobID = (result.metadata as Record<string, unknown>).job_id as string
        const done = yield* jobs.wait({ jobID, timeout: 5_000 })
        const kids = yield* sessions.children(chat.id)

        expect(result.metadata.sessionId).toBe(child.id)
        expect(done.childSessionID).toBe(child.id)
        expect(kids).toHaveLength(1)
        expect(kids[0]?.id).toBe(child.id)
      }),
    ),
  )

  it.live("cancels detached task jobs", () =>
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const jobs = yield* BackgroundJob.Service
        const { chat, assistant } = yield* seed()
        const tool = yield* TaskTool
        const def = yield* tool.init()
        const never = yield* Deferred.make<void, never>()
        let cancelCount = 0
        const promptOps: TaskPromptOps = {
          cancel() {
            cancelCount++
          },
          resolvePromptParts: (template) => Effect.succeed([{ type: "text" as const, text: template }]),
          prompt: (input) => Deferred.await(never).pipe(Effect.as(reply(input, "late"))),
        }

        const result = yield* def.execute(
          {
            description: "inspect bug",
            prompt: "look into the cache key path",
            subagent_type: "general",
            background: true,
          },
          {
            sessionID: chat.id,
            messageID: assistant.id,
            callID: "call_cancel",
            agent: "build",
            abort: new AbortController().signal,
            extra: { promptOps },
            messages: [],
            metadata: () => Effect.void,
            ask: () => Effect.void,
          },
        )

        const jobID = (result.metadata as Record<string, unknown>).job_id as string
        const cancelled = yield* jobs.cancel(jobID)
        expect(cancelled.status).toBe("cancelled")
        expect(cancelCount).toBe(1)

        const output = yield* jobs.output({ jobID })
        expect(output.text).toContain("Detached task cancelled")
      }),
    ),
  )

  it.live("records detached task failures on the job", () =>
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const jobs = yield* BackgroundJob.Service
        const { chat, assistant } = yield* seed()
        const tool = yield* TaskTool
        const def = yield* tool.init()
        const promptOps: TaskPromptOps = {
          cancel() {},
          resolvePromptParts: (template) => Effect.succeed([{ type: "text" as const, text: template }]),
          prompt: () => Effect.die(new Error("subagent exploded")),
        }

        const result = yield* def.execute(
          {
            description: "inspect bug",
            prompt: "look into the cache key path",
            subagent_type: "general",
            background: true,
          },
          {
            sessionID: chat.id,
            messageID: assistant.id,
            callID: "call_fail",
            agent: "build",
            abort: new AbortController().signal,
            extra: { promptOps },
            messages: [],
            metadata: () => Effect.void,
            ask: () => Effect.void,
          },
        )

        const jobID = (result.metadata as Record<string, unknown>).job_id as string
        const failed = yield* jobs.wait({ jobID, timeout: 5_000 })
        expect(failed.status).toBe("failed")
        expect(failed.error).toContain("subagent exploded")

        const output = yield* jobs.output({ jobID })
        expect(output.text).toContain("Detached task failed")
        expect(output.text).toContain("subagent exploded")
      }),
    ),
  )

  it.live("attaches detached task completion metadata to the parent tool part", () =>
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const sessions = yield* Session.Service
        const jobs = yield* BackgroundJob.Service
        const { chat, assistant } = yield* seed()
        const callID = "call_parent_update"
        const part = yield* sessions.updatePart({
          id: PartID.ascending(),
          messageID: assistant.id,
          sessionID: chat.id,
          type: "tool",
          callID,
          tool: TaskTool.id,
          state: {
            status: "running",
            input: {
              description: "inspect bug",
              prompt: "look into the cache key path",
              subagent_type: "general",
              background: true,
            },
            time: { start: Date.now() },
          },
        } satisfies MessageV2.ToolPart)
        const gate = yield* Deferred.make<void, never>()
        const promptOps: TaskPromptOps = {
          cancel() {},
          resolvePromptParts: (template) => Effect.succeed([{ type: "text" as const, text: template }]),
          prompt: (input) => Deferred.await(gate).pipe(Effect.as(reply(input, "parent visible result"))),
        }
        const tool = yield* TaskTool
        const def = yield* tool.init()

        const result = yield* def.execute(
          {
            description: "inspect bug",
            prompt: "look into the cache key path",
            subagent_type: "general",
            background: true,
          },
          {
            sessionID: chat.id,
            messageID: assistant.id,
            callID,
            agent: "build",
            abort: new AbortController().signal,
            extra: { promptOps },
            messages: [],
            metadata: () => Effect.void,
            ask: () => Effect.void,
          },
        )

        const jobID = (result.metadata as Record<string, unknown>).job_id as string
        yield* Deferred.succeed(gate, undefined)
        yield* jobs.wait({ jobID, timeout: 5_000 })

        const updated = yield* sessions.getPart({ sessionID: chat.id, messageID: assistant.id, partID: part.id })
        expect(updated?.type).toBe("tool")
        if (updated?.type !== "tool" || updated.state.status !== "completed") {
          throw new Error("detached task parent part was not completed")
        }
        expect(updated.state.metadata.job_id).toBe(jobID)
        expect(updated.state.metadata.sessionId).toBe(result.metadata.sessionId)
        expect(updated.state.output).toContain("parent visible result")
      }),
    ),
  )

  it.live("execute shapes child permissions for task, todowrite, and primary tools", () =>
    provideTmpdirInstance(
      () =>
        Effect.gen(function* () {
          const sessions = yield* Session.Service
          const { chat, assistant } = yield* seed()
          const tool = yield* TaskTool
          const def = yield* tool.init()
          let seen: SessionPrompt.PromptInput | undefined
          const promptOps = stubOps({ onPrompt: (input) => (seen = input) })

          const result = yield* def.execute(
            {
              description: "inspect bug",
              prompt: "look into the cache key path",
              subagent_type: "reviewer",
            },
            {
              sessionID: chat.id,
              messageID: assistant.id,
              agent: "build",
              abort: new AbortController().signal,
              extra: { promptOps },
              messages: [],
              metadata: () => Effect.void,
              ask: () => Effect.void,
            },
          )

          const child = yield* sessions.get(result.metadata.sessionId)
          expect(child.parentID).toBe(chat.id)
          expect(child.permission).toEqual([
            {
              permission: "todowrite",
              pattern: "*",
              action: "deny",
            },
            {
              permission: "bash",
              pattern: "*",
              action: "allow",
            },
            {
              permission: "read",
              pattern: "*",
              action: "allow",
            },
          ])
          expect(seen?.tools).toEqual({
            todowrite: false,
            bash: false,
            read: false,
          })
        }),
      {
        config: {
          agent: {
            reviewer: {
              mode: "subagent",
              permission: {
                task: "allow",
              },
            },
          },
          experimental: {
            primary_tools: ["bash", "read"],
          },
        },
      },
    ),
  )
})
