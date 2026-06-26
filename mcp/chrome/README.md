# gal-chrome-mcp-oss

MCP server for GAL Chrome extension automation via Playwright. Provides tools to launch Chromium with the GAL extension loaded, interact with extension popups, navigate pages, capture screenshots, and read page text.

## Install

```bash
npm install
npm run build
```

## Tools

- `chrome_extension_launch` — Launch Chromium with the GAL Chrome extension loaded
- `chrome_extension_open_popup` — Open the extension popup page
- `chrome_extension_open_url` — Open a browser tab
- `chrome_extension_get_popup_text` — Read visible text from the extension popup
- `chrome_extension_click_popup_text` — Click visible text inside the extension popup
- `chrome_extension_get_page_text` — Read visible text from a browser page
- `chrome_extension_screenshot` — Capture the popup or active page as a PNG screenshot
- `chrome_extension_state` — Return current extension id and tracked page URLs
- `chrome_extension_highlight_tab` — Add an automation overlay (border + label) to the active tab
- `chrome_extension_clear_highlight` — Remove the automation overlay from the active tab
- `chrome_extension_close` — Close the browser context and release the session

### Browser-use build-out tools

These drive the extension's `chrome.*` background APIs (with Playwright
fallbacks where noted), plus two tools that delegate to the companion
browser-use Python service (`mcp/gal-browser-use-service`, default
`http://127.0.0.1:8123`, overridable via `GAL_BROWSER_USE_SERVICE_URL`).

- `chrome_extension_tabGroups_create` — Create a tab group from tab IDs
- `chrome_extension_tabGroups_list` — List tab groups in the current window
- `chrome_extension_tabs_query` — Query tabs matching criteria
- `chrome_extension_tabs_create` — Create a new tab (Playwright fallback)
- `chrome_extension_tabs_remove` — Close one or more tabs by ID
- `chrome_extension_bookmarks_search` — Search bookmarks by query
- `chrome_extension_history_search` — Search browser history by text
- `chrome_extension_windows_create` — Create a new browser window (Playwright fallback)
- `chrome_extension_agent_run` — Run a browser-use agent task via the Python service
- `chrome_extension_enhanced_parse` — Get enhanced DOM + AX tree via the Python service

## Security

This server drives a real browser on behalf of a caller, so navigation
targets are partly attacker-influenced. To reduce server-side request
forgery (SSRF) and credential exfiltration risk:

- **Scheme allow-list.** `chrome_extension_open_url` and the `start_url`
  path of `chrome_extension_launch` only open `http`/`https` URLs.
  `file:`, `chrome:`, `chrome-extension:`, `data:`, and every other
  scheme are rejected.
- **Private/loopback hosts are blocked by default.** Targets that are —
  or resolve to — loopback (`127.0.0.0/8`, `::1`, `localhost`,
  `*.localhost`), RFC1918 (`10/8`, `172.16/12`, `192.168/16`),
  carrier-grade NAT (`100.64/10`), link-local (`169.254.0.0/16` incl. the
  cloud-metadata IP `169.254.169.254`, and `fe80::/10`), unique-local
  (`fc00::/7`, covering `fd00::/8`), or the unspecified address
  (`0.0.0.0`, `::`) are refused. Override only with
  `allow_private_hosts: true` (or `GAL_CHROME_MCP_ALLOW_PRIVATE_HOSTS=1`).
- **IPv6-embedded-IPv4 decoding.** Literal hosts that hide an internal
  IPv4 inside an IPv6 address — IPv4-mapped (`::ffff:127.0.0.1`, and the
  hex-compressed `::ffff:7f00:1` the URL parser normalizes it to),
  IPv4-compatible (`::127.0.0.1` → `::7f00:1`), and NAT64
  (`64:ff9b::a.b.c.d`) — are decoded and the embedded IPv4 is run through
  the IPv4 range checks. A form recognised as embedded-IPv4 but not
  confidently decodable is **blocked by default**.
