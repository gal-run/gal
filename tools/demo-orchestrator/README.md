# demo-orchestrator

The thin glue that turns an agent's GUI run into a polished demo video. It sequences two
existing GAL components — it does **not** actuate or record anything itself:

```
                 demo-orchestrator (this tool — sequences a demo spec)
                    │                                   │
        actions     ▼                          record + polish
   ┌────────────────────────┐            ┌──────────────────────────────┐
   │ GALComputerUse (Swift)  │            │ demo-studio (@gal-run/...)   │
   │ move/click/type/key     │            │ start_recording, zoom,       │
   │ + live cursor glide     │            │ captions, voiceover, export  │
   └────────────────────────┘            └──────────────────────────────┘
        (does the task)                       (makes it look good)
```

This is the actuator-agnostic seam between **doing the task** (a harness) and **making it
look good** (demo-studio). The harness can be `GALComputerUse` (desktop) today; a headed
browser driven by `gal-browser` slots into the same "actions" lane.

## Cursor ownership (resolved): LIVE mode

demo-studio's MCP `start_recording` exposes no cursor-hide option, so the **real** cursor
is always recorded. Therefore **GALComputerUse owns the cursor** — it animates a human-like
eased glide live (built in, `gal#502`) — and demo-studio adds only **zoom + captions** in
post. One cursor, no double-smoothing.

> SYNTH mode (demo-studio draws a synthetic cursor; run the helper with `GAL_CU_INSTANT=1`
> to disable its live glide) would need a `showCursor:false` parameter that demo-studio's
> `start_recording` MCP tool does not yet expose. It is intentionally **not** wired here —
> add that MCP param first, then enable `cursor: "synth"`.

## Demo spec

A JSON file; each step is one action, optionally decorated with a caption and/or zoom that
demo-studio renders in post at the same point on the timeline. See
[`examples/gal-run-search.json`](examples/gal-run-search.json).

```jsonc
{
  "name": "gal-run-search-demo",
  "output": "demo.mp4",
  "cursor": "live",
  "screen":    { "width": 1920, "height": 1080 },   // for zoom pixel→0-1 normalization
  "recording": { "fps": 30, "captureAudio": false },
  "export":    { "resolution": { "width": 1920, "height": 1080 }, "quality": "high" },
  "steps": [
    { "action": "move",  "x": 960, "y": 120, "duration": 0.8, "caption": "Open the dashboard" },
    { "action": "click", "x": 960, "y": 120, "duration": 1.0, "caption": "Focus search",
      "zoom": { "scale": 2.0, "easing": "ease-in-out" } },
    { "action": "type",  "text": "governance policy", "duration": 1.2 },
    { "action": "key",   "key": "return", "duration": 1.5 },
    { "action": "wait",  "duration": 1.0 }
  ]
}
```

Actions (`move`, `click`, `type`, `key`, `scroll`) route to GALComputerUse; `wait` only
advances the timeline. `duration` (alias `settle`) is how long to hold before the next step
— it also models the timeline used to schedule effects, and is slept during a live run so
wall-clock ≈ modeled time.

## Usage

```bash
# 1. Inspect the plan — no recording, no actuation, no permissions needed
python3 demo_orchestrator.py examples/gal-run-search.json --dry-run

# 2. Probe both endpoints (demo-studio handshake + GALComputerUse ping)
python3 demo_orchestrator.py --check

# 3. Run for real (foreground; see permissions below)
python3 demo_orchestrator.py examples/gal-run-search.json
```

`demo-studio` is resolved from `@gal-run/demo-studio` via `npx` by default; point
`DEMO_STUDIO_SERVER` at a built `dist/mcp/server.js` to use a local checkout. The
GALComputerUse socket defaults to
`~/Library/Application Support/GALComputerUse/helper.sock` (override with `--socket`).

## A live run needs the foreground + macOS permissions

Recording and driving the desktop are TCC-gated and take over the screen, so a real run
happens on the machine doing the demo, not headless:

1. Start the **GALComputerUse** helper (grant it **Accessibility**) — it prints
   `listening on …/helper.sock`.
2. Ensure **demo-studio** can record (grant the terminal/node **Screen Recording**) and a
   system `ffmpeg`/`ffprobe` is on `$PATH`.
3. `python3 demo_orchestrator.py <spec>.json` → records, drives, polishes, exports.

`--dry-run` and `--check` need none of this.

## Tests

```bash
python3 -m unittest test_demo_orchestrator -v   # 14 pure tests (plan + message formats)
```
