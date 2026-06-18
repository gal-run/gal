import { describe, expect, test } from "bun:test"
import type { Agent, Project } from "@scheduler-systems/gal-code-sdk/v2/client"
import { normalizeAgentList, sanitizeProject } from "./utils"

const agent = (name = "build") =>
  ({
    name,
    mode: "primary",
    permission: {},
    options: {},
  }) as Agent

describe("normalizeAgentList", () => {
  test("keeps array payloads", () => {
    expect(normalizeAgentList([agent("build"), agent("docs")])).toEqual([agent("build"), agent("docs")])
  })

  test("wraps a single agent payload", () => {
    expect(normalizeAgentList(agent("docs"))).toEqual([agent("docs")])
  })

  test("extracts agents from keyed objects", () => {
    expect(
      normalizeAgentList({
        build: agent("build"),
        docs: agent("docs"),
      }),
    ).toEqual([agent("build"), agent("docs")])
  })

  test("drops invalid payloads", () => {
    expect(normalizeAgentList({ name: "AbortError" })).toEqual([])
    expect(normalizeAgentList([{ name: "build" }, agent("docs")])).toEqual([agent("docs")])
  })
})

describe("sanitizeProject", () => {
  test("returns a detached project payload safe for Solid stores", () => {
    const project = {
      id: "p1",
      worktree: "/repo",
      commands: { start: "bun dev" },
      time: { created: 1, updated: 2 },
      sandboxes: ["/sandbox"],
      icon: { color: "green", url: "data:image/png;base64,abc", override: "custom" },
    } as Project

    const sanitized = sanitizeProject(project)

    expect(sanitized).toEqual({
      id: "p1",
      worktree: "/repo",
      commands: { start: "bun dev" },
      time: { created: 1, updated: 2 },
      sandboxes: ["/sandbox"],
      icon: { color: "green", url: undefined, override: undefined },
    })
    expect(sanitized).not.toBe(project)
    expect(sanitized.commands).not.toBe(project.commands)
    expect(sanitized.time).not.toBe(project.time)
    expect(sanitized.sandboxes).not.toBe(project.sandboxes)
    expect(sanitized.icon).not.toBe(project.icon)
  })
})
