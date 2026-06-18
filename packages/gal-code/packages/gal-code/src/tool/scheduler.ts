import z from "zod"
import { Effect } from "effect"
import { Scheduler } from "@/scheduler/scheduler"
import { Tool } from "./tool"

const CreateParameters = z.object({
  title: z.string().describe("Short title for the scheduled task"),
  prompt: z.string().describe("Prompt to run when the schedule fires"),
  agent: z.string().describe("Agent to run the scheduled prompt with").optional(),
  cron: z.string().describe("Optional 5-field cron expression, for example '* * * * *'").optional(),
  at: z.number().describe("Optional one-shot Unix time in milliseconds").optional(),
  delay: z.number().describe("Optional one-shot delay in milliseconds").optional(),
  max_runs: z.number().describe("Optional maximum run count for recurring schedules").optional(),
})

const ListParameters = z.object({
  include_deleted: z.boolean().describe("Include deleted schedules").optional(),
})

const DeleteParameters = z.object({
  schedule_id: z.string().describe("Schedule id to delete"),
})

export const CronCreateTool = Tool.define(
  "cron_create",
  Effect.gen(function* () {
    const scheduler = yield* Scheduler.Service
    return {
      description: "Create a session-scoped scheduled prompt with a cron expression, timestamp, or delay.",
      parameters: CreateParameters,
      execute: (params: z.infer<typeof CreateParameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const schedule = yield* scheduler.create({
            sessionID: ctx.sessionID,
            messageID: ctx.messageID,
            title: params.title,
            kind: "prompt",
            prompt: params.prompt,
            agent: params.agent ?? ctx.agent,
            cron: params.cron,
            at: params.at,
            delay: params.delay,
            missed: "skip",
            maxRuns: params.max_runs,
          })
          return {
            title: schedule.title,
            metadata: {
              schedule_id: schedule.id,
              next_run_at: schedule.nextRunAt,
              status: schedule.status,
              recurring: schedule.recurring,
            },
            output: [
              `schedule_id: ${schedule.id}`,
              `status: ${schedule.status}`,
              `next_run_at: ${schedule.nextRunAt}`,
              `recurring: ${schedule.recurring}`,
            ].join("\n"),
          }
        }).pipe(Effect.orDie),
    }
  }),
)

export const CronListTool = Tool.define(
  "cron_list",
  Effect.gen(function* () {
    const scheduler = yield* Scheduler.Service
    return {
      description: "List scheduled work for the current session.",
      parameters: ListParameters,
      execute: (params: z.infer<typeof ListParameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const schedules = yield* scheduler.list({
            sessionID: ctx.sessionID,
            includeDeleted: params.include_deleted,
          })
          return {
            title: "Scheduled tasks",
            metadata: {
              schedules,
            },
            output:
              schedules.length === 0
                ? "No schedules."
                : schedules
                    .map((item) =>
                      [
                        `schedule_id: ${item.id}`,
                        `title: ${item.title}`,
                        `status: ${item.status}`,
                        `next_run_at: ${item.nextRunAt}`,
                        `run_count: ${item.runCount}`,
                      ].join("\n"),
                    )
                    .join("\n\n"),
          }
        }).pipe(Effect.orDie),
    }
  }),
)

export const CronDeleteTool = Tool.define(
  "cron_delete",
  Effect.gen(function* () {
    const scheduler = yield* Scheduler.Service
    return {
      description: "Delete a scheduled task by schedule id.",
      parameters: DeleteParameters,
      execute: (params: z.infer<typeof DeleteParameters>) =>
        Effect.gen(function* () {
          const schedule = yield* scheduler.delete(params.schedule_id)
          return {
            title: schedule.title,
            metadata: {
              schedule_id: schedule.id,
              status: schedule.status,
            },
            output: [`schedule_id: ${schedule.id}`, `status: ${schedule.status}`].join("\n"),
          }
        }).pipe(Effect.orDie),
    }
  }),
)
