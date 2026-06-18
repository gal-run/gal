import { InstanceState } from "@/effect/instance-state"
import { Context, Deferred, Effect, Layer } from "effect"
import { SessionID } from "./schema"

export namespace ForegroundShell {
  export class MissingError extends Error {
    constructor(public readonly sessionID: SessionID) {
      super(`No active foreground shell for session ${sessionID}`)
    }
  }

  type Entry = {
    jobID: string
    request: Deferred.Deferred<void, never>
    released: Deferred.Deferred<void, never>
  }

  type State = {
    active: Map<SessionID, Entry>
  }

  export interface Handle {
    readonly jobID: string
    readonly requested: Effect.Effect<void>
    readonly detached: Effect.Effect<void>
    readonly close: Effect.Effect<void>
  }

  export interface Interface {
    readonly register: (input: { sessionID: SessionID; jobID: string }) => Effect.Effect<Handle>
    readonly detach: (sessionID: SessionID) => Effect.Effect<string, MissingError>
  }

  export class Service extends Context.Service<Service, Interface>()("@gal-code/ForegroundShell") {}

  export const layer = Layer.effect(
    Service,
    Effect.gen(function* () {
      const state = yield* InstanceState.make<State>(
        Effect.fn("ForegroundShell.state")(() => Effect.succeed({ active: new Map() })),
      )

      const register: Interface["register"] = Effect.fn("ForegroundShell.register")(function* (input) {
        const data = yield* InstanceState.get(state)
        const item = {
          jobID: input.jobID,
          request: yield* Deferred.make<void, never>(),
          released: yield* Deferred.make<void, never>(),
        }
        data.active.set(input.sessionID, item)

        const close = Effect.gen(function* () {
          if (data.active.get(input.sessionID) === item) data.active.delete(input.sessionID)
          yield* Deferred.succeed(item.released, undefined).pipe(Effect.asVoid)
        })

        return {
          jobID: input.jobID,
          requested: Deferred.await(item.request),
          detached: close,
          close,
        }
      })

      const detach: Interface["detach"] = Effect.fn("ForegroundShell.detach")(function* (sessionID) {
        const data = yield* InstanceState.get(state)
        const item = data.active.get(sessionID)
        if (!item) return yield* Effect.fail(new MissingError(sessionID))
        yield* Deferred.succeed(item.request, undefined)
        yield* Deferred.await(item.released)
        return item.jobID
      })

      return Service.of({ register, detach })
    }),
  )

  export const defaultLayer = layer
}
