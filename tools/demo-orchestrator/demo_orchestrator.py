#!/usr/bin/env python3
"""GAL demo orchestrator — the thin glue that turns an agent's GUI run into a polished demo.

It drives two existing GAL components, each in its own lane:

  - GALComputerUse (Swift, macOS): performs the on-screen ACTIONS (move/click/type/key/
    scroll) over a Unix socket. It owns the cursor and animates it with a human-like
    eased glide (built in; see gal#502).
  - demo-studio (@gal-run/demo-studio, MCP over stdio): RECORDS the screen and adds the
    POLISH (zoom regions, captions, voiceover) in post.

This orchestrator does NOT actuate or record itself — it sequences the two so a single
demo spec produces a finished video. It is the actuator-agnostic seam between "doing the
task" (a harness) and "making it look good" (demo-studio).

Cursor ownership (resolved): LIVE mode (default). demo-studio's MCP `start_recording`
exposes no cursor-hide option, so the real cursor is always recorded — therefore
GALComputerUse owns the cursor (live glide) and demo-studio adds only zoom + captions.
No synthetic cursor, so no double cursor. SYNTH mode (demo-studio draws the cursor,
helper run with GAL_CU_INSTANT=1) would need a `showCursor:false` MCP param demo-studio
does not yet expose; it is documented in README but not wired here.

A real run needs macOS Screen Recording (demo-studio) + Accessibility (GALComputerUse)
permissions and takes the foreground — run it on the machine doing the demo. Use
--dry-run to print the plan, or --check to probe both endpoints, without any of that.
"""
from __future__ import annotations

import argparse
import json
import os
import socket
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

DEFAULT_SOCKET = os.path.expanduser(
    "~/Library/Application Support/GALComputerUse/helper.sock"
)
DEFAULT_SCREEN = {"width": 1920, "height": 1080}
ACTION_STEPS = {"move", "click", "type", "key", "scroll"}


# ─────────────────────────────────────────────────────────────────────────────
# Spec → plan (pure; fully unit-testable, no I/O)
# ─────────────────────────────────────────────────────────────────────────────
@dataclass
class Op:
    """One scheduled operation in the demo timeline."""

    t: float  # seconds from recording start
    target: str  # 'cu' (GALComputerUse) | 'ds' (demo-studio)
    payload: dict[str, Any]


@dataclass
class Plan:
    spec: dict[str, Any]
    ops: list[Op] = field(default_factory=list)
    total: float = 0.0

    @property
    def cu_ops(self) -> list[Op]:
        return [o for o in self.ops if o.target == "cu"]

    @property
    def ds_ops(self) -> list[Op]:
        return [o for o in self.ops if o.target == "ds"]


