import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { AppRuntime } from "@/effect/app-runtime"
import { Scheduler } from "@/scheduler/scheduler"
import { SessionID } from "@/session/schema"
import { errors } from "../error"

export const SchedulerRoutes = () =>
  new Hono()
    .get(
      "/",
      describeRoute({
        summary: "List schedules",
        description: "List scheduled work for the current GAL Code instance.",
        operationId: "schedule.list",
        responses: {
          200: {
            description: "Schedules",
            content: {
              "application/json": {
                schema: resolver(Scheduler.Info.array()),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "query",
        z.object({ sessionID: SessionID.zod.optional(), includeDeleted: z.coerce.boolean().optional() }),
      ),
      async (c) => {
        const query = c.req.valid("query")
        const schedules = await AppRuntime.runPromise(
          Scheduler.Service.use((svc) =>
            svc.list({ sessionID: query.sessionID, includeDeleted: query.includeDeleted }),
          ),
        )
        return c.json(schedules)
      },
    )
    .post(
      "/",
      describeRoute({
        summary: "Create schedule",
        description: "Create a session-scoped scheduled prompt.",
        operationId: "schedule.create",
        responses: {
          200: {
            description: "Schedule",
            content: {
              "application/json": {
                schema: resolver(Scheduler.Info),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator("json", Scheduler.CreateInput),
      async (c) => {
        const schedule = await AppRuntime.runPromise(Scheduler.Service.use((svc) => svc.create(c.req.valid("json"))))
        return c.json(schedule)
      },
    )
    .delete(
      "/:scheduleID",
      describeRoute({
        summary: "Delete schedule",
        description: "Delete a scheduled task.",
        operationId: "schedule.delete",
        responses: {
          200: {
            description: "Schedule",
            content: {
              "application/json": {
                schema: resolver(Scheduler.Info),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator("param", z.object({ scheduleID: z.string() })),
      async (c) => {
        const schedule = await AppRuntime.runPromise(
          Scheduler.Service.use((svc) => svc.delete(c.req.valid("param").scheduleID)),
        )
        return c.json(schedule)
      },
    )
