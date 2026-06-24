# ADR 0001: gal-browser stays a CDP harness (its own browser); the "real Chrome" route is a separate future gal-chrome, not a rename

- **Status:** Accepted
- **Date:** 2026-06-24
- **Decider:** Shay (founder) + harness-parity work
- **Technical Story:** While bringing GAL's harnesses to parity with the reference
  `computer-use` and `claude-in-chrome` MCPs, the question arose: since gal-browser drives
  its own headless Chromium rather than the user's real Chrome, should we switch to the
  Chrome-extension route (like `claude-in-chrome`) and **rename gal-browser → gal-chrome**?

## Context

`gal-browser` (`cli/src/mcp/browser.rs`, chromiumoxide) drives **its own headless Chromium**
over the Chrome DevTools Protocol — architecturally like Playwright/Puppeteer. It spawns a
throwaway instance with its own profile; it does **not** touch the user's real browser or any
extension. This is observable: the spawned process is
`Google Chrome --headless --user-data-dir=<tmp>/chromiumoxide-runner --remote-debugging-port=0`,
and its "tabs" are real CDP targets inside that instance (verified e2e: tab create/list/
select/close, coordinate ops follow the active tab, isolation, per-tab console capture).

The reference `claude-in-chrome` is a **different architecture**: a Chrome **extension** that
drives the user's **real, logged-in Chrome** (real profile, cookies, sessions; visible
window). It needs the extension connected; gal-browser never does.

So gal-browser and a hypothetical extension are **two tools for two jobs**, not one tool
renamed. We surveyed how the two leading vendors structure this — both run **both** scenarios:

| | Sandbox / own browser (automation, agents) | The user's real browser (consumer) | Bring-your-own harness |
|---|---|---|---|
| **Anthropic** | computer-use sandbox: Docker + Xvfb + Firefox + VNC | **Claude for Chrome** = a Chrome **extension** on the real profile | computer-use API tool |
| **OpenAI** | **Operator** = a real browser hosted in OpenAI's **cloud** | **ChatGPT Atlas** = OpenAI's **own Chromium browser** (not an extension) | **CUA API**: explicitly *"keep your existing Playwright/Selenium/CDP/MCP harness"* |

Two patterns hold across both vendors:
1. The **CDP / Playwright / sandbox harness is universally kept** for automation + agents.
   OpenAI's CUA docs explicitly tell developers **not to rebuild** an existing Playwright/CDP
   harness. **That path is exactly what gal-browser is.**
2. The **real-browser path is always a separate product**, delivered via an **extension**
   (Anthropic) **or an own-browser** (OpenAI Atlas) — and is **never a rename** of the
   sandbox/CDP tool.

GAL's North Star is agents that **QA the platform and produce demos**, plus **autonomous
background CU agents**. That work wants an **isolated, reproducible** browser — you do not
want automated QA/demo/agent runs happening inside a human's real logged-in Chrome session.

## Decision

1. **Keep `gal-browser` (CDP). Do not rename it.** It is the developer/agent/QA/demo harness
   that both vendors keep; the name is correct (browser-agnostic — any Chromium) and validated.
2. **A "drive the user's real Chrome" capability, if pursued, is a SEPARATE, additive
   component** — a Chrome extension named **`gal-chrome`** — kept **alongside** gal-browser,
   not replacing it. The names then correctly encode the two architectures
   (`gal-browser` = CDP/any-Chromium; `gal-chrome` = extension/real-Chrome).
3. **Do not build `gal-chrome` now.** GAL's current goals (QA, demos, background agents) are
   fully served by gal-browser. Build `gal-chrome` only if/when a consumer "operate my real
   browser" product becomes a goal.

## Alternatives considered

- **Rename gal-browser → gal-chrome (extension-only).** Rejected: conflates two distinct
  tools and loses the isolated, reproducible automation browser that QA/demos/agents need —
  a capability neither vendor gives up.
- **CDP-attach to a real Chrome** (launch Chrome with `--remote-debugging-port` and connect
  gal-browser to it). A viable **middle path** that reuses gal-browser's existing CDP code to
  drive a real, visible Chrome — but it is *not* the user's already-open normal session, and
  isn't needed for current goals. Kept as a future option, no rename implied.
- **Build a GAL browser (Atlas-style own Chromium).** A much larger bet; only if
  browser-as-a-product becomes a goal.

## Consequences

- The name **`gal-browser` stays**; **`gal-chrome`** is reserved for a future extension.
- In `docs/harness-parity.md`, the `gal-browser` ⟷ `claude-in-chrome` mapping means
  "functional analog **in GAL's own browser**," not "drives the user's real Chrome." The tab
  tools manage tabs in gal-browser's instance, by design.
- No code change: gal-browser remains CDP (24/24 tools runtime-verified against its own
  headless Chrome).

## References

- Claude for Chrome (extension, real browser): https://support.claude.com/en/articles/12012173-get-started-with-claude-in-chrome
- Anthropic computer-use reference (Docker + Xvfb sandbox): https://github.com/anthropics/anthropic-quickstarts/blob/main/computer-use-demo/README.md
- OpenAI Operator / Computer-Using Agent (cloud browser): https://openai.com/index/introducing-operator/ , https://openai.com/index/computer-using-agent/
- OpenAI CUA API — keep your Playwright/CDP harness: https://developers.openai.com/api/docs/guides/tools-computer-use
- ChatGPT Atlas (OpenAI's own browser): https://openai.com/index/introducing-chatgpt-atlas/
