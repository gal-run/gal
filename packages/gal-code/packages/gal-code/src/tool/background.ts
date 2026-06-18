import z from "zod"
import { Effect } from "effect"
import { Tool } from "./tool"
import { BackgroundJob } from "@/background/job"

const OutputParameters = z.object({
  job_id: z.string().describe("The background job id returned by bash or task"),
  cursor: z.number().describe("Optional output cursor. Omit to read all retained output.").optional(),
})

const KillParameters = z.object({
  job_id: z.string().describe("The background job id to cancel"),
})

const WaitParameters = z.object({
  job_id: z.string().describe("The background job id to wait for"),
  timeout: z.number().describe("Optional wait timeout in milliseconds").optional(),
})

export const BashOutputTool = Tool.define(
  "bash_output",
  Effect.gen(function* () {
    const jobs = yield* BackgroundJob.Service
    return {
      description: "Read output for a background Bash job by job id.",
      parameters: OutputParameters,
      execute: (params: z.infer<typeof OutputParameters>) =>
        Effect.gen(function* () {
          const job = yield* jobs.get(params.job_id)
          const out = yield* jobs.output({ jobID: params.job_id, cursor: params.cursor })
          return {
            title: `Output ${params.job_id}`,
            metadata: {
              job_id: params.job_id,
              status: job.status,
              cursor: out.cursor,
              next: out.next,
              truncated: out.truncated,
              output: out.text,
            },
            output: [
              `job_id: ${params.job_id}`,
              `status: ${job.status}`,
              `cursor: ${out.cursor}`,
              `next: ${out.next}`,
              out.truncated ? "truncated: true" : undefined,
              "",
              out.text,
            ]
              .filter((item): item is string => item !== undefined)
              .join("\n"),
          }
        }),
    }
  }),
)

export const BashKillTool = Tool.define(
  "bash_kill",
  Effect.gen(function* () {
    const jobs = yield* BackgroundJob.Service
    return {
      description: "Cancel or kill a running background Bash job by job id.",
      parameters: KillParameters,
      execute: (params: z.infer<typeof KillParameters>) =>
        Effect.gen(function* () {
          const job = yield* jobs.cancel(params.job_id)
          return {
            title: `Cancel ${params.job_id}`,
            metadata: {
              job_id: params.job_id,
              status: job.status,
            },
            output: [`job_id: ${params.job_id}`, `status: ${job.status}`].join("\n"),
          }
        }),
    }
  }),
)

export const BackgroundWaitTool = Tool.define(
  "background_wait",
  Effect.gen(function* () {
    const jobs = yield* BackgroundJob.Service
    return {
      description: "Wait for a background job to finish, or return current state after an optional timeout.",
      parameters: WaitParameters,
      execute: (params: z.infer<typeof WaitParameters>) =>
        Effect.gen(function* () {
          const job = yield* jobs.wait({ jobID: params.job_id, timeout: params.timeout })
          return {
            title: `Wait ${params.job_id}`,
            metadata: {
              job_id: params.job_id,
              status: job.status,
              exit: job.exit,
              error: job.error,
            },
            output: [
              `job_id: ${params.job_id}`,
              `status: ${job.status}`,
              job.exit === undefined ? undefined : `exit: ${job.exit}`,
              job.error ? `error: ${job.error}` : undefined,
            ]
              .filter((item): item is string => item !== undefined)
              .join("\n"),
          }
        }),
    }
  }),
)
