import { createMemo, createSignal, Show, createEffect, on } from "solid-js"
import { useLocal } from "@tui/context/local"
import { useSync } from "@tui/context/sync"
import { map, pipe, entries, sortBy } from "remeda"
import { DialogSelect, type DialogSelectOption } from "@tui/ui/dialog-select"
import { useTheme } from "../context/theme"
import { Keybind } from "@/util/keybind"
import { TextAttributes, RGBA } from "@opentui/core"
import { useSDK } from "@tui/context/sdk"
import { useToast } from "@tui/ui/toast"
import { useDialog } from "@tui/ui/dialog"
import { DialogConfirm } from "@tui/ui/dialog-confirm"
import { DialogAlert } from "@tui/ui/dialog-alert"
import open from "open"

type McpStatusType = "connected" | "failed" | "disabled" | "needs_auth" | "needs_client_registration"

type McpTool = {
  name: string
  description?: string
}

function StatusIndicator(props: { status: McpStatusType; loading: boolean }) {
  const { theme } = useTheme()
  if (props.loading) {
    return <text style={{ fg: theme.textMuted }}>⋯ reconnecting</text>
  }
  switch (props.status) {
    case "connected":
      return <text style={{ fg: theme.success, attributes: TextAttributes.BOLD }}>● connected</text>
    case "failed":
      return <text style={{ fg: theme.error }}>○ failed</text>
    case "disabled":
      return <text style={{ fg: theme.textMuted }}>○ disabled</text>
    case "needs_auth":
      return <text style={{ fg: theme.warning }}>○ needs auth</text>
    case "needs_client_registration":
      return <text style={{ fg: theme.error }}>○ needs setup</text>
    default:
      return <text style={{ fg: theme.textMuted }}>○ unknown</text>
  }
}

function StatusFooter(props: { 
  name: string
  status: McpStatusType
  error?: string
  loading: boolean 
}) {
  const { theme } = useTheme()
  return (
    <box flexDirection="row" gap={1}>
      <StatusIndicator status={props.status} loading={props.loading} />
      <Show when={props.status === "failed" && props.error}>
        <text fg={theme.textMuted} wrapMode="none" overflow="hidden">
          {props.error?.slice(0, 30)}
        </text>
      </Show>
    </box>
  )
}

function DialogMcpTools(props: { 
  serverName: string
  onBack: () => void
  onReconnect: () => void
  onAuth: () => void
  status: McpStatusType
}) {
  const { theme } = useTheme()
  const sdk = useSDK()
  const toast = useToast()
  const [tools, setTools] = createSignal<McpTool[]>([])
  const [loading, setLoading] = createSignal(true)

  createEffect(on(() => props.serverName, async () => {
    setLoading(true)
    try {
      const response = await sdk.fetch(`${sdk.url}/mcp/${props.serverName}/tools`)
      if (response.ok) {
        const data = await response.json()
        setTools(data)
      }
    } catch (error) {
      console.error("Failed to fetch tools:", error)
    } finally {
      setLoading(false)
    }
  }))

  const options = createMemo(() => {
    return tools().map((tool) => ({
      value: tool.name,
      title: tool.name,
      description: tool.description?.slice(0, 60),
      category: undefined,
    }))
  })

  return (
    <box flexDirection="column" gap={1} paddingLeft={2} paddingRight={2}>
      <box flexDirection="row" gap={1}>
        <text fg={theme.primary} onMouseUp={props.onBack}>← back</text>
        <text fg={theme.text}> </text>
        <text fg={theme.text} style={{ attributes: TextAttributes.BOLD }}>{props.serverName}</text>
        <text fg={theme.textMuted}> tools</text>
      </box>
      <Show when={loading()}>
        <text fg={theme.textMuted}>Loading tools...</text>
      </Show>
      <Show when={!loading() && tools().length === 0}>
        <text fg={theme.textMuted}>No tools available (server may be disconnected)</text>
      </Show>
      <Show when={!loading() && tools().length > 0}>
        <DialogSelect
          title={`${props.serverName} Tools (${tools().length})`}
          options={options()}
          onSelect={() => {}}
        />
      </Show>
    </box>
  )
}

