import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@scheduler-systems/gal-code-plugin/tui"
import { createMemo, createResource, createSignal, onCleanup, Show } from "solid-js"
import { summarizeGovernance } from "../governance/state"
import { useSDK } from "@/cli/cmd/tui/context/sdk"
import { useEvent } from "@/cli/cmd/tui/context/event"
import type { RuntimeSummary } from "@/governance/runtime"

const id = "internal:sidebar-governance"

function View(props: { api: TuiPluginApi; session_id: string }) {
  const theme = () => props.api.theme.current
  const sdk = useSDK()
  const event = useEvent()
  const vcs = createMemo(() => props.api.state.vcs)
  const perm = createMemo(() => props.api.state.session.permission(props.session_id) ?? [])
  const ques = createMemo(() => props.api.state.session.question(props.session_id) ?? [])
  const diff = createMemo(() => props.api.state.session.diff(props.session_id) ?? [])
  const lsp = createMemo(() => props.api.state.lsp() ?? [])
  const mcp = createMemo(() => props.api.state.mcp() ?? [])
  const [tick, setTick] = createSignal(0)
  const [sidecar] = createResource(
    () => [props.api.state.path?.directory || process.cwd(), props.session_id, tick()] as const,
    async ([dir, session]) => {
      const response = await sdk.client.session.governance
        .runtime({
          sessionID: session,
          directory: dir,
        })
        .catch(() => undefined)
      return response?.data as RuntimeSummary | undefined
    },
  )
  const stop = event.subscribe((payload) => {
    if (payload.type !== "governance.runtime.updated") return
    if (payload.properties.sessionID !== props.session_id) return
    setTick((value) => value + 1)
  })
  onCleanup(stop)
  const summary = createMemo(() => {
    return summarizeGovernance({
      config: props.api.state.config,
      branch: vcs()?.branch,
      directory: props.api.state.path?.directory,
      worktree: props.api.state.path?.worktree,
      permissions: perm(),
      questions: ques(),
      diffs: diff(),
      lsp: lsp(),
      mcp: mcp(),
      runtime: sidecar(),
    })
  })
  const color = createMemo(() => {
    if (summary().risk === "high") return theme().warning
    if (summary().risk === "medium") return theme().info
    return theme().success
  })
  const decision = createMemo(() => {
    if (summary().runtimeDecision === "hold_for_operator_review") return "hold"
    if (summary().runtimeDecision === "clear_for_operator_review") return "clear"
    return "idle"
  })

  return (
    <box gap={1}>
      <text fg={theme().text}>
        <b>Runtime signals</b>
      </text>
      <text fg={theme().textMuted}>
        ledger <span style={{ fg: theme().text }}>{summary().policy}</span>
      </text>
      <text fg={theme().textMuted}>
        runtime <span style={{ fg: color() }}>{summary().status}</span>
      </text>
      <text fg={summary().approvals > 0 ? theme().warning : theme().textMuted}>
        approvals {summary().approvals} pending
      </text>
      <text fg={summary().mcpAttention > 0 ? theme().warning : theme().textMuted}>
        swarm {summary().mcpConnected} linked, {summary().mcpAttention} attention
      </text>
      <text fg={summary().runtimeBlocked > 0 ? theme().warning : summary().runtimeHolds > 0 ? theme().info : theme().textMuted}>
        sidecar {summary().runtimeDecisions} scored, {summary().runtimeHolds} hold, {summary().runtimeBlocked} blocked
      </text>
      <Show when={summary().runtimeDecisions > 0}>
        <text fg={decision() === "hold" ? color() : theme().textMuted}>
          last <span style={{ fg: theme().text }}>{summary().runtimeTool || "tool"}</span> {decision()}{" "}
          {summary().runtimeConfidence.toFixed(2)}
        </text>
      </Show>
      <text fg={theme().textMuted}>diff {summary().changedFiles} files</text>
      <text fg={theme().textMuted}>lattice {summary().lsp} active</text>
      <text fg={theme().textMuted}>
        next <span style={{ fg: theme().text }}>{summary().nextAction}</span>
      </text>
      <Show when={summary().scope}>
        <text fg={theme().textMuted}>
          scope <span style={{ fg: theme().text }}>{summary().scope}</span>
        </text>
      </Show>
    </box>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 80,
    slots: {
      sidebar_content(_ctx, props) {
        return <View api={api} session_id={props.session_id} />
      },
    },
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id,
  tui,
}

export default plugin
