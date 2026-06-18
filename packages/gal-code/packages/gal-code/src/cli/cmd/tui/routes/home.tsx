import { Prompt, type PromptRef } from "@tui/component/prompt"
import { useTerminalDimensions } from "@opentui/solid"
import { createEffect, createMemo, createSignal, For, Show } from "solid-js"
import { useProject } from "../context/project"
import { useSync } from "../context/sync"
import { Toast } from "../ui/toast"
import { useArgs } from "../context/args"
import { useRouteData } from "@tui/context/route"
import { usePromptRef } from "../context/prompt"
import { useLocal } from "../context/local"
import { TuiPluginRuntime } from "../plugin"
import { useTheme } from "../context/theme"
import {
  GOVERNANCE_APERTURE,
  GOVERNANCE_HOME_PLACEHOLDERS,
  GOVERNANCE_HOME_SUBTITLE,
  GOVERNANCE_HOME_TITLE,
  GOVERNANCE_LANES,
  GOVERNANCE_MESH,
  type GovernanceTone,
} from "../feature-plugins/governance/copy"
import { summarizeGovernance } from "../feature-plugins/governance/state"

// TODO: what is the best way to do this?
let once = false

function tone(theme: ReturnType<typeof useTheme>["theme"], value: GovernanceTone) {
  if (value === "warning") return theme.warning
  if (value === "success") return theme.success
  if (value === "info") return theme.info
  return theme.accent
}

function clip(text: string, len: number) {
  if (text.length <= len) return text
  return text.slice(0, Math.max(0, len - 3)) + "..."
}

function useSummary() {
  const project = useProject()
  const sync = useSync()
  return () =>
    summarizeGovernance({
      config: sync.data.config,
      branch: sync.data.vcs?.branch,
      directory: project.instance.directory(),
      worktree: project.instance.path().worktree,
      mcp: sync.data.mcp,
    })
}

function CompactDeck() {
  const theme = useTheme().theme
  const summary = useSummary()

  return (
    <box width="100%" flexDirection="column" gap={1} flexShrink={0}>
      <box backgroundColor={theme.backgroundElement} paddingLeft={1} paddingRight={1} flexDirection="column">
        <box flexDirection="row" gap={2} flexShrink={0}>
          <text fg={theme.accent}>
            <b>GAL governance</b>
          </text>
          <text fg={theme.textMuted}>
            policy <span style={{ fg: theme.text }}>{summary().policy}</span>
          </text>
          <text fg={summary().risk === "low" ? theme.success : theme.warning}>{summary().status}</text>
        </box>
        <text fg={theme.textMuted}>light agent board: scope, swarm, proof</text>
      </box>

      <box backgroundColor={theme.backgroundPanel} paddingLeft={1} paddingRight={1} flexDirection="column">
        <For each={GOVERNANCE_LANES}>
          {(lane) => (
            <box flexDirection="row" gap={1} flexShrink={0}>
              <text width={12} fg={tone(theme, lane.tone)}>
                {lane.label.replace("lane ", "")} {lane.title}
              </text>
              <text width={11} fg={theme.accent}>
                {lane.command}
              </text>
              <text fg={theme.textMuted}>{clip(lane.detail, 36)}</text>
            </box>
          )}
        </For>
      </box>

      <box backgroundColor={theme.backgroundPanel} paddingLeft={1} paddingRight={1} flexDirection="row" gap={2}>
        <text fg={theme.text}>
          <b>evidence ledger</b>
        </text>
        <text fg={theme.textMuted}>mcp {summary().mcpConnected}</text>
        <text fg={theme.textMuted}>diff {summary().changedFiles}</text>
        <text fg={theme.textMuted}>scope {clip(summary().scope || "workspace", 24)}</text>
      </box>
    </box>
  )
}

