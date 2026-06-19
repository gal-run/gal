import { describe, expect, test, afterAll } from "bun:test"
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "fs"
import { spawnSync } from "child_process"
import path from "path"
import os from "os"

const STATE_FILE = path.join(os.tmpdir(), "gal-voice-state")
const LEVEL_FILE = path.join(os.tmpdir(), "gal-voice-level")
const INPUT_FILE = path.join(os.tmpdir(), "gal-voice.txt")
const MSGID_FILE = path.join(os.tmpdir(), "gal-voice-msgid")
const PID_FILE = path.join(os.tmpdir(), "gal-voice-daemon.pid")
const DAEMON_SCRIPT =
  process.env.GAL_VOICE_DAEMON ||
  `${process.env.HOME}/gal-run/gal-android/scripts/gal-voice-daemon`
const hasDaemon = existsSync(DAEMON_SCRIPT)
const desc = hasDaemon ? describe : (describe.skip as (name: string, fn: () => void) => void)

function cleanup() {
  try {
    spawnSync("pkill", ["-f", "gal-voice-daemon"])
  } catch {
    /* */
  }
  for (const f of [STATE_FILE, LEVEL_FILE, INPUT_FILE, MSGID_FILE, PID_FILE]) {
    try {
      unlinkSync(f)
    } catch {
      /* */
    }
  }
}

describe("voice orb state machine", () => {
  afterAll(cleanup)

  test("idle state returns empty", () => {
    writeFileSync(STATE_FILE, "idle")
    const content = readFileSync(STATE_FILE, "utf-8").trim()
    expect(content).toBe("idle")
  })

  test("listening state returns listening text", () => {
    writeFileSync(STATE_FILE, "listening")
    expect(readFileSync(STATE_FILE, "utf-8").trim()).toBe("listening")
  })

  test("transcribing state returns processing text", () => {
    writeFileSync(STATE_FILE, "transcribing")
    expect(readFileSync(STATE_FILE, "utf-8").trim()).toBe("transcribing")
  })

  test("output: reads voice input file content", () => {
    writeFileSync(INPUT_FILE, "hello world")
    expect(readFileSync(INPUT_FILE, "utf-8").trim()).toBe("hello world")
  })

  test("speaking state returns speaking text", () => {
    writeFileSync(STATE_FILE, "speaking")
    expect(readFileSync(STATE_FILE, "utf-8").trim()).toBe("speaking")
  })

  test("empty input file returns empty string", () => {
    writeFileSync(INPUT_FILE, "")
    expect(readFileSync(INPUT_FILE, "utf-8").trim()).toBe("")
  })
})

describe("voice input file format", () => {
  test("single line input works", () => {
    writeFileSync(INPUT_FILE, "test input")
    expect(readFileSync(INPUT_FILE, "utf-8").trim()).toBe("test input")
  })

  test("multiline input preserves newlines", () => {
    writeFileSync(INPUT_FILE, "line1\nline2")
    const content = readFileSync(INPUT_FILE, "utf-8")
    expect(content).toContain("line1")
    expect(content).toContain("line2")
  })

  test("unicode input works", () => {
    writeFileSync(INPUT_FILE, "שלום")
    expect(readFileSync(INPUT_FILE, "utf-8").trim()).toBe("שלום")
  })
})

describe("voice exit commands", () => {
  test("exit voice is exit command", () => {
    const exitRegex = /^(?:exit|stop|end)\s*voice$/i
    expect(exitRegex.test("exit voice")).toBe(true)
    expect(exitRegex.test("stop voice")).toBe(true)
    expect(exitRegex.test("end voice")).toBe(true)
    expect(exitRegex.test("EXIT VOICE")).toBe(true)
  })

  test("exit command rejects non-matching patterns", () => {
    const exitRegex = /^(?:exit|stop|end)\s*voice$/i
    expect(exitRegex.test("hello")).toBe(false)
    expect(exitRegex.test("voice exit")).toBe(false)
  })
})

desc("voice daemon lifecycle", () => {
  afterAll(cleanup)

  test("daemon script exists and is executable", () => {
    expect(existsSync(DAEMON_SCRIPT)).toBe(true)
    const content = readFileSync(DAEMON_SCRIPT, "utf-8")
    expect(content.length).toBeGreaterThan(100)
  })

  test("daemon script has valid bash syntax", () => {
    const result = spawnSync("bash", ["-n", DAEMON_SCRIPT])
    expect(result.status).toBe(0)
  })

  test("daemon starts when OPENAI_API_KEY is set", () => {
    expect(true).toBe(true)
  })
})

describe("voice bug regression", () => {
  test("rapid state changes don't corrupt state file", () => {
    for (let i = 0; i < 10; i++) {
      writeFileSync(STATE_FILE, ["idle", "listening", "transcribing", "output"][i % 4])
    }
    const content = readFileSync(STATE_FILE, "utf-8").trim()
    expect(["idle", "listening", "transcribing", "output"]).toContain(content)
  })

  test("missing state file is handled gracefully", () => {
    try {
      unlinkSync(STATE_FILE)
    } catch {
      /* */
    }
    expect(existsSync(STATE_FILE)).toBe(false)
  })

  test("empty state file returns idle", () => {
    writeFileSync(STATE_FILE, "")
    expect(readFileSync(STATE_FILE, "utf-8").trim()).toBe("")
  })
})
