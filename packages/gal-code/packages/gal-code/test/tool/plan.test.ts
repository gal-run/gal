import { afterEach, describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { Agent } from "../../src/agent/agent"
import * as CrossSpawnSpawner from "../../src/effect/cross-spawn-spawner"
import { Instance } from "../../src/project/instance"
import { Provider } from "../../src/provider/provider"
import { ModelID, ProviderID } from "../../src/provider/schema"
import { Session } from "../../src/session"
import { MessageID } from "../../src/session/schema"
import { PlanEnterTool } from "../../src/tool/plan"
import { Tool } from "../../src/tool/tool"
import { Truncate } from "../../src/tool/truncate"
import { provideTmpdirInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const ref = {
  providerID: ProviderID.make("test"),
  modelID: ModelID.make("test-model"),
}

const provider = Layer.succeed(
  Provider.Service,
  Provider.Service.of({
    list: () => Effect.succeed({}),
    getProvider: () => Effect.die("unused"),
    getModel: () => Effect.die("unused"),
    getLanguage: () => Effect.die("unused"),
    closest: () => Effect.succeed(undefined),
    getSmallModel: () => Effect.succeed(undefined),
    defaultModel: () => Effect.succeed(ref),
  }),
)

const it = testEffect(
  Layer.mergeAll(
    Agent.defaultLayer,
    CrossSpawnSpawner.defaultLayer,
    provider,
    Session.defaultLayer,
    Truncate.defaultLayer,
  ),
)

afterEach(async () => {
  await Instance.disposeAll()
})

describe("tool.plan", () => {
  it.live("plan_enter creates a plan user turn with the last model", () =>
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const sessions = yield* Session.Service
        const chat = yield* sessions.create({ title: "Plan enter" })
        yield* sessions.updateMessage({
          id: MessageID.ascending(),
          role: "user",
          sessionID: chat.id,
          agent: "build",
          model: ref,
          time: { created: Date.now() },
        })

        const info = yield* PlanEnterTool
        const tool = yield* info.init()
        const result = yield* tool.execute(
          { reason: "Needs design" },
          {
            sessionID: chat.id,
            messageID: MessageID.ascending(),
            agent: "build",
            abort: AbortSignal.any([]),
            messages: [],
            metadata: () => Effect.void,
            ask: () => Effect.void,
          } satisfies Tool.Context,
        )

        const msgs = yield* sessions.messages({ sessionID: chat.id })
        const msg = msgs.find((item) => item.info.role === "user" && item.info.agent === "plan")

        expect(result.title).toBe("Switching to plan agent")
        expect(msg?.info.role).toBe("user")
        if (msg?.info.role === "user") {
          expect(msg.info.model).toEqual(ref)
          expect(msg.parts.some((part) => part.type === "text" && part.text.includes("Needs design"))).toBe(true)
        }
      }),
    ),
  )
})