function WideDeck() {
  const theme = useTheme().theme
  const summary = useSummary()
  const metrics = () => [
    ["policy", summary().policy],
    ["state", summary().status],
    ["swarm", `${summary().mcpConnected} tools`],
    ["diff", `${summary().changedFiles} files`],
    ["mesh", GOVERNANCE_MESH.map((item) => item.label).join(" / ")],
    ["scope", clip(summary().scope || "workspace", 36)],
  ]

  return (
    <box
      width="100%"
      backgroundColor={theme.backgroundPanel}
      border={["top"]}
      borderColor={theme.accent}
      paddingTop={1}
      paddingLeft={2}
      paddingRight={2}
      paddingBottom={1}
      flexDirection="column"
      gap={1}
      flexShrink={0}
    >
      <box width="100%" flexDirection="row" justifyContent="space-between" gap={2} flexShrink={0}>
        <box flexDirection="column" flexShrink={0}>
          <box flexDirection="row" gap={1}>
            <text fg={theme.accent}>
              <b>GAL</b>
            </text>
            <text fg={theme.text}>
              <b>The Governance Layer</b>
            </text>
          </box>
          <text fg={theme.textMuted}>for coding agents</text>
        </box>

        <box flexDirection="column" alignItems="flex-end">
          <text fg={summary().risk === "low" ? theme.success : theme.warning}>
            <b>{summary().status}</b>
          </text>
          <text fg={theme.textMuted}>{GOVERNANCE_HOME_SUBTITLE}</text>
        </box>
      </box>

      <box width="100%" flexDirection="row" gap={3} flexShrink={0}>
        <For each={metrics()}>
          {(item) => (
            <box flexDirection="column" flexGrow={1} minWidth={0}>
              <text fg={theme.textMuted}>{item[0]}</text>
              <text fg={item[0] === "state" ? (summary().risk === "low" ? theme.success : theme.warning) : theme.text}>
                {item[1]}
              </text>
            </box>
          )}
        </For>
      </box>
    </box>
  )
}

function RunwayBoard() {
  const theme = useTheme().theme
  const summary = useSummary()
  const tracks = () => [
    {
      label: "policy aperture",
      tone: "accent" as GovernanceTone,
      rows: [
        GOVERNANCE_APERTURE.detail,
        GOVERNANCE_APERTURE.mesh,
        `baseline: ${summary().policy}`,
        `gate: ${summary().status}`,
      ],
    },
    {
      label: "agent autonomy",
      tone: "success" as GovernanceTone,
      rows: ["read contract", "map risk", summary().nextAction, "act only inside scope"],
    },
    {
      label: "swarm scale",
      tone: "accent" as GovernanceTone,
      rows: ["bounded workers", "independent proof", "reconcile conflicts", "single closure call"],
    },
    {
      label: "evidence ledger",
      tone: "success" as GovernanceTone,
      rows: ["diff evidence", "checks and runtime", "issue state", "release record"],
    },
  ]

  return (
    <box width="100%" flexGrow={1} minHeight={0} flexDirection="row" gap={1}>
      <For each={tracks()}>
        {(track) => (
          <box
            flexGrow={1}
            minWidth={0}
            backgroundColor={theme.backgroundPanel}
            border={["top"]}
            borderColor={tone(theme, track.tone)}
            paddingLeft={2}
            paddingRight={2}
            paddingTop={1}
            paddingBottom={1}
            flexDirection="column"
            gap={1}
          >
            <text fg={tone(theme, track.tone)}>
              <b>{track.label}</b>
            </text>
            <For each={track.rows}>
              {(item) => (
                <box flexDirection="row" gap={1} flexShrink={0}>
                  <text fg={theme.accent}>•</text>
                  <text fg={theme.textMuted}>{clip(item, 38)}</text>
                </box>
              )}
            </For>
            <box flexGrow={1} />
            <box border={["top"]} borderColor={theme.borderSubtle} paddingTop={1}>
              <text fg={theme.textMuted}>
                {track.label === "evidence ledger"
                  ? `${summary().changedFiles} diffs, ${summary().mcpConnected} tools`
                  : "ready"}
              </text>
            </box>
          </box>
        )}
      </For>
    </box>
  )
}