export function DialogMcp() {
  const local = useLocal()
  const sync = useSync()
  const sdk = useSDK()
  const toast = useToast()
  const dialog = useDialog()
  const [loading, setLoading] = createSignal<string | null>(null)
  const [selectedServer, setSelectedServer] = createSignal<string | null>(null)

  const isGalVision = (name: string) => name === "gal-vision"

  const options = createMemo(() => {
    const mcpData = sync.data.mcp
    const loadingMcp = loading()

    return pipe(
      mcpData ?? {},
      entries(),
      sortBy(([name]) => name),
      map(([name, status]) => ({
        value: name,
        title: name,
        description: status.status === "failed" 
          ? status.error?.slice(0, 50) 
          : status.status === "needs_auth"
            ? "Press 'a' to authenticate"
            : status.status === "connected"
              ? "Press 'enter' to view tools"
              : undefined,
        footer: <StatusFooter 
          name={name} 
          status={status.status} 
          error={status.status === "failed" ? status.error : undefined}
          loading={loadingMcp === name} 
        />,
        category: undefined,
      })),
    )
  })

  const refreshStatus = async () => {
    const status = await sdk.client.mcp.status()
    if (status.data) {
      sync.set("mcp", status.data)
    }
  }

  const reconnectServer = async (name: string) => {
    if (loading() !== null) return
    setLoading(name)
    try {
      const mcpStatus = sync.data.mcp[name]
      if (mcpStatus?.status === "connected") {
        await sdk.client.mcp.disconnect({ name })
      }
      await sdk.client.mcp.connect({ name })
      await refreshStatus()
      toast.show({ variant: "success", message: `${name} reconnected`, duration: 2000 })
    } catch (error) {
      console.error("Failed to reconnect MCP:", error)
      toast.show({ 
        variant: "error", 
        message: `Failed to reconnect ${name}: ${error instanceof Error ? error.message : String(error)}`,
        duration: 3000 
      })
    } finally {
      setLoading(null)
    }
  }

  const authenticateServer = async (name: string) => {
    if (loading() !== null) return
    setLoading(name)
    try {
      const result = await sdk.client.mcp.auth.start({ name })
      if (result.data?.authorizationUrl) {
        await DialogAlert.show(
          dialog,
          "OAuth Authentication",
          `Opening browser for ${name} authentication. Complete the flow in your browser.`,
        )
        await open(result.data.authorizationUrl)
        toast.show({ variant: "info", message: "Browser opened for authentication", duration: 3000 })
      }
    } catch (error) {
      console.error("Failed to start auth:", error)
      toast.show({ 
        variant: "error", 
        message: `Failed to start auth for ${name}`,
        duration: 3000 
      })
    } finally {
      setLoading(null)
    }
  }

  const promptGeminiApiKey = async () => {
    const confirmed = await DialogConfirm.show(
      dialog,
      "GEMINI_API_KEY",
      "This will open your browser to Google AI Studio to get an API key. Set the GEMINI_API_KEY environment variable after obtaining it.",
      "cancel",
    )
    if (confirmed) {
      await open("https://aistudio.google.com/app/apikey")
      toast.show({ 
        variant: "info", 
        message: "Set GEMINI_API_KEY environment variable and restart gal.run",
        duration: 5000 
      })
    }
  }

  const showTools = (name: string) => {
    const status = sync.data.mcp[name]
    if (status?.status !== "connected") {
      toast.show({ variant: "error", message: `${name} is not connected`, duration: 2000 })
      return
    }
    setSelectedServer(name)
  }

  const keybinds = createMemo(() => [
    {
      keybind: Keybind.parse("space")[0],
      title: "toggle",
      onTrigger: async (option: DialogSelectOption<string>) => {
        if (loading() !== null) return
        setLoading(option.value)
        try {
          await local.mcp.toggle(option.value)
          await refreshStatus()
        } catch (error) {
          console.error("Failed to toggle MCP:", error)
        } finally {
          setLoading(null)
        }
      },
    },
    {
      keybind: Keybind.parse("r")[0],
      title: "reconnect",
      onTrigger: async (option: DialogSelectOption<string>) => {
        await reconnectServer(option.value)
      },
    },
    {
      keybind: Keybind.parse("a")[0],
      title: "auth",
      onTrigger: async (option: DialogSelectOption<string>) => {
        const status = sync.data.mcp[option.value]
        if (status?.status === "needs_auth") {
          await authenticateServer(option.value)
        } else if (isGalVision(option.value)) {
          await promptGeminiApiKey()
        }
      },
    },
    {
      keybind: Keybind.parse("shift+r")[0],
      title: "refresh all",
      side: "right" as const,
      onTrigger: async () => {
        if (loading() !== null) return
        toast.show({ variant: "info", message: "Refreshing all MCP servers...", duration: 2000 })
        await refreshStatus()
      },
    },
  ])

  return (
    <Show 
      when={selectedServer() === null} 
      fallback={
        <DialogMcpTools 
          serverName={selectedServer()!}
          onBack={() => setSelectedServer(null)}
          onReconnect={() => {
            const server = selectedServer()
            if (server) reconnectServer(server)
          }}
          onAuth={() => {
            const server = selectedServer()
            if (server) {
              const status = sync.data.mcp[server]
              if (status?.status === "needs_auth") {
                authenticateServer(server)
              } else if (isGalVision(server)) {
                promptGeminiApiKey()
              }
            }
          }}
          status={sync.data.mcp[selectedServer()!]?.status ?? "disabled"}
        />
      }
    >
      <DialogSelect
        title="MCP Servers"
        placeholder="Search MCP servers"
        options={options()}
        keybind={keybinds()}
        onSelect={(option) => showTools(option.value)}
      />
    </Show>
  )
}
