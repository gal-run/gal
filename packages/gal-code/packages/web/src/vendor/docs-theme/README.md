# Vendored: toolbeam-docs-theme

Vendored from `toolbeam-docs-theme@0.4.8` (npm) — MIT, see [`LICENSE`](./LICENSE).

The upstream package is unmaintained (pinned to `@astrojs/starlight ^0.34.3`),
which blocked every Starlight/astro upgrade. Only the files this site actually
uses are vendored: the 4 style sheets, the `Header` + `PageTitle` overrides, and
the `HeaderLinks` component.

The theme's plugin behavior (font + CSS `customCss` injection, the `PageTitle`
component override, `pagination: false`) is now expressed directly in
`packages/web/astro.config.mjs`. `components/HeaderLinks.astro` was adjusted to
read `config.headerLinks` from `packages/web/config.mjs` instead of the plugin's
`globalThis.toolbeamDocsThemeConfig`.
