import { Tool } from "./tool"
import DESCRIPTION from "./task.txt"
import z from "zod"
import { Session } from "../session"
import { SessionID, MessageID } from "../session/schema"
import { MessageV2 } from "../session/message-v2"
import { Agent } from "../agent/agent"
import type { SessionPrompt } from "../session/prompt"
import { Config } from "../config/config"
import { Cause, Effect } from "effect"
import { Log } from "@/util/log"
import { BackgroundJob } from "@/background/job"

export interface TaskPromptOps {
  cancel(sessionID: SessionID): void
  resolvePromptParts(template: string): Effect.Effect<SessionPrompt.PromptInput["parts"]>
  prompt(input: SessionPrompt.PromptInput): Effect.Effect<MessageV2.WithParts>
}

const id = "task"

const parameters = z.object({
  description: z.string().describe("A short (3-5 words) description of the task"),
  prompt: z.string().describe("The task for the agent to perform"),
  subagent_type: z.string().describe("The type of specialized agent to use for this task"),
  task_id: z
    .string()
    .describe(
      "This should only be set if you mean to resume a previous task (you can pass a prior task_id and the task will continue the same subagent session as before instead of creating a fresh one)",
    )
    .optional(),
  background: z
    .boolean()
    .describe("Set to true to detach the subagent and return immediately with a background job id")
    .optional(),
  command: z.string().describe("The command that triggered this task").optional(),
})