function LaneStrip() {
  const theme = useTheme().theme

  return (
    <box
      width="100%"
      backgroundColor={theme.backgroundPanel}
      paddingLeft={2}
      paddingRight={2}
      flexDirection="row"
      gap={2}
    >
      <For each={GOVERNANCE_LANES}>
        {(lane) => (
          <box flexGrow={1} minWidth={0} flexDirection="row" gap={1}>
            <text fg={tone(theme, lane.tone)}>
              <b>{lane.title}</b>
            </text>
            <text fg={theme.accent}>{lane.command}</text>
            <text fg={theme.textMuted}>{clip(lane.detail, 34)}</text>
          </box>
        )}
      </For>
    </box>
  )
}

function GovernanceDeck(props: { compact: boolean }) {
  return (
    <Show when={!props.compact} fallback={<CompactDeck />}>
      <WideDeck />
      <LaneStrip />
    </Show>
  )
}

function PromptLabel(props: { compact: boolean }) {
  const theme = useTheme().theme
  const summary = useSummary()

  return (
    <box
      width="100%"
      backgroundColor={theme.backgroundPanel}
      paddingLeft={1}
      paddingRight={1}
      flexDirection="row"
      gap={2}
    >
      <text fg={theme.accent}>
        <b>directive docket</b>
      </text>
      <Show when={!props.compact}>
        <text fg={theme.textMuted}>objective</text>
        <text fg={theme.text}>ask for the outcome</text>
      </Show>
      <text fg={theme.textMuted}>
        gate <span style={{ fg: theme.text }}>{summary().status}</span>
      </text>
      <text fg={theme.textMuted}>
        proof <span style={{ fg: theme.text }}>checks, diff, runtime</span>
      </text>
    </box>
  )
}

export function Home() {
  const sync = useSync()
  const project = useProject()
  const route = useRouteData("home")
  const promptRef = usePromptRef()
  const [ref, setRef] = createSignal<PromptRef | undefined>()
  const dimensions = useTerminalDimensions()
  const compact = createMemo(() => dimensions().width < 100 || dimensions().height < 28)
  const args = useArgs()
  const local = useLocal()
  let sent = false

  const bind = (r: PromptRef | undefined) => {
    setRef(r)
    promptRef.set(r)
    if (once || !r) return
    if (route.initialPrompt) {
      r.set(route.initialPrompt)
      once = true
      return
    }
    if (!args.prompt) return
    r.set({ input: args.prompt, parts: [] })
    once = true
  }

  // Wait for sync and model store to be ready before auto-submitting --prompt
  createEffect(() => {
    const r = ref()
    if (sent) return
    if (!r) return
    if (!sync.ready || !local.model.ready) return
    if (!args.prompt) return
    if (r.current.input !== args.prompt) return
    sent = true
    r.submit()
  })

  return (
    <>
      <box
        flexGrow={1}
        minHeight={0}
        paddingLeft={compact() ? 1 : 2}
        paddingRight={compact() ? 1 : 2}
        paddingTop={1}
        alignItems="center"
      >
        <box
          width="100%"
          maxWidth={compact() ? "100%" : 250}
          flexDirection="column"
          gap={compact() ? 0 : 1}
          flexGrow={1}
          minHeight={0}
        >
          <TuiPluginRuntime.Slot name="home_logo" mode="replace">
            <GovernanceDeck compact={compact()} />
          </TuiPluginRuntime.Slot>
          <Show when={!compact() && dimensions().height >= 32}>
            <RunwayBoard />
          </Show>
          <PromptLabel compact={compact()} />
          <box zIndex={1000} minWidth={0} flexShrink={0}>
            <TuiPluginRuntime.Slot
              name="home_prompt"
              mode="replace"
              workspace_id={project.workspace.current()}
              ref={bind}
            >
              <Prompt
                ref={bind}
                workspaceID={project.workspace.current()}
                right={<TuiPluginRuntime.Slot name="home_prompt_right" workspace_id={project.workspace.current()} />}
                placeholders={GOVERNANCE_HOME_PLACEHOLDERS}
              />
            </TuiPluginRuntime.Slot>
          </box>
          <Show when={!compact()}>
            <TuiPluginRuntime.Slot name="home_bottom" />
          </Show>
        </box>
        <Toast />
      </box>
      <box width="100%" flexShrink={0}>
        <TuiPluginRuntime.Slot name="home_footer" mode="single_winner" />
      </box>
    </>
  )
}
