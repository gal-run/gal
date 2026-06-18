import { TextAttributes, RGBA } from "@opentui/core"
import { fileURLToPath } from "bun"
import { useTheme } from "../context/theme"
import { useDialog } from "@tui/ui/dialog"
import { useSync } from "@tui/context/sync"
import { For, Match, Switch, Show, createMemo } from "solid-js"
import { useSDK } from "@tui/context/sdk"
import { useToast } from "@tui/ui/toast"

export type DialogStatusProps = {}

function McpServerRow(props: { name: string; status: any }) {
  const { theme } = useTheme()
  const sync = useSync()
  const sdk = useSDK()
  const toast = useToast()
  const dialog = useDialog()

  const statusColor = createMemo(() => {
    switch (props.status.status) {
      case "connected": return theme.success
      case "failed": return theme.error
      case "disabled": return theme.textMuted
      case "needs_auth": return theme.warning
      case "needs_client_registration": return theme.error
      default: return theme.textMuted
    }
  })

  const statusText = createMemo(() => {
    switch (props.status.status) {
      case "connected": return "Connected"
      case "failed": return props.status.error || "Failed"
      case "disabled": return "Disabled"
      case "needs_auth": return "Needs authentication"
      case "needs_client_registration": return props.status.error || "Needs setup"
      default: return props.status.status
    }
  })

  const isGalVision = () => props.name === "gal-vision"

  const handleReconnect = async () => {
    try {
      if (props.status.status === "connected") {
        await sdk.client.mcp.disconnect({ name: props.name })
      }
      await sdk.client.mcp.connect({ name: props.name })
      const status = await sdk.client.mcp.status()
      if (status.data) sync.set("mcp", status.data)
      toast.show({ variant: "success", message: `${props.name} reconnected`, duration: 2000 })
    } catch (error) {
      toast.show({ variant: "error", message: `Failed to reconnect ${props.name}`, duration: 3000 })
    }
  }

  return (
    <box flexDirection="row" gap={1}>
      <text flexShrink={0} style={{ fg: statusColor() }}>●</text>
      <text fg={theme.text} wrapMode="word">
        <b>{props.name}</b>{" "}
        <span style={{ fg: theme.textMuted }}>{statusText()}</span>
      </text>
      <Show when={props.status.status !== "connected"}>
        <text 
          fg={theme.primary} 
          style={{ attributes: TextAttributes.UNDERLINE }}
          onMouseUp={handleReconnect}
        >
          [reconnect]
        </text>
      </Show>
    </box>
  )
}

export function DialogStatus() {
  const sync = useSync()
  const { theme } = useTheme()
  const dialog = useDialog()

  const enabledFormatters = createMemo(() => sync.data.formatter.filter((f) => f.enabled))

  const plugins = createMemo(() => {
    const list = sync.data.config.plugin ?? []
    const result = list.map((item) => {
      const value = typeof item === "string" ? item : item[0]
      if (value.startsWith("file://")) {
        const path = fileURLToPath(value)
        const parts = path.split("/")
        const filename = parts.pop() || path
        if (!filename.includes(".")) return { name: filename }
        const basename = filename.split(".")[0]
        if (basename === "index") {
          const dirname = parts.pop()
          const name = dirname || basename
          return { name }
        }
        return { name: basename }
      }
      const index = value.lastIndexOf("@")
      if (index <= 0) return { name: value, version: "latest" }
      const name = value.substring(0, index)
      const version = value.substring(index + 1)
      return { name, version }
    })
    return result.toSorted((a, b) => a.name.localeCompare(b.name))
  })

  const mcpServerCount = createMemo(() => Object.keys(sync.data.mcp).length)
  const mcpConnectedCount = createMemo(() => 
    Object.values(sync.data.mcp).filter((x) => x.status === "connected").length
  )
  const mcpHasErrors = createMemo(() => 
    Object.values(sync.data.mcp).some((x) => x.status === "failed")
  )

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          Status
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>
      <Show when={mcpServerCount() > 0} fallback={<text fg={theme.text}>No MCP Servers</text>}>
        <box>
          <box flexDirection="row" gap={1}>
            <text fg={theme.text}>
              <b>{mcpServerCount()} MCP Servers</b>
            </text>
            <text fg={mcpHasErrors() ? theme.error : mcpConnectedCount() === mcpServerCount() ? theme.success : theme.warning}>
              ({mcpConnectedCount()}/{mcpServerCount()} connected)
            </text>
          </box>
          <For each={Object.entries(sync.data.mcp).sort((a, b) => a[0].localeCompare(b[0]))}>
            {([key, item]) => <McpServerRow name={key} status={item} />}
          </For>
        </box>
      </Show>
      {sync.data.lsp.length > 0 && (
        <box>
          <text fg={theme.text}>{sync.data.lsp.length} LSP Servers</text>
          <For each={sync.data.lsp}>
            {(item) => (
              <box flexDirection="row" gap={1}>
                <text
                  flexShrink={0}
                  style={{
                    fg: {
                      connected: theme.success,
                      error: theme.error,
                    }[item.status],
                  }}
                >
                  •
                </text>
                <text fg={theme.text} wrapMode="word">
                  <b>{item.id}</b> <span style={{ fg: theme.textMuted }}>{item.root}</span>
                </text>
              </box>
            )}
          </For>
        </box>
      )}
      <Show when={enabledFormatters().length > 0} fallback={<text fg={theme.text}>No Formatters</text>}>
        <box>
          <text fg={theme.text}>{enabledFormatters().length} Formatters</text>
          <For each={enabledFormatters()}>
            {(item) => (
              <box flexDirection="row" gap={1}>
                <text
                  flexShrink={0}
                  style={{
                    fg: theme.success,
                  }}
                >
                  •
                </text>
                <text wrapMode="word" fg={theme.text}>
                  <b>{item.name}</b>
                </text>
              </box>
            )}
          </For>
        </box>
      </Show>
      <Show when={plugins().length > 0} fallback={<text fg={theme.text}>No Plugins</text>}>
        <box>
          <text fg={theme.text}>{plugins().length} Plugins</text>
          <For each={plugins()}>
            {(item) => (
              <box flexDirection="row" gap={1}>
                <text
                  flexShrink={0}
                  style={{
                    fg: theme.success,
                  }}
                >
                  •
                </text>
                <text wrapMode="word" fg={theme.text}>
                  <b>{item.name}</b>
                  {item.version && <span style={{ fg: theme.textMuted }}> @{item.version}</span>}
                </text>
              </box>
            )}
          </For>
        </box>
      </Show>
    </box>
  )
}
