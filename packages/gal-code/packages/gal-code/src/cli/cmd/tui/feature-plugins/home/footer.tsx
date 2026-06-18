import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@scheduler-systems/gal-code-plugin/tui"
import { useTerminalDimensions } from "@opentui/solid"
import { createMemo, Match, Show, Switch } from "solid-js"
import { Global } from "@/global"
import { Locale } from "@/util/locale"

const id = "internal:home-footer"

function Directory(props: { api: TuiPluginApi }) {
  const theme = () => props.api.theme.current
  const dimensions = useTerminalDimensions()
  const dir = createMemo(() => {
    const dir = props.api.state.path.directory || process.cwd()
    const out = dir.replace(Global.Path.home, "~")
    const branch = props.api.state.vcs?.branch
    if (branch) return out + ":" + branch
    return out
  })

  const width = createMemo(() =>
    dimensions().width < 100 ? Math.max(18, dimensions().width - 34) : dimensions().width - 52,
  )

  return <text fg={theme().textMuted}>{Locale.truncateMiddle(dir(), width())}</text>
}

function Mcp(props: { api: TuiPluginApi }) {
  const theme = () => props.api.theme.current
  const list = createMemo(() => props.api.state.mcp())
  const has = createMemo(() => list().length > 0)
  const err = createMemo(() => list().some((item) => item.status === "failed"))
  const count = createMemo(() => list().filter((item) => item.status === "connected").length)

  return (
    <Show when={has()}>
      <box gap={1} flexDirection="row" flexShrink={0}>
        <text fg={theme().text}>
          <Switch>
            <Match when={err()}>
              <span style={{ fg: theme().error }}>⊙ </span>
            </Match>
            <Match when={true}>
              <span style={{ fg: count() > 0 ? theme().success : theme().textMuted }}>⊙ </span>
            </Match>
          </Switch>
          swarm {count()}/{list().length}
        </text>
        <text fg={theme().textMuted}>/status</text>
      </box>
    </Show>
  )
}

function Version(props: { api: TuiPluginApi }) {
  const theme = () => props.api.theme.current

  return (
    <box flexShrink={0}>
      <text fg={theme().textMuted}>GAL Code runtime {props.api.app.version}</text>
    </box>
  )
}

function View(props: { api: TuiPluginApi }) {
  const dimensions = useTerminalDimensions()
  const compact = createMemo(() => dimensions().width < 100 || dimensions().height < 28)

  return (
    <box
      width="100%"
      paddingTop={compact() ? 0 : 1}
      paddingBottom={compact() ? 0 : 1}
      paddingLeft={compact() ? 1 : 2}
      paddingRight={compact() ? 1 : 2}
      flexDirection="row"
      flexShrink={0}
      gap={2}
    >
      <Directory api={props.api} />
      <Mcp api={props.api} />
      <box flexGrow={1} />
      <Show when={!compact()}>
        <Version api={props.api} />
      </Show>
    </box>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 100,
    slots: {
      home_footer() {
        return <View api={api} />
      },
    },
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id,
  tui,
}

export default plugin
