import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { BackgroundJob } from "@/background/job"
import { AppRuntime } from "@/effect/app-runtime"
import { SessionID } from "@/session/schema"
import { errors } from "../error"

export const BackgroundRoutes = () =>
  new Hono()
    .get(
      "/jobs",
      describeRoute({
        summary: "List background jobs",
        description: "List background jobs for the current GAL Code instance.",
        operationId: "background.jobs",
        responses: {
          200: {
            description: "Background jobs",
            content: {
              "application/json": {
                schema: resolver(BackgroundJob.Info.array()),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "query",
        z.object({
          sessionID: SessionID.zod.optional(),
        }),
      ),
      async (c) => {
        const query = c.req.valid("query")
        const jobs = await AppRuntime.runPromise(BackgroundJob.Service.use((svc) => svc.list(query)))
        return c.json(jobs)
      },
    )
    .get(
      "/jobs/:jobID",
      describeRoute({
        summary: "Get background job",
        description: "Get background job metadata.",
        operationId: "background.get",
        responses: {
          200: {
            description: "Background job",
            content: {
              "application/json": {
                schema: resolver(BackgroundJob.Info),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator("param", z.object({ jobID: z.string() })),
      async (c) => {
        const job = await AppRuntime.runPromise(BackgroundJob.Service.use((svc) => svc.get(c.req.valid("param").jobID)))
        return c.json(job)
      },
    )
    .get(
      "/jobs/:jobID/output",
      describeRoute({
        summary: "Get background job output",
        description: "Read background job output from an optional cursor.",
        operationId: "background.output",
        responses: {
          200: {
            description: "Background job output",
            content: {
              "application/json": {
                schema: resolver(BackgroundJob.Output),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator("param", z.object({ jobID: z.string() })),
      validator("query", z.object({ cursor: z.coerce.number().optional() })),
      async (c) => {
        const output = await AppRuntime.runPromise(
          BackgroundJob.Service.use((svc) =>
            svc.output({
              jobID: c.req.valid("param").jobID,
              cursor: c.req.valid("query").cursor,
            }),
          ),
        )
        return c.json(output)
      },
    )
    .post(
      "/jobs/:jobID/wait",
      describeRoute({
        summary: "Wait for background job",
        description: "Wait for a background job to finish, or return current state after a timeout.",
        operationId: "background.wait",
        responses: {
          200: {
            description: "Background job",
            content: {
              "application/json": {
                schema: resolver(BackgroundJob.Info),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator("param", z.object({ jobID: z.string() })),
      validator("json", z.object({ timeout: z.number().optional() }).optional()),
      async (c) => {
        const body = c.req.valid("json")
        const job = await AppRuntime.runPromise(
          BackgroundJob.Service.use((svc) =>
            svc.wait({
              jobID: c.req.valid("param").jobID,
              timeout: body?.timeout,
            }),
          ),
        )
        return c.json(job)
      },
    )
    .post(
      "/jobs/:jobID/cancel",
      describeRoute({
        summary: "Cancel background job",
        description: "Cancel or kill a running background job.",
        operationId: "background.cancel",
        responses: {
          200: {
            description: "Background job",
            content: {
              "application/json": {
                schema: resolver(BackgroundJob.Info),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator("param", z.object({ jobID: z.string() })),
      async (c) => {
        const job = await AppRuntime.runPromise(
          BackgroundJob.Service.use((svc) => svc.cancel(c.req.valid("param").jobID)),
        )
        return c.json(job)
      },
    )
    .post(
      "/jobs/:jobID/write",
      describeRoute({
        summary: "Write to background job",
        description: "Write stdin to a PTY-backed background job.",
        operationId: "background.write",
        responses: {
          200: {
            description: "Background job",
            content: {
              "application/json": {
                schema: resolver(BackgroundJob.Info),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator("param", z.object({ jobID: z.string() })),
      validator("json", z.object({ text: z.string() })),
      async (c) => {
        const job = await AppRuntime.runPromise(
          BackgroundJob.Service.use((svc) =>
            svc.write({
              jobID: c.req.valid("param").jobID,
              text: c.req.valid("json").text,
            }),
          ),
        )
        return c.json(job)
      },
    )
