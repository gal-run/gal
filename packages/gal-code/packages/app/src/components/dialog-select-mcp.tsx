import { useMutation } from "@tanstack/solid-query"
import { Component, createEffect, createMemo, on, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useSync } from "@/context/sync"
import { useSDK } from "@/context/sdk"
import { Dialog } from "@scheduler-systems/gal-code-ui/dialog"
import { List } from "@scheduler-systems/gal-code-ui/list"
import { Switch } from "@scheduler-systems/gal-code-ui/switch"
import { Button } from "@scheduler-systems/gal-code-ui/button"
import { showToast } from "@scheduler-systems/gal-code-ui/toast"
import { useLanguage } from "@/context/language"

const statusLabels = {
  connected: "mcp.status.connected",
  failed: "mcp.status.failed",
  needs_auth: "mcp.status.needs_auth",
  needs_client_registration: "mcp.status.needs_client_registration",
  disabled: "mcp.status.disabled",
} as const

const authRequiredStatuses = ["needs_auth", "needs_client_registration"] as const

export const DialogSelectMcp: Component = () => {
  const sync = useSync()
  const sdk = useSDK()
  const language = useLanguage()
  const [state, setState] = createStore({
    done: false,
    loading: false,
  })

  createEffect(
    on(
      () => sync.data.mcp_ready,
      (ready, prev) => {
        if (!ready && prev) setState("done", false)
      },
      { defer: true },
    ),
  )

  createEffect(() => {
    if (state.done || state.loading) return
    if (sync.data.mcp_ready) {
      setState("done", true)
      return
    }

    setState("loading", true)
    void sdk.client.mcp
      .status()
      .then((result) => {
        sync.set("mcp", result.data ?? {})
        sync.set("mcp_ready", true)
        setState("done", true)
      })
      .catch((err) => {
        setState("done", true)
        showToast({
          variant: "error",
          title: language.t("common.requestFailed"),
          description: err instanceof Error ? err.message : String(err),
        })
      })
      .finally(() => {
        setState("loading", false)
      })
  })

  const items = createMemo(() =>
    Object.entries(sync.data.mcp ?? {})
      .map(([name, status]) => ({ name, status: status.status }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  )

  const toggle = useMutation(() => ({
    mutationFn: async (name: string) => {
      const status = sync.data.mcp[name]
      if (status?.status === "connected") {
        await sdk.client.mcp.disconnect({ name })
      } else {
        await sdk.client.mcp.connect({ name })
      }

      const result = await sdk.client.mcp.status()
      if (result.data) sync.set("mcp", result.data)
    },
  }))

  const authenticate = useMutation(() => ({
    mutationFn: async (name: string) => {
      const result = await sdk.client.mcp.auth.authenticate({ name })
      if (result.data) sync.set("mcp", { ...sync.data.mcp, [name]: result.data })
    },
  }))

  const needsAuth = (name: string) => {
    const status = sync.data.mcp[name]?.status
    return authRequiredStatuses.includes(status as (typeof authRequiredStatuses)[number])
  }

  const enabledCount = createMemo(() => items().filter((i) => i.status === "connected").length)
  const totalCount = createMemo(() => items().length)

  return (
    <Dialog
      title={language.t("dialog.mcp.title")}
      description={language.t("dialog.mcp.description", { enabled: enabledCount(), total: totalCount() })}
    >
      <List
        search={{ placeholder: language.t("common.search.placeholder"), autofocus: true }}
        emptyMessage={language.t("dialog.mcp.empty")}
        key={(x) => x?.name ?? ""}
        items={items}
        filterKeys={["name", "status"]}
        sortBy={(a, b) => a.name.localeCompare(b.name)}
        onSelect={(x) => {
          if (!x || toggle.isPending) return
          toggle.mutate(x.name)
        }}
      >
        {(i) => {
          const mcpStatus = () => sync.data.mcp[i.name]
          const status = () => mcpStatus()?.status
          const statusLabel = () => {
            const key = status() ? statusLabels[status() as keyof typeof statusLabels] : undefined
            if (!key) return
            return language.t(key)
          }
          const error = () => {
            const s = mcpStatus()
            return s?.status === "failed" ? s.error : undefined
          }
          const enabled = () => status() === "connected"
          const requiresAuth = () => needsAuth(i.name)
          return (
            <div class="w-full flex items-center justify-between gap-x-3">
              <div class="flex flex-col gap-0.5 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="truncate">{i.name}</span>
                  <Show when={statusLabel()}>
                    <span class="text-11-regular text-text-weaker">{statusLabel()}</span>
                  </Show>
                  <Show when={toggle.isPending && toggle.variables === i.name}>
                    <span class="text-11-regular text-text-weak">{language.t("common.loading.ellipsis")}</span>
                  </Show>
                  <Show when={authenticate.isPending && authenticate.variables === i.name}>
                    <span class="text-11-regular text-text-weak">{language.t("mcp.authenticating")}</span>
                  </Show>
                </div>
                <Show when={error()}>
                  <span class="text-11-regular text-text-weaker truncate">{error()}</span>
                </Show>
              </div>
              <div class="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <Show when={requiresAuth()}>
                  <Button
                    size="small"
                    disabled={authenticate.isPending && authenticate.variables === i.name}
                    onClick={() => authenticate.mutate(i.name)}
                  >
                    {language.t("mcp.authenticate")}
                  </Button>
                </Show>
                <Switch
                  checked={enabled()}
                  disabled={(toggle.isPending && toggle.variables === i.name) || requiresAuth()}
                  onChange={() => {
                    if (toggle.isPending) return
                    toggle.mutate(i.name)
                  }}
                />
              </div>
            </div>
          )
        }}
      </List>
    </Dialog>
  )
}
