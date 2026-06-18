export type Load = {
  id: string
  status: "loading" | "ready" | "error"
  message?: string
}

export type Notice = {
  kind: "loading" | "error" | "subagent-empty"
  title: string
  detail: string
}

export function loadError(error: unknown) {
  if (error instanceof Error) return error.message
  if (
    typeof error === "object" &&
    error !== null &&
    "data" in error &&
    typeof error.data === "object" &&
    error.data !== null &&
    "message" in error.data &&
    typeof error.data.message === "string"
  ) {
    return error.data.message
  }
  return String(error)
}

export function notice(input: {
  load: Load
  session?: { id: string; parentID?: string }
  messages: readonly unknown[]
}): Notice | undefined {
  if (!input.session) {
    if (input.load.status === "error") {
      return {
        kind: "error",
        title: "Session could not be loaded",
        detail: `${input.load.id}: ${input.load.message ?? "unknown error"}`,
      }
    }

    return {
      kind: "loading",
      title: "Opening session",
      detail: input.load.id,
    }
  }

  if (input.session.parentID && input.messages.length === 0) {
    return {
      kind: "subagent-empty",
      title: "Opening subagent session",
      detail: `Waiting for messages in ${input.session.id}`,
    }
  }

  return undefined
}
