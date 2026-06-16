# gal-accessibility-app

A minimal macOS helper for desktop automation via accessibility APIs.

## What it does

- **Click** - Mouse clicks at coordinates (left/right/middle, single/double/triple)
- **Type** - Types text via keyboard events
- **Key press** - Presses special keys (Enter, Tab, Escape, arrows, F-keys) with modifiers (Cmd, Shift, Option, Ctrl)
- **Move mouse** - Moves cursor to coordinates
- **Scroll** - Horizontal and vertical scroll
- **Screenshot** - Captures screen, window, or selection as base64 PNG
- **Get app state** - Returns accessibility tree of frontmost or specified app

## IPC Protocol

Listens on a per-user Unix domain socket:
`~/Library/Application Support/GALComputerUse/helper.sock`
(created mode `0600` inside a `0700` directory — owner-only).

Send JSON commands, receive JSON responses.

### Commands

```json
{"action": "ping"}
{"action": "screenshot", "window": "screen"}
{"action": "screenshot", "window": "window"}
{"action": "screenshot", "window": "selection"}
{"action": "click", "x": 100, "y": 200, "button": "left", "click_count": 1}
{"action": "type", "text": "Hello World"}
{"action": "key", "key": "enter", "modifiers": ["command"]}
{"action": "move", "x": 500, "y": 300}
{"action": "scroll", "scroll_x": 0, "scroll_y": -100}
{"action": "get_app_state"}
{"action": "get_app_state", "app": "com.apple.Safari"}
```

### Response format

```json
{"status": "success", "message": "..."}
{"image": "<base64>", "width": 0, "height": 0}
{"app": "Safari", "root": {...}}
{"error": "..."}
```

## Building

```bash
swift build -c release
```

The binary will be at `.build/release/gal-accessibility-app`.

## Requirements

- macOS 12+
- Accessibility permissions (System Settings > Privacy & Security > Accessibility)

## Security / Trust model

This helper exposes mouse, keyboard, screen-capture, and accessibility-tree
control over a local IPC channel. Treat it as a privileged local capability and
run it only as your own user. Its trust boundary is the local user account:

- **Per-user, owner-only socket.** The listening socket is created at
  `~/Library/Application Support/GALComputerUse/helper.sock` with mode `0600`
  inside a `0700` directory (bind happens under `umask 0077`, followed by an
  explicit `chmod`). It is **not** placed in world-writable `/tmp`, so other
  local users cannot reach it.
- **Peer authentication.** On every connection the helper calls `getpeereid()`
  and rejects (closes) any client whose effective UID differs from its own. Only
  processes running as the same user can issue commands.
- **No caller-controlled file writes.** The `screenshot` action always writes to
  a randomized, helper-owned temp file in the per-user scratch dir, returns the
  image as base64, and deletes the temp file. There is **no** `output_path`
  option — accepting an arbitrary path would be an arbitrary-file-write
  primitive (path-traversal / symlink risk).
- **Bounded requests.** Each request is read with a socket read timeout and a
  hard size cap (1 MiB); oversized or stalled requests are rejected rather than
  buffered without limit.

This is **not** a remote service and must never be exposed over the network.
Anyone who can run code as your user already has full control of your session;
the controls above defend against *other* local users and untrusted local
processes, not against malware running as you.