- **DNS resolution check.** Before navigating, the hostname is resolved
  (`dns.lookup`, all records) and **every** resolved address is
  range-checked. A public-looking name that resolves to an internal
  address — including resolve-time DNS rebinding — is rejected, as is a
  name that fails to resolve (fail-closed).
- **Redirect-hop network guard.** `page.goto` follows `30x` redirects, so
  a public URL could redirect to an internal host (e.g. a 302 to
  `http://169.254.169.254/`). Simply aborting private hosts inside a
  `context.route` handler does **not** stop this: when a request is
  continued, Chromium follows the redirect **natively** and the redirected
  request never re-enters the interceptor. So instead of continuing the
  request, the guard walks the redirect chain itself — fetching one hop at
  a time with `route.fetch({ maxRedirects: 0 })`, reading the `Location`
  header, and re-running the **full** scheme + range + resolve-and-pin check
  on every hop **before** issuing the next fetch. Any private/loopback/link-
  local hop is aborted at the network layer before the internal service is
  contacted, and redirects are never auto-followed (no native-redirect
  escape).
- **DNS-rebinding pin (TOCTOU).** Validating a hostname and then handing the
  same hostname to `route.fetch` is racy: `route.fetch` performs its **own**
  independent connect-time DNS resolution, so an attacker with a low-TTL
  record can answer the validation lookup with a public IP and the connect
  lookup with a private one (e.g. `169.254.169.254`). The guard closes this
  by resolving each hop **once**, rejecting the hop if **any** answer is
  private/loopback/link-local or it does not resolve, and then — for `http` —
  issuing `route.fetch` against the resolved **literal IP** (the first public
  answer, so dual-stack/round-robin public hosts still work) while preserving
  the original `Host` header. The request actually issued therefore targets the
  exact address that was validated; there is no separate connect-time
  resolution left to rebind. Because a mixed public+private answer is rejected
  outright, a rebinding-shaped multi-record reply cannot smuggle a private IP
  past the pin.
  The guard **fails closed** — it enforces by default, is only relaxed when a
  call explicitly sets `allow_private_hosts`, and aborts on any parse,
  resolution, or fetch error.
- **Session cookie scoping.** When you inject a `gal_session` token you must
  also supply `start_url`, and `cookie_domain` must equal the `start_url`
  host. The cookie is then set **host-only**, scoped to that exact origin —
  never as a context-level `domain` cookie. This rejects bare TLDs,
  leading-dot wildcards (`.com`), and **public suffixes** (`co.uk`,
  `com.au`) as scopes, so the credential can never be broadcast across an
  entire registry or to unrelated subdomains.

**What is NOT blocked / residual risk.** This is a browser-automation
tool, so the allow-listed `http`/`https` space still includes the entire
public internet: a caller that supplies a malicious **public** URL can
still cause the browser to fetch it. The redirect-hop guard validates and
follows redirects itself and IP-pins `http` hops (so 3xx-to-internal and
`http` DNS rebinding are blocked), but it is not a hermetic sandbox:

- **`https` hops are not socket-IP-pinned.** Rewriting an `https` URL to a
  literal IP would break TLS SNI / certificate verification, so for `https`
  the validated **hostname** is kept and `route.fetch` resolves it again at
  connect time. This path is still hardened by the resolve-once
  single-record / no-private / no-ambiguous check, and by the browser's own
  TLS verification (a rebound internal IP cannot present a valid certificate
  for the public name), but a custom IP-pinning resolver (e.g. via CDP)
  would be strictly stronger. `http` hops — including the cloud-metadata
  endpoint, which is `http` — **are** pinned.
- Subresources loaded by an allowed public page are resolve-and-pinned at
  request time but are not redirect-walked the way the top-level navigation
  is.
- `allow_private_hosts: true` / `GAL_CHROME_MCP_ALLOW_PRIVATE_HOSTS=1`
  disables the private-host checks entirely; only enable it when you
  control the target.

Only expose this server to trusted callers, keep `allow_private_hosts`
off unless you control the target, and run it in a network-segmented
environment when automating against untrusted input.

## License

Apache License 2.0 — see [LICENSE](./LICENSE).