export const TaskTool = Tool.define(
  id,
  Effect.gen(function* () {
    const agent = yield* Agent.Service
    const config = yield* Config.Service
    const sessions = yield* Session.Service
    const jobs = yield* BackgroundJob.Service

    const run = Effect.fn("TaskTool.execute")(function* (params: z.infer<typeof parameters>, ctx: Tool.Context) {
      const cfg = yield* config.get()

      if (!ctx.extra?.bypassAgentCheck) {
        yield* ctx.ask({
          permission: id,
          patterns: [params.subagent_type],
          always: ["*"],
          metadata: {
            description: params.description,
            subagent_type: params.subagent_type,
          },
        })
      }

      const next = yield* agent.get(params.subagent_type)
      if (!next) {
        return yield* Effect.fail(new Error(`Unknown agent type: ${params.subagent_type} is not a valid agent type`))
      }

      const canTask = next.permission.some((rule) => rule.permission === id)
      const canTodo = next.permission.some((rule) => rule.permission === "todowrite")

      const taskID = params.task_id
      const session = taskID
        ? yield* sessions.get(SessionID.make(taskID)).pipe(Effect.catchCause(() => Effect.succeed(undefined)))
        : undefined
      const nextSession =
        session ??
        (yield* sessions.create({
          parentID: ctx.sessionID,
          title: params.description + ` (@${next.name} subagent)`,
          permission: [
            ...(canTodo
              ? []
              : [
                  {
                    permission: "todowrite" as const,
                    pattern: "*" as const,
                    action: "deny" as const,
                  },
                ]),
            ...(canTask
              ? []
              : [
                  {
                    permission: id,
                    pattern: "*" as const,
                    action: "deny" as const,
                  },
                ]),
            ...(cfg.experimental?.primary_tools?.map((item) => ({
              pattern: "*",
              action: "allow" as const,
              permission: item,
            })) ?? []),
          ],
        }))

      const msg = yield* Effect.sync(() => MessageV2.get({ sessionID: ctx.sessionID, messageID: ctx.messageID }))
      if (msg.info.role !== "assistant") return yield* Effect.fail(new Error("Not an assistant message"))

      const model = next.model ?? {
        modelID: msg.info.modelID,
        providerID: msg.info.providerID,
      }

      yield* ctx.metadata({
        title: params.description,
        metadata: {
          sessionId: nextSession.id,
          model,
        },
      })

      const ops = ctx.extra?.promptOps as TaskPromptOps
      if (!ops) return yield* Effect.fail(new Error("TaskTool requires promptOps in ctx.extra"))

      const messageID = MessageID.ascending()

      const taskOutput = (text: string) =>
        [
          `task_id: ${nextSession.id} (for resuming to continue this task if needed)`,
          "",
          "<task_result>",
          text,
          "</task_result>",
        ].join("\n")

      const runPrompt = Effect.fn("TaskTool.prompt")(function* () {
        const parts = yield* ops.resolvePromptParts(params.prompt)
        const result = yield* ops.prompt({
          messageID,
          sessionID: nextSession.id,
          model: {
            modelID: model.modelID,
            providerID: model.providerID,
          },
          agent: next.name,
          tools: {
            ...(canTodo ? {} : { todowrite: false }),
            ...(canTask ? {} : { task: false }),
            ...Object.fromEntries((cfg.experimental?.primary_tools ?? []).map((item) => [item, false])),
          },
          parts,
        })

        return taskOutput(result.parts.findLast((item) => item.type === "text")?.text ?? "")
      })

      const updateParentPart = Effect.fn("TaskTool.updateParentPart")(function* (input: {
        job: BackgroundJob.Info
        status: Extract<BackgroundJob.Info["status"], "exited" | "failed" | "cancelled">
        output: string
        error?: string
      }) {
        const parent = yield* Effect.sync(() =>
          MessageV2.get({ sessionID: ctx.sessionID, messageID: ctx.messageID }),
        ).pipe(Effect.catch(() => Effect.succeed(undefined)))
        const part = parent?.parts.find(
          (item): item is MessageV2.ToolPart => item.type === "tool" && item.callID === ctx.callID,
        )
        if (!part) return

        const start = "time" in part.state ? part.state.time.start : Date.now()
        const metadata = {
          ...(part.state.status === "pending" ? {} : (part.state.metadata ?? {})),
          sessionId: nextSession.id,
          model,
          job_id: input.job.id,
          status: input.status,
        }

        if (input.status === "exited") {
          yield* sessions.updatePart({
            ...part,
            state: {
              status: "completed",
              input: part.state.input,
              title: params.description,
              metadata,
              output: input.output,
              time: { start, end: Date.now() },
            },
          } satisfies MessageV2.ToolPart)
          return
        }

        yield* sessions.updatePart({
          ...part,
          state: {
            status: "error",
            input: part.state.input,
            metadata,
            error: input.error ?? (input.status === "cancelled" ? "Detached task cancelled" : "Detached task failed"),
            time: { start, end: Date.now() },
          },
        } satisfies MessageV2.ToolPart)
      })

      function cancelPrompt() {
        ops.cancel(nextSession.id)
      }

      if (params.background) {
        const job = yield* jobs.start({
          kind: "subagent",
          sessionID: ctx.sessionID,
          messageID: ctx.messageID,
          callID: ctx.callID,
          childSessionID: nextSession.id,
          title: params.description,
          description: `Task ${params.description} (@${next.name} subagent)`,
          command: params.command,
          run: ({ job, cancel: cancelJob }) =>
            Effect.race(
              runPrompt().pipe(
                Effect.flatMap((output) =>
                  updateParentPart({ job, status: "exited", output }).pipe(
                    Effect.as({ status: "exited" as const, output, exit: 0 }),
                  ),
                ),
                Effect.catchCause((cause) => {
                  const defect = Cause.squash(cause)
                  const message = defect instanceof Error ? defect.message : String(defect)
                  const output = [
                    `task_id: ${nextSession.id} (for resuming to continue this task if needed)`,
                    "",
                    "Detached task failed.",
                    message,
                  ].join("\n")
                  return updateParentPart({ job, status: "failed", output, error: message }).pipe(
                    Effect.as({ status: "failed" as const, output, exit: null, error: message }),
                  )
                }),
              ),
              cancelJob.pipe(
                Effect.tap(() => Effect.sync(cancelPrompt)),
                Effect.flatMap(() => {
                  const output = [
                    `task_id: ${nextSession.id} (for resuming to continue this task if needed)`,
                    "",
                    "Detached task cancelled.",
                  ].join("\n")
                  return updateParentPart({ job, status: "cancelled", output }).pipe(
                    Effect.as({ status: "cancelled" as const, output, exit: null }),
                  )
                }),
              ),
            ),
        })

        yield* ctx.metadata({
          title: params.description,
          metadata: {
            sessionId: nextSession.id,
            model,
            job_id: job.id,
            status: job.status,
          },
        })

        return {
          title: params.description,
          metadata: {
            sessionId: nextSession.id,
            model,
            job_id: job.id,
            status: job.status,
          },
          output: [
            `task_id: ${nextSession.id} (for resuming to continue this task if needed)`,
            `job_id: ${job.id}`,
            `status: ${job.status}`,
            "",
            "Detached subagent started. Use background_wait to wait, bash_output to inspect output, or bash_kill to cancel it.",
          ].join("\n"),
        }
      }

      return yield* Effect.acquireUseRelease(
        Effect.sync(() => {
          ctx.abort.addEventListener("abort", cancelPrompt)
        }),
        () =>
          Effect.gen(function* () {
            return {
              title: params.description,
              metadata: {
                sessionId: nextSession.id,
                model,
              },
              output: yield* runPrompt(),
            }
          }),
        () =>
          Effect.sync(() => {
            ctx.abort.removeEventListener("abort", cancelPrompt)
          }),
      )
    })

    return {
      description: DESCRIPTION,
      parameters,
      execute: (params: z.infer<typeof parameters>, ctx: Tool.Context) => run(params, ctx).pipe(Effect.orDie),
    }
  }),
)
