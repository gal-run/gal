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

## Browser: `claude-in-chrome` → gal-browser

| Reference capability | gal-browser today | Status |
|---|---|---|
| `computer` coordinate click/right/double/triple | (selector `browser_click` only) | ❌ → **`browser_computer`** (this branch) |
| `computer` move/hover | — | ❌ → `browser_computer` move |
| `computer` left_click_drag | — | ❌ → `browser_computer` left_click_drag |
| `computer` scroll (at x,y) | — | ❌ → `browser_computer` scroll |
| `computer` type / key (focused) | selector `browser_type_text` | ❌ coord → `browser_computer` type/key |
| `computer` scroll_to (by element ref) | — | ❌ (use read_a11y coords + scroll) |
| `computer` zoom (hi-res region) | — | ❌ (P2) |
| `navigate` url | `browser_navigate` | ✅ |
| `navigate` back/forward (history) | — | ❌ (P1) |
| `find` (NL element find) | — | ❌ (P2; read_a11y is the bridge) |
| `read_page` (a11y tree, interactive filter) | `browser_read_a11y` ({role,name,x,y}) | 🟡 |
| `get_page_text` | `browser_get_page_text` | ✅ |
| `form_input` (set value by ref) | `browser_type_text` (selector) | 🟡 (P2) |
| `file_upload` / `upload_image` | — | ❌ (P2) |
| `javascript_tool` | `browser_execute_script` | ✅ |
| `read_console_messages` (pattern/onlyErrors) | `browser_read_console` (pattern) | 🟡 (add onlyErrors) |
| `read_network_requests` (urlPattern) | `browser_read_network` (pattern) | ✅ |
| `resize_window` | width/height at launch only | ❌ (P1) |
| tabs context/create/close | single page | ❌ (P2, multi-tab) |
| `*_batch` (sequence in one call) | — | ❌ (P1) |
| `gif_creator` | — | ⬚ (demo-studio owns recording/polish) |
| list/select/switch_browser, shortcuts | launches own headless chrome | ⬚ |

## Desktop: `computer-use` → GAL CU harness (macOS Swift + X11 Python)

| Reference capability | GAL CU today | Status |
|---|---|---|
| `screenshot` | `screenshot` | ✅ |
| `left_click` / `right_click` / `middle_click` | `click` (button) | ✅ |
| `double_click` / `triple_click` | `click` (click_count) | ✅ |
| click **modifiers** (e.g. shift+click) | click has no modifiers | ❌ (P1) |
| `mouse_move` | `move` | ✅ |
| `left_click_drag` | — | ❌ (P1) |
| `left_mouse_down` / `left_mouse_up` | — | ❌ (P1) |
| `scroll` | `scroll` | ✅ |
| `key` (chord + repeat) | `key` (+modifiers) | 🟡 (add repeat) |
| `hold_key` (press+hold duration) | — | ❌ (P1) |
| `type` | `type` | ✅ |
| `cursor_position` | — | ❌ (P1) |
| `zoom` (hi-res region) | — | ❌ (P2) |
| `read_clipboard` / `write_clipboard` | — | ❌ (P2) |
| `wait` | (client-side) | ⬚ |
| `switch_display` (multi-monitor) | — | ❌ (P2) |
| `open_application` | — | 🟡 (macOS can; X11 n/a) |
| `*_batch` (sequence in one call) | — | ❌ (P1) |
| `request_access` / `list_granted_applications` | — | ⬚ (GAL uses sandbox/grant model, not per-app allowlist) |
| `get_app_state` (AX/window tree) | `get_app_state` | ✅ (GAL extra; reference has none) |

## Priority order

- **P0 — `browser_computer`** (this branch): native coordinate click/move/drag/scroll/type/key
  in gal-browser. Unblocks a coordinate model (MiniMax) driving gal-browser natively and
  retires the `execute_script` event-synthesis bridge in the QA driver.
- **P1 — symmetric input gaps**: drag, mouse_down/up, hold_key, click-modifiers, cursor_position,
  key-repeat on the CU harness (Swift + X11); navigate back/forward, resize_window, batch on
  gal-browser.
- **P2 — richer surface**: zoom, clipboard, multi-monitor, tabs, find/form_input/file_upload.

Done = every ❌ that isn't ⬚ becomes ✅/🟡, verified by build + a live drive on each harness.
