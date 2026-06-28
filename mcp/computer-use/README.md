# GAL Computer Use MCP

`@gal-run/gal-computer-use-mcp` — a [Model Context Protocol](https://modelcontextprotocol.io)
server that gives AI agents control of the local desktop: screenshots, mouse,
keyboard, application focus, and Chrome tab inspection on **macOS, Linux, and
Windows**, plus an **optional** UI-TARS vision-agent path for natural-language
GUI automation.

## Tools

### Core (no native dependencies)

These shell out to OS-native facilities and work out of the box:

- **macOS** — `screencapture`, `cliclick`, `osascript` (AppleScript / Accessibility).
- **Linux (X11)** — `scrot`/`import`, `xdotool`, `wmctrl` (with an `xdotool`
  fallback when `wmctrl` is absent), and **AT-SPI** (via `python3` + GObject
  introspection) for `computer_set_value` on the focused element.
- **Windows** — a small self-contained C# helper that is compiled once (via the
  in-box PowerShell C# compiler) and cached in `%TEMP%`, then invoked per action.
  It P/Invokes `user32` (`SendInput` Unicode typing, `mouse_event`,
  `SetCursorPos`), uses `System.Drawing` for screenshots, and **UI Automation**
  (`ValuePattern`) for `computer_set_value`. Requires Windows PowerShell + .NET
  Framework 4.x — both present on every Windows 10/11 — so there is nothing to
  install.

`computer_set_value` uses the real accessibility API on each platform (macOS
`AXValue`, Linux AT-SPI `EditableText`, Windows UIA `ValuePattern`) and falls
back to simulated typing when the focused element exposes no settable value.
The `computer_chrome_*` tools are a macOS AppleScript convenience; for
cross-platform browser automation use the separate `gal-chrome` MCP (Playwright).

| Tool | Description |
| --- | --- |
| `computer_screenshot` | Capture the screen to a file. |
| `computer_click` / `computer_right_click` / `computer_double_click` | Click at coordinates. |
| `computer_move` / `computer_move_instant` | Move the cursor. |
| `computer_type` / `computer_key` | Type text / press a named key. |
| `computer_scroll` / `computer_drag` | Scroll / drag. |
| `computer_app_state` / `computer_apps` / `computer_activate` | Inspect and focus apps. |
| `computer_set_value` | Set a focused element's value via the Accessibility API. |
| `computer_screen_size` / `computer_mouse_position` | Query geometry. |
| `computer_chrome_tabs` / `computer_chrome_active_tab` | List / read Chrome tabs. |
| `computer_chrome_highlight` / `computer_chrome_clear_highlight` | Overlay an "automation in progress" indicator. |

### UI-TARS vision agent (optional)

| Tool | Description |
| --- | --- |
| `computer_use_execute` | Run a natural-language GUI task with the UI-TARS vision model. |
| `computer_use_verify` | Screenshot + verify the screen matches a description. |
| `computer_use_pause` / `computer_use_resume` / `computer_use_stop` | Control a running task. |

These tools require the **optional** native extras:

```bash
npm i @ui-tars/sdk @ui-tars/operator-nut-js
```

If they are not installed, the core tools keep working and the UI-TARS tools
return a clear install hint. Configure the vision model via environment
variables (`UITARS_VLM_BASE_URL`, `UITARS_VLM_MODEL`, `UITARS_VLM_API_KEY`, or
one of `OPENROUTER_API_KEY` / `TOKENMIX_API_KEY` / `GEMINI_API_KEY` /
`VLM_GATEWAY_KEY`).

## Build & run

```bash
npm install
npm run build      # tsc -> dist/
npm start          # node dist/index.js (stdio MCP transport)
```

Unit tests (deps-free helpers) run locally with Node's built-in runner:

```bash
node --test --experimental-strip-types test/uitars.test.ts
```

## License

Apache-2.0 — see [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
