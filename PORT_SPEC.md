# LarpCode (macOS) — Port Specification (v1)

This document is the single source of truth for the macOS edition being built in
this repository. Every contributor/subagent must obey it.

## Identity

| Item | Value |
| --- | --- |
| Upstream | https://github.com/Tazmyan/LarpCode (Windows-only fork of OpenCode) |
| This repo | https://github.com/Aero-Apex/LarpCode-MacOS |
| Repository title | LarpCode (macOS) |
| App / product display name | LarpCode macOS |
| CLI command | `larpcode` |
| Bundle identifier (prod) | `ai.larpcode.desktop.macos` |
| URL scheme | `opencode` (kept for session compatibility) |
| Version file | `VERSION` = `1.0.0` |
| Release tag | `v1` (explicitly accepted as an alias of `v1.0.0`) |
| Minimum macOS | macOS 13 (Ventura) on Apple Silicon or Intel |
| Architectures | `arm64` (primary), `x64` (Intel), optional universal DMG |

## Scope

The upstream codebase is a large TypeScript/Bun monorepo with an Electron
desktop app, a standalone CLI, and a Windows Inno Setup installer. This port
keeps the application source intact and replaces the Windows-only delivery
layer with a macOS one:

* Windows Inno Setup installer → macOS DMG/ZIP built by `electron-builder`.
* `.exe` CLI + PowerShell installer → standalone `larpcode` binary + `install-cli.sh`.
* `.bat`/`.vbs`/`.cmd` launchers → `.command` app launcher + POSIX CLI shim.
* Windows release workflow → macOS GitHub Actions workflow.
* Windows-only user docs → macOS install/update/permission docs.
* All in-app and in-repo release URLs → this repository's release feed.

We do **not** fork or rewrite the AI/TUI/UI engine. Upstream references that are
generic (e.g. `opencode.ai` provider docs, upstream MIT license, i18n files) stay
untouched unless they are part of the macOS delivery layer.

## Release feed and asset names

Base: `https://github.com/Aero-Apex/LarpCode-MacOS/releases/latest/download/`

| Asset | Purpose |
| --- | --- |
| `LarpCode-macOS-universal.dmg` | Primary desktop install (drag to Applications) |
| `LarpCode-macOS-arm64.dmg`, `LarpCode-macOS-x64.dmg` | Per-arch installs |
| `LarpCode-macOS-universal.zip` | ZIP alternative |
| `larpcode` | Standalone CLI binary (arch-specific, published in arch subfolders or suffixed names) |
| `install-cli.sh` | CLI installer |
| `cli.json` | CLI version/checksum manifest |
| `update.json` | In-app update feed |
| `SHA256SUMS` | Checksums for all binary assets |
| `LarpCode-macOS-1.0.0-source.zip`, `.tar.gz` | Source archives |

The in-app updater reads `update.json` and must never be pointed at the Windows
`LarpCode-Setup.exe` asset.

## Data locations on macOS

The CLI/upstream code already honours XDG variables. The macOS launchers set:

```
XDG_DATA_HOME="$HOME/Library/Application Support/LarpCode macOS/xdg/data"
XDG_CONFIG_HOME="$HOME/Library/Application Support/LarpCode macOS/xdg/config"
XDG_CACHE_HOME="$HOME/Library/Caches/LarpCode macOS/xdg/cache"
XDG_STATE_HOME="$HOME/Library/Application Support/LarpCode macOS/xdg/state"
```

`~/Library/Application Support/...` paths **must be quoted** everywhere because
the app name contains a space.

## Security / signing

* v1 binaries are unsigned and not notarized. Docs must tell users how to open
  them via right-click → Open and how to remove quarantine with
  `xattr -dr com.apple.quarantine`.
* Workflow contains env-gated `MACOS_SIGN_IDENTITY`, `MACOS_NOTARIZE_*`
  hooks; absence of secrets must not fail the build.
* Hardened runtime entitlements are provided for future signing.

## Rules for implementation agents

1. Only edit the exact files assigned to you. Never edit another agent's files.
2. Read `PORT_SPEC.md` first. Preserve existing code style (no semicolons in
   TypeScript, 120-column width, double quotes).
3. Do not add marketing fluff or invented features. Document only behaviour
   that exists or is explicitly specified here.
4. Do not run `bun install`, builds, or destructive git commands.
5. Report a short summary of what you changed and any risks.
