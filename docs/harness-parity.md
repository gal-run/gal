# GAL harness parity with the reference MCPs

Goal (Shay): GAL's own harnesses should match the capability surface of the two reference
harnesses shipped in Claude Code — **`computer-use`** (desktop) and **`claude-in-chrome`**
(browser) — so an agent (e.g. MiniMax M3, a coordinate computer-use model) can drive GAL's
harnesses as reliably as it drives the reference ones. "Proper harness" is measured by this
parity, not by vibe.

Two GAL harnesses:
- **gal-browser** — `cli/src/mcp/browser.rs` (Rust, chromiumoxide/CDP) ⟷ reference `claude-in-chrome`.
- **GAL CU harness** — `apps/accessibility-app/.../GALComputerUse/main.swift` (macOS AX+CGEvent)
  and its X11 twin `gal_cu_linux.py` ⟷ reference `computer-use`.

Legend: ✅ have · 🟡 partial · ❌ gap · ⬚ N/A (security/host model differs).

> **Architecture note:** gal-browser drives its **own** headless Chromium over CDP (Playwright-style),
> not the user's real Chrome — so its `tab_*` tools manage tabs in *that* instance, and the extension
> being connected is irrelevant to it. Why we keep CDP (and don't rename to gal-chrome):
> [ADR 0001](adr/0001-browser-harness-cdp-not-chrome-extension.md).

## Browser: `claude-in-chrome` → gal-browser

| Reference capability | gal-browser today | Status |
|---|---|---|
| `computer` coordinate click/right/double/triple | `browser_computer` | ✅ runtime-verified |
| `computer` move/hover | `browser_computer` move | ✅ |
| `computer` left_click_drag | `browser_computer` left_click_drag | ✅ |
| `computer` scroll (at x,y) | `browser_computer` scroll | ✅ |
| `computer` type / key (focused) | `browser_computer` type/key | ✅ |
| `computer` scroll_to (by element ref) | `browser_find`/`read_a11y` coords + `browser_computer` scroll | ✅ (coord-based) |
| `computer` zoom (hi-res region) | `browser_zoom` | ✅ |
| `navigate` url | `browser_navigate` | ✅ |
| `navigate` back/forward (history) | `browser_navigate` back/forward | ✅ |
| `find` (NL element find) | `browser_find` ({role,name,x,y}) | ✅ |
| `read_page` (a11y tree, interactive filter) | `browser_read_a11y` + `browser_find` | ✅ |
| `get_page_text` | `browser_get_page_text` | ✅ |
| `form_input` (set value by ref) | `browser_form_input` (selector) | ✅ |
| `file_upload` / `upload_image` | `browser_file_upload` (setFileInputFiles) | ✅ |
| `javascript_tool` | `browser_execute_script` | ✅ |
| `read_console_messages` (pattern/onlyErrors) | `browser_read_console` (pattern + onlyErrors) | ✅ |
| `read_network_requests` (urlPattern) | `browser_read_network` (pattern) | ✅ |
| `resize_window` | `browser_resize` | ✅ |
| tabs context/create/close | `browser_tab_new`/`tab_list`/`tab_select`/`tab_close` | ✅ |
| `*_batch` (sequence in one call) | `browser_batch` | ✅ |
| `gif_creator` | — | ⬚ (demo-studio owns recording/polish) |
| list/select/switch_browser, shortcuts | launches own headless chrome | ⬚ (single managed browser) |

## Desktop: `computer-use` → GAL CU harness (macOS Swift + X11 Python)

| Reference capability | GAL CU today | Status |
|---|---|---|
| `screenshot` | `screenshot` | ✅ |
| `left_click` / `right_click` / `middle_click` | `click` (button) | ✅ |
| `double_click` / `triple_click` | `click` (click_count) | ✅ |
| click **modifiers** (e.g. shift+click) | `click` modifiers | ✅ (Swift+X11) |
| `mouse_move` | `move` | ✅ |
| `left_click_drag` | `left_click_drag`/`drag` | ✅ (Swift+X11) |
| `left_mouse_down` / `left_mouse_up` | `left_mouse_down`/`left_mouse_up` | ✅ (Swift+X11) |
| `scroll` | `scroll` | ✅ |
| `key` (chord + repeat) | `key` (+modifiers +repeat) | ✅ (Swift+X11) |
| `hold_key` (press+hold duration) | `hold_key` | ✅ (Swift+X11) |
| `type` | `type` | ✅ |
| `cursor_position` | `cursor_position` | ✅ (Swift+X11) |
| `zoom` (hi-res region) | `zoom` | ✅ (Swift+X11) |
| `read_clipboard` / `write_clipboard` | `read_clipboard`/`write_clipboard` | ✅ (Swift+X11) |
| `wait` | (client-side) | ⬚ |
| `switch_display` (multi-monitor) | `switch_display` | ✅ (Swift+X11) |
| `open_application` | `open_application` | ✅ (Swift+X11) |
| `*_batch` (sequence in one call) | `batch` | ✅ (Swift+X11) |
| `request_access` / `list_granted_applications` | — | ⬚ (GAL uses sandbox/grant model, not per-app allowlist) |
| `get_app_state` (AX/window tree) | `get_app_state` | ✅ (GAL extra; reference has none) |

## Status — FULL COVERAGE

Every reference capability that isn't ⬚ (architecturally N/A) is now ✅ on GAL's harnesses.

- **gal-browser** (vs `claude-in-chrome`): `browser_computer` (coordinate click/move/drag/
  scroll/type/key), navigate back/forward, find, form_input, file_upload, zoom, resize,
  read_console (+onlyErrors), tabs (new/list/select/close), batch. **Runtime-verified:
  P0 5/5, P1 5/5, P2 8/8, console 2/2** through the real gal binary driving Chrome.
- **CU harness** (vs `computer-use`, macOS Swift + X11 Python, 20 actions each): click
  (+modifiers/count), move, drag, mouse_down/up, scroll, key (+repeat), hold_key, type,
  cursor_position, zoom, clipboard r/w, switch_display, open_application, batch,
  screenshot, get_app_state. **swift build green; X11 py_compile + 20/20 dispatch.**
  (Runtime-driving macOS CU needs a TCC grant; X11 needs the Xvfb container — both gated.)

⬚ (deliberately not built, justified): `gif_creator` (demo-studio owns recording/polish);
list/select/switch_browser + shortcuts (GAL manages one headless browser); `request_access`/
`list_granted_applications`/`wait` (GAL uses a sandbox/grant model + client-side waits).
