import { describe, expect, test } from "bun:test"
import { loadError, notice } from "../../../src/cli/cmd/tui/routes/session/notice"

describe("session route notice", () => {
  test("shows a visible loading state before a session is hydrated", () => {
    expect(
      notice({
        load: {
          id: "ses_child",
          status: "loading",
        },
        messages: [],
      }),
    ).toEqual({
      kind: "loading",
      title: "Opening session",
      detail: "ses_child",
    })
  })

  test("shows a visible empty state for opened subagent sessions", () => {
    expect(
      notice({
        load: {
          id: "ses_child",
          status: "ready",
        },
        session: {
          id: "ses_child",
          parentID: "ses_parent",
        },
        messages: [],
      }),
    ).toEqual({
      kind: "subagent-empty",
      title: "Opening subagent session",
      detail: "Waiting for messages in ses_child",
    })
  })

  test("keeps normal loaded sessions quiet", () => {
    expect(
      notice({
        load: {
          id: "ses_parent",
          status: "ready",
        },
        session: {
          id: "ses_parent",
        },
        messages: [{ id: "msg_1" }],
      }),
    ).toBeUndefined()
  })

  test("formats failed direct session loads", () => {
    expect(loadError({ data: { message: "missing child session" } })).toBe("missing child session")
    expect(
      notice({
        load: {
          id: "ses_child",
          status: "error",
          message: "missing child session",
        },
        messages: [],
      }),
    ).toEqual({
      kind: "error",
      title: "Session could not be loaded",
      detail: "ses_child: missing child session",
    })
  })
})
