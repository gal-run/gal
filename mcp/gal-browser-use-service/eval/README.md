# M4a eval fixtures

`m4a_web_tasks.json` is a **template** — replace `example-public-fact` with your real,
**login-free, public** task(s). Each task:

| field | meaning |
|---|---|
| `name` | short id for the result row |
| `task` | natural-language goal handed to the browser-use agent |
| `start_url` | code-controlled entry URL (SSRF-guarded — public hosts only) |
| `success_substring` | a **stable** string that must appear in the agent's final result for the run to count as a success (checked code-side by `runner.py`) |

Pick a page whose `success_substring` is stable (won't change between runs) so success is
unambiguous. Keep it public — the service's SSRF guard rejects private/loopback targets.

Run (slice 1, Gemini-only, after starting the service on :8123):

```bash
SERVICE_AUTH_TOKEN=<token> python runner.py --profile gemini --repeat 3
```

Confirm the per-1M price rates in `runner.py` (`DEFAULT_RATES`) against current Gemini
pricing, or pass `--in-rate/--out-rate`, before trusting the `$` column.