def build_plan(spec: dict[str, Any]) -> Plan:
    """Translate a demo spec into an ordered, timestamped list of Ops. Pure function."""
    screen = {**DEFAULT_SCREEN, **spec.get("screen", {})}
    sw, sh = screen["width"], screen["height"]
    plan = Plan(spec=spec)
    t = 0.0

    for i, step in enumerate(spec.get("steps", [])):
        action = step.get("action")
        if action is None:
            raise ValueError(f"step {i} missing 'action'")
        dur = float(step.get("duration", step.get("settle", 0.8)))

        # Effects (demo-studio) are scheduled at the CURRENT timeline position so they
        # land in sync with the action that follows.
        if step.get("caption"):
            cap_dur = float(step.get("caption_duration", max(dur, 1.5)))
            plan.ops.append(
                Op(t, "ds", {
                    "tool": "add_text_overlay",
                    "args": {
                        "text": step["caption"],
                        "x": int(step.get("caption_x", sw // 2)),
                        "y": int(step.get("caption_y", int(sh * 0.85))),
                        "startTime": round(t, 3),
                        "endTime": round(t + cap_dur, 3),
                    },
                })
            )
        zoom = step.get("zoom")
        if zoom:
            zx = step.get("x", sw / 2) / sw
            zy = step.get("y", sh / 2) / sh
            z_dur = float(zoom.get("duration", max(dur, 1.5)))
            plan.ops.append(
                Op(t, "ds", {
                    "tool": "add_zoom_region",
                    "args": {
                        "x": round(zx, 4),
                        "y": round(zy, 4),
                        "scale": float(zoom.get("scale", 2.0)),
                        "startTime": round(t, 3),
                        "endTime": round(t + z_dur, 3),
                        "easing": zoom.get("easing", "ease-in-out"),
                    },
                })
            )

        # Action (GALComputerUse) — 'wait' is timeline-only, no actuation.
        if action == "wait":
            pass
        elif action in ACTION_STEPS:
            plan.ops.append(Op(t, "cu", _cu_payload(action, step)))
        else:
            raise ValueError(f"step {i}: unknown action '{action}'")

        t += dur

    plan.total = round(t, 3)
    # Stable order: by time, effects (ds) before the action (cu) at the same instant.
    plan.ops.sort(key=lambda o: (o.t, 0 if o.target == "ds" else 1))
    return plan


def _cu_payload(action: str, step: dict[str, Any]) -> dict[str, Any]:
    """Build the exact GALComputerUse socket JSON for an action step."""
    if action in ("move", "click"):
        if "x" not in step or "y" not in step:
            raise ValueError(f"'{action}' requires x and y")
        p: dict[str, Any] = {"action": action, "x": float(step["x"]), "y": float(step["y"])}
        if action == "click":
            p["button"] = step.get("button", "left")
            p["click_count"] = int(step.get("click_count", 1))
        return p
    if action == "type":
        return {"action": "type", "text": str(step.get("text", ""))}
    if action == "key":
        return {"action": "key", "key": str(step.get("key", "")),
                "modifiers": list(step.get("modifiers", []))}
    if action == "scroll":
        return {"action": "scroll",
                "scroll_x": float(step.get("scroll_x", 0)),
                "scroll_y": float(step.get("scroll_y", 0)),
                "at_x": step.get("x"), "at_y": step.get("y")}
    raise ValueError(f"unactuatable action '{action}'")


# ─────────────────────────────────────────────────────────────────────────────
# Endpoint clients (I/O)
# ─────────────────────────────────────────────────────────────────────────────
class GalCuClient:
    """Talks to the GALComputerUse helper: one JSON request per connection."""

    def __init__(self, socket_path: str = DEFAULT_SOCKET):
        self.socket_path = socket_path

    def send(self, payload: dict[str, Any], timeout: float = 10.0) -> dict[str, Any]:
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as s:
            s.settimeout(timeout)
            s.connect(self.socket_path)
            s.sendall(json.dumps(payload).encode("utf-8"))
            s.shutdown(socket.SHUT_WR)
            chunks = []
            while True:
                b = s.recv(65536)
                if not b:
                    break
                chunks.append(b)
        raw = b"".join(chunks).decode("utf-8") or "{}"
        return json.loads(raw)

    def ping(self) -> dict[str, Any]:
        return self.send({"action": "ping"})


class DemoStudio:
    """Long-lived demo-studio MCP server over stdio (JSON-RPC)."""

    def __init__(self, server_cmd: list[str]):
        self.server_cmd = server_cmd
        self.proc: subprocess.Popen | None = None
        self._id = 0

    def start(self) -> None:
        self.proc = subprocess.Popen(
            self.server_cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, text=True, bufsize=1,
        )
        self._rpc("initialize", {
            "protocolVersion": "2024-11-05", "capabilities": {},
            "clientInfo": {"name": "demo-orchestrator", "version": "0.1.0"},
        })
        self._notify("notifications/initialized")

    def list_tools(self) -> list[str]:
        res = self._rpc("tools/list", {})
        return [t["name"] for t in res.get("tools", [])]

    def call(self, tool: str, args: dict[str, Any]) -> dict[str, Any]:
        return self._rpc("tools/call", {"name": tool, "arguments": args})

    def stop(self) -> None:
        if self.proc:
            try:
                self.proc.stdin.close()
                self.proc.wait(timeout=10)
            except Exception:
                self.proc.kill()

    def _send(self, msg: dict[str, Any]) -> None:
        assert self.proc and self.proc.stdin
        self.proc.stdin.write(json.dumps(msg) + "\n")
        self.proc.stdin.flush()

    def _notify(self, method: str) -> None:
        self._send({"jsonrpc": "2.0", "method": method})

    def _rpc(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        self._id += 1
        rid = self._id
        self._send({"jsonrpc": "2.0", "id": rid, "method": method, "params": params})
        assert self.proc and self.proc.stdout
        for line in self.proc.stdout:
            line = line.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                continue
            if msg.get("id") == rid:
                if "error" in msg:
                    raise RuntimeError(f"demo-studio {method} error: {msg['error']}")
                return msg.get("result", {})
        raise RuntimeError(f"demo-studio closed before replying to {method}")


# ─────────────────────────────────────────────────────────────────────────────
# Runner
# ─────────────────────────────────────────────────────────────────────────────
def run_live(spec: dict[str, Any], plan: Plan, ds_cmd: list[str], socket_path: str) -> str:
    """Execute the plan for real: record, drive, polish, export. Needs TCC + foreground."""
    if spec.get("cursor", "live") != "live":
        raise SystemExit("Only 'live' cursor mode is wired (see README); set cursor: live.")
    cu = GalCuClient(socket_path)
    ping = cu.ping()
    if ping.get("status") != "ok":
        raise SystemExit(f"GALComputerUse helper not reachable at {socket_path}: {ping}")

    ds = DemoStudio(ds_cmd)
    ds.start()
    rec = spec.get("recording", {})
    out = spec.get("output", "demo.mp4")
    ds.call("start_recording", {
        "output": out,
        "fps": rec.get("fps", 30),
        "captureAudio": rec.get("captureAudio", False),
        **({"region": rec["region"]} if rec.get("region") else {}),
    })
    start = time.monotonic()
    # Replay the timeline against the wall clock.
    for op in plan.ops:
        delay = op.t - (time.monotonic() - start)
        if delay > 0:
            time.sleep(delay)
        if op.target == "ds":
            ds.call(op.payload["tool"], op.payload["args"])
        else:
            cu.send(op.payload)
    # Hold until the modeled end, then finish.
    tail = plan.total - (time.monotonic() - start)
    if tail > 0:
        time.sleep(tail)
    ds.call("stop_recording", {})
    exp = spec.get("export", {})
    ds.call("export_video", {"output": out, **exp})
    ds.stop()
    return out


def render_dry_run(plan: Plan) -> str:
    lines = [f"# Demo plan: {plan.spec.get('name', '(unnamed)')}  ({plan.total:.1f}s, "
             f"{len(plan.cu_ops)} actions, {len(plan.ds_ops)} effects)",
             f"# cursor mode: {plan.spec.get('cursor', 'live')}  "
             f"(GALComputerUse drives + glides; demo-studio records + adds zoom/captions)"]
    for op in plan.ops:
        if op.target == "cu":
            lines.append(f"  {op.t:6.2f}s  CU  -> {json.dumps(op.payload)}")
        else:
            a = op.payload["args"]
            lines.append(f"  {op.t:6.2f}s  DS  {op.payload['tool']}({json.dumps(a)})")
    return "\n".join(lines)


def check_endpoints(ds_cmd: list[str], socket_path: str) -> int:
    ok = True
    try:
        ds = DemoStudio(ds_cmd)
        ds.start()
        tools = ds.list_tools()
        ds.stop()
        print(f"[demo-studio] OK — {len(tools)} tools: {', '.join(sorted(tools))}")
    except Exception as e:  # noqa: BLE001
        ok = False
        print(f"[demo-studio] UNREACHABLE — {e}")
    try:
        res = GalCuClient(socket_path).ping()
        status = res.get("status")
        print(f"[GALComputerUse] {'OK' if status == 'ok' else 'reachable but odd'} — {res}")
    except (FileNotFoundError, ConnectionRefusedError, socket.timeout, OSError) as e:
        # Not fatal for --check: the helper only runs in a foreground macOS session
        # with Accessibility granted; absence here is expected off-desktop.
        print(f"[GALComputerUse] not running ({type(e).__name__}: {e}) — "
              f"start it on the demo machine before a live run")
    return 0 if ok else 1


def load_spec(path: str) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def default_ds_cmd() -> list[str]:
    """Resolve the demo-studio MCP server command (env override or installed package)."""
    if os.environ.get("DEMO_STUDIO_SERVER"):
        return ["node", os.environ["DEMO_STUDIO_SERVER"]]
    return ["npx", "--yes", "@gal-run/demo-studio", "mcp"]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Orchestrate GALComputerUse + demo-studio into a demo.")
    ap.add_argument("spec", nargs="?", help="path to a demo spec JSON")
    ap.add_argument("--dry-run", action="store_true", help="print the plan; don't record or act")
    ap.add_argument("--check", action="store_true", help="probe both endpoints and exit")
    ap.add_argument("--socket", default=DEFAULT_SOCKET, help="GALComputerUse helper socket path")
    args = ap.parse_args(argv)

    ds_cmd = default_ds_cmd()
    if args.check:
        return check_endpoints(ds_cmd, args.socket)
    if not args.spec:
        ap.error("a spec path is required (unless --check)")

    spec = load_spec(args.spec)
    plan = build_plan(spec)
    if args.dry_run:
        print(render_dry_run(plan))
        return 0
    out = run_live(spec, plan, ds_cmd, args.socket)
    print(f"Exported: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
