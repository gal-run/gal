<p align="center">
  <a href="https://gal.run">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="GAL Code logo">
    </picture>
  </a>
</p>
<p align="center">The open source AI coding agent.</p>
<p align="center">
  <a href="https://gal.run/discord"><img alt="Discord" src="https://img.shields.io/discord/1391832426048651334?style=flat-square&label=discord" /></a>
  <a href="https://www.npmjs.com/package/@gal-run/code"><img alt="npm" src="https://img.shields.io/npm/v/@gal-run/code?style=flat-square" /></a>
  <a href="https://github.com/gal-run/gal-code/actions/workflows/publish.yml"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/gal-run/gal-code/publish.yml?style=flat-square&branch=main" /></a>
</p>

[![GAL Code Terminal UI](packages/web/src/assets/lander/screenshot.png)](https://gal.run)

---

### Installation

```bash
# YOLO
git clone https://github.com/gal-run/gal-code && cd gal-code && bun install && bun run build

> Note: build-from-source for now — prebuilt release binaries land with the first GitHub release.

# Package managers
npm i -g @gal-run/code@latest      # or bun/pnpm/yarn
scoop install gal-code             # Windows
choco install gal-code             # Windows
brew install scheduler-systems/tap/gal-code # macOS and Linux (recommended, always up to date)
brew install gal-code              # macOS and Linux (official brew formula, updated less)
sudo pacman -S gal-code            # Arch Linux (Stable)
paru -S gal-code-bin               # Arch Linux (Latest from AUR)
mise use -g gal-code               # Any OS
nix run nixpkgs#gal-code           # or github:gal-run/gal-code for latest source
```

> [!TIP]
> Remove versions older than 0.1.x before installing.

### Desktop App (BETA)

GAL Code is also available as a desktop application. Download directly from the [releases page](https://github.com/gal-run/gal-code/releases) or [gal.run/download](https://gal.run/download).

| Platform              | Download                              |
| --------------------- | ------------------------------------- |
| macOS (Apple Silicon) | `gal-code-desktop-darwin-aarch64.dmg` |
| macOS (Intel)         | `gal-code-desktop-darwin-x64.dmg`     |
| Windows               | `gal-code-desktop-windows-x64.exe`    |
| Linux                 | `.deb`, `.rpm`, or AppImage           |

```bash
# macOS (Homebrew)
brew install --cask gal-code-desktop
# Windows (Scoop)
scoop bucket add extras; scoop install extras/gal-code-desktop
```

#### Installation Directory

The install script respects the following priority order for the installation path:

1. `$GAL_CODE_INSTALL_DIR` - Custom installation directory
2. `$XDG_BIN_DIR` - XDG Base Directory Specification compliant path
3. `$HOME/bin` - Standard user binary directory (if it exists or can be created)
4. `$HOME/.gal-code/bin` - Default fallback

```bash
# Examples
GAL_CODE_INSTALL_DIR=/usr/local/bin git clone https://github.com/gal-run/gal-code && cd gal-code && bun install && bun run build
XDG_BIN_DIR=$HOME/.local/bin git clone https://github.com/gal-run/gal-code && cd gal-code && bun install && bun run build
```

### Agents

GAL Code includes two built-in agents you can switch between with the `Tab` key.

- **build** - Default, full-access agent for development work
- **plan** - Read-only agent for analysis and code exploration
  - Denies file edits by default
  - Asks permission before running bash commands
  - Ideal for exploring unfamiliar codebases or planning changes

Also included is a **general** subagent for complex searches and multistep tasks.
This is used internally and can be invoked using `@general` in messages.

Learn more about [agents](https://gal.run/docs/agents).

### Documentation

For more info on how to configure GAL Code, [**head over to our docs**](https://gal.run/docs).

### Contributing

If you're interested in contributing to GAL Code, please read our [contributing docs](./CONTRIBUTING.md) before submitting a pull request.

### Building on GAL Code

If you are working on a project that's related to GAL Code and is using "gal-code" as part of its name, for example "gal-code-dashboard" or "gal-code-mobile", please add a note to your README to clarify that it is not built by the GAL Code team and is not affiliated with us in any way.

### FAQ

#### How is this different from Claude Code?

It's very similar to Claude Code in terms of capability. Here are the key differences:

- 100% open source
- Not coupled to any provider. Although we recommend the models we provide through [GAL Code Zen](https://gal.run/zen), GAL Code can be used with Claude, OpenAI, Google, or even local models. As models evolve, the gaps between them will close and pricing will drop, so being provider-agnostic is important.
- Out-of-the-box LSP support
- A focus on TUI. GAL Code is based on [opencode](https://github.com/sst/opencode) (MIT), originally created by SST Inc. (the creators of [terminal.shop](https://terminal.shop)); we are going to push the limits of what's possible in the terminal.
- A client/server architecture. This, for example, can allow GAL Code to run on your computer while you drive it remotely from a mobile app, meaning that the TUI frontend is just one of the possible clients.

---

**Join our community** [Discord](https://discord.gg/gal-code) | [X.com](https://x.com/gal-code)

### Operations

- [Governance](docs/governance.md)
- [Actions policy](docs/actions-policy.md)
- [Release runbook](docs/release-runbook.md)
- [Migration inventory](docs/migration-inventory.md)
- [Status-aware upstream errors](docs/status-upstream-errors.md)
