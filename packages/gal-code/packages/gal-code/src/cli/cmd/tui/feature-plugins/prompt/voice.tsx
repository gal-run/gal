import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@scheduler-systems/gal-code-plugin/tui"
import { existsSync, readFileSync } from "node:fs"
import { createSignal, onCleanup } from "solid-js"
import { execSync } from "node:child_process"

const id = "internal:prompt-voice"

const STATE_FILE = "/tmp/gal-voice-state"
const LEVEL_FILE = "/tmp/gal-voice-level"
const INPUT_FILE = "/tmp/gal-voice.txt"
// Set GAL_VOICE_DAEMON to the absolute path of the gal-voice daemon; the
// bare default resolves via PATH (the daemon ships separately).
const DAEMON_SCRIPT = process.env.GAL_VOICE_DAEMON || "gal-voice-daemon"

const exitRegex = /^(?:exit|stop|end)\s*voice$/i

const listeningFrames = ["○", "◔", "◑", "◕", "●", "●", "◕", "◑", "◔"]
const processingFrames = ["◴", "◷", "◶", "◵"]
const speakingFrames = ["◎", "◉", "◎", "◉"]

function read(path: string, fallback: string) {
  try {
    if (!existsSync(path)) return fallback
    return readFileSync(path, "utf-8").trim()
  } catch {
    return fallback
  }
}

function VoiceOrb() {
  const [, setTick] = createSignal(0)

  let interval: ReturnType<typeof setInterval>
  let count = 0

  interval = setInterval(() => {
    count++
    setTick(count)
  }, 200)

  onCleanup(() => clearInterval(interval))

  const state = () => read(STATE_FILE, "idle")

  const glyph = () => {
    const s = state()
    if (s === "listening") return listeningFrames[count % listeningFrames.length]
    if (s === "processing") return processingFrames[count % processingFrames.length]
    if (s === "speaking") return speakingFrames[count % speakingFrames.length]
    return "○"
  }

  const color = () => {
    switch (state()) {
      case "listening":
        return "#58A6FF"
      case "processing":
        return "#3FB950"
      case "speaking":
        return "#D29922"
      default:
        return "#8B949E"
    }
  }

  return (
    <box flexShrink={0} paddingRight={1}>
      <text fg={color()}>{glyph()}</text>
    </box>
  )
}

const paused = () => {
  try {
    execSync("pkill -f gal-voice-daemon 2>/dev/null || true")
  } catch {
    /* ok */
  }
  try {
    execSync(`echo "idle" > ${STATE_FILE}; echo "0" > ${LEVEL_FILE}`)
  } catch {
    /* ok */
  }
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 200,
    slots: {
      session_prompt_right() {
        return <VoiceOrb />
      },
      home_prompt_right() {
        return <VoiceOrb />
      },
    },
  })

  api.command.register(() => [
    {
      title: "Voice Mode",
      value: "voice.toggle",
      slash: { name: "voice" },
      category: "Session",
      onSelect: () => {
        const active = read(STATE_FILE, "idle") !== "idle"
        if (active) {
          paused()
        } else {
          paused()
          execSync(`bash ${DAEMON_SCRIPT} < /dev/null > /dev/null 2>&1 &`, { timeout: 2000 })
        }
      },
    },
  ])

  let lastMsgid = 0
  const initContent = read(INPUT_FILE, "")
  if (initContent) {
    const lines = initContent.split("\n")
    const last = lines[lines.length - 1]
    const parts = last.split("|")
    lastMsgid = parseInt(parts[0]) || 0
  }

  const consumerInterval = setInterval(() => {
    if (read(STATE_FILE, "idle") === "idle") return
    const content = read(INPUT_FILE, "")
    if (!content) return
    const lines = content.split("\n")
    for (const line of lines) {
      if (!line) continue
      const parts = line.split("|")
      const msgid = parseInt(parts[0])
      if (msgid <= lastMsgid) continue
      lastMsgid = msgid
      const text = parts.slice(2).join("|")
      if (exitRegex.test(text)) {
        paused()
        return
      }
      api.client.tui.appendPrompt({ text })
    }
  }, 300)

  api.lifecycle.onDispose(() => clearInterval(consumerInterval))
}

const plugin: TuiPluginModule & { id: string } = {
  id,
  tui,
}

export default plugin
