# browser_computer manual smoke

Deterministic runtime check of gal-browser's native `browser_computer` tool (coordinate
computer-use). Drives `page.html` purely by pixel coordinates and asserts the resulting DOM
state — proving real CDP input is delivered, not just that the call returns.

Manual (needs a real Chrome/Chromium; not wired into CI):

```bash
GAL_BIN=/path/to/gal python3 smoke.py
```

Checks: left_click, double_click, type (Input.insertText), key Enter (Input.dispatchKeyEvent),
scroll (Input.dispatchMouseEvent mouseWheel). Expected: `5/5 browser_computer checks passed`.

Note: if a prior headless run was killed uncleanly, clear the stale singleton lock first:
`pkill -f chromiumoxide-runner; rm -rf "$TMPDIR/chromiumoxide-runner"`.
