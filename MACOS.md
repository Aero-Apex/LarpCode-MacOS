# LarpCode (macOS) — technical porting notes

This document records exactly how `Aero-Apex/LarpCode-MacOS` differs from upstream
`Tazmyan/LarpCode` (a Windows-only fork of OpenCode). [`PORT_SPEC.md`](PORT_SPEC.md) is the
normative source for names and versions; this document describes the concrete delivery-layer
substitutions, the release-asset contract, and the code that is deliberately left alone. The
AI/TUI/UI engine is not forked or rewritten.

## Identity and targets

| Item | Upstream | macOS edition |
| --- | --- | --- |
| Repository | `Tazmyan/LarpCode` | `Aero-Apex/LarpCode-MacOS` |
| Display name | `LarpCode` | `LarpCode macOS` |
| CLI command | `larpcode` | `larpcode` (unchanged) |
| Prod bundle id | `ai.larpcode.desktop` | `ai.larpcode.desktop.macos` |
| URL scheme | `opencode` | `opencode` (kept for session compatibility) |
| OS | Windows 10/11 x64 | macOS 13 (Ventura)+, Apple Silicon (`arm64`) or Intel (`x64`) |
| Version | `VERSION`-driven | `VERSION` = `1.0.0`; tag `v1` explicitly accepted as an alias of `v1.0.0` |

## Windows artifact → macOS artifact

| Windows artifact (upstream) | macOS artifact (this repo) | Notes |
| --- | --- | --- |
| `installer/LarpCode-Setup.iss` compiled by `ISCC.exe` (Inno Setup 6, installed via `choco install innosetup`) → `LarpCode-Setup.exe` | `electron-builder` config in `packages/desktop/electron-builder.config.ts` → `dist/LarpCode-macOS-universal.dmg`, `LarpCode-macOS-arm64.dmg`, `LarpCode-macOS-x64.dmg`, `LarpCode-macOS-universal.zip` | DMG is the install medium; there is no executable installer, no UAC/elevation, and no per-user PATH rewriting at install time. Artifact template is `LarpCode-macOS-${os}-${arch}.${ext}`; `script/stage-macos.ts` normalizes outputs into `dist/release/`. |
| Inno `[Icons]` Start Menu / desktop shortcuts pointing at `LarpCode.vbs` | `LarpCode macOS.app` dragged to `/Applications`; `shortcuts/LarpCode.command` for direct launch | The `.command` file is a `#!/bin/bash` launcher that resolves its own directory, exports the XDG roots, and `exec`s the app binary (path overridable with `LARPCODE_APP_PATH`). |
| `shortcuts/LarpCode.bat` (starts `electron.exe <desktop-pkg>`) | `shortcuts/LarpCode.command` | Same role, POSIX shell instead of batch. |
| `shortcuts/LarpCode.vbs` (Start Menu / desktop `cscript` shim) | `shortcuts/LarpCode.command` | No VBScript/`wscript` equivalent on macOS. |
| `shortcuts/larpcode.cmd` (sets XDG roots, runs bundled `opencode-cli.exe`) | `shortcuts/larpcode` (POSIX `#!/bin/sh` shim) | Sets the same XDG roots, then `exec`s `desktop-pkg/resources/opencode-cli`, falling back to a standalone `larpcode` beside the shim. |
| Standalone `opencode.exe` published as `larpcode.exe` | Standalone Mach-O `larpcode` (arch-specific: `arm64` / `x64`) | Built with the same `packages/cli/script/build.ts --single --baseline --skip-install --outdir=dist-cli` step; renamed/published as `larpcode`, not `larpcode.exe`. |
| `script/install-cli.ps1` (`irm … | iex`, installs to `%LOCALAPPDATA%\Programs\LarpCode CLI\bin`, edits user `PATH`) | `install-cli.sh` (`curl -fsSL … | bash`, installs to `~/.larpcode/bin`, prints `PATH` instructions) | Both verify the download's SHA-256 against `cli.json` before installing. |
| Windows XDG roots under `%APPDATA%\ai.larpcode.desktop\xdg\{data,config,cache,state}` | XDG roots under `~/Library/Application Support/LarpCode macOS/xdg/...` and `~/Library/Caches/LarpCode macOS/xdg/cache` | See [XDG data roots](#xdg-data-roots). |
| `LARPCODE_UPDATE_URL=…/LarpCode-Setup.exe`; `update.json` `{ version, url: Setup.exe, sha256 }` | `LARPCODE_UPDATE_URL=…/update.json`; feed points at `LarpCode-macOS-universal.dmg` / `.zip` | The updater must never be pointed at `LarpCode-Setup.exe`. `cli.json` is the CLI version/checksum manifest. |
| `sha256sum -c SHA256SUMS` | `shasum -a 256 -c SHA256SUMS` | Same file name and format; only the verification command changes. |
| `LarpCode-<version>-source.zip` | `LarpCode-macOS-<version>-source.zip` and `.tar.gz` | Published as release assets. |
| `runs-on: windows-latest` build job | `runs-on: macos-14` (Apple Silicon macOS runner, the `macos-latest` class) in the `build` job | The `publish` job stays on `ubuntu-latest`; only the build job moves to macOS. |
| Fetch step `script/fetch-installer-deps.ts` bundling `tor.exe` + `curl-impersonate.exe` | Not run in the macOS release workflow | See [Known limitations](#known-limitations). |

## Desktop packaging: Inno Setup → electron-builder DMG/ZIP

Upstream produces one self-contained `LarpCode-Setup.exe` from a 330-line Inno script: staged
Electron + `desktop-pkg`, an `.ico`, Start Menu/desktop icons, a `[Code]` section that rewrites
`HKCU\Environment\Path`, pre-install `taskkill` of processes holding file locks, and silent-update
entries (`/SILENT`). The macOS edition drops that layer entirely:

* `packages/desktop/electron-builder.config.ts` declares `mac.target: ["dmg", "zip"]`, the prod
  `appId` `ai.larpcode.desktop.macos`, `productName` `LarpCode macOS`, the `opencode` protocol,
  macOS usage-description strings for protected folders/microphone, and a generic publish feed at
  this repository's `releases/latest/download/` base.
* `script/stage-macos.ts` resolves the built DMG/ZIP and standalone CLI, copies them into
  `dist/release/`, writes `cli.json`, `update.json` and `SHA256SUMS`, and reads the manifests back
  to reject a broken feed before anything is published.
* Installation is Finder-based: mount the DMG, drag `LarpCode macOS.app` to Applications, eject.
  No installer process, no privilege escalation, no Start Menu, and no installer-driven `PATH`
  mutation; the CLI command is installed separately by `install-cli.sh`.

A `.command` file is used instead of `.vbs`/`.bat` because macOS launch services execute
`.command` scripts in Terminal; the shim uses `pwd -P` so symlinked install paths still resolve to
the real app bundle.

## CLI: `.exe` → standalone `larpcode`

Both editions build the same single-file baseline CLI with
`bun run packages/cli/script/build.ts --single --baseline --skip-install`. Upstream publishes the
binary as `larpcode.exe` and `install-cli.ps1` places it in `%LOCALAPPDATA%\Programs\LarpCode
CLI\bin`, adding that folder to the per-user `PATH`. On macOS the binary is a native `larpcode`
Mach-O, published per architecture and installed by `install-cli.sh` into `~/.larpcode/bin`.
The installer aborts on a checksum mismatch against `cli.json`. The desktop app carries a second
copy as `Contents/Resources/opencode-cli`; `shortcuts/larpcode` prefers that copy and falls back
to the standalone binary, so same-session behaviour is shared between installs. `larpcode upgrade`
uses the same feed as the in-app updater.

## Release workflow and asset names

`.github/workflows/release.yml` replaces `windows-latest` with a macOS runner, drops the Inno Setup
and Tor/curl-impersonate fetch steps, and adds `bun run script/stage-macos.ts`. It validates
`VERSION` against the tag (accepting `v1` as `1.0.0`), builds the bundled CLI, standalone CLI and
desktop app, stages assets, verifies `SHA256SUMS` with `shasum`, and publishes a draft release to
this repository. `workflow_dispatch` builds without publishing.

Release base: `https://github.com/Aero-Apex/LarpCode-MacOS/releases/latest/download/`

| Asset | Purpose |
| --- | --- |
| `LarpCode-macOS-universal.dmg` | Primary desktop install (drag to Applications) |
| `LarpCode-macOS-arm64.dmg`, `LarpCode-macOS-x64.dmg` | Per-architecture installs |
| `LarpCode-macOS-universal.zip` | ZIP alternative |
| `larpcode` | Standalone CLI binary, arch-specific (published in arch subfolders or with suffixed names) |
| `install-cli.sh` | CLI installer |
| `cli.json` | CLI version/checksum manifest |
| `update.json` | In-app update feed |
| `SHA256SUMS` | Checksums for all binary assets |
| `LarpCode-macOS-<version>-source.zip`, `.tar.gz` | Source archives |

`update.json` advertises the DMG (and ZIP alternative) from this feed. Any asset reference to
`LarpCode-Setup.exe` is a porting bug; the CI workflow explicitly greps tracked files for that
Windows asset URL.

## XDG data roots

The upstream CLI already honours XDG variables; the port only changes their values in the two
launchers. Both `shortcuts/LarpCode.command` and `shortcuts/larpcode` export:

```sh
XDG_DATA_HOME="$HOME/Library/Application Support/LarpCode macOS/xdg/data"
XDG_CONFIG_HOME="$HOME/Library/Application Support/LarpCode macOS/xdg/config"
XDG_CACHE_HOME="$HOME/Library/Caches/LarpCode macOS/xdg/cache"
XDG_STATE_HOME="$HOME/Library/Application Support/LarpCode macOS/xdg/state"
```

`~/Library/Application Support/...` **must be quoted everywhere** because the app name contains a
space; this applies to launchers, docs and uninstall instructions. Cache goes under
`~/Library/Caches`, not Application Support. The launchers create the four directories before
`exec`ing the app/CLI, keeping LarpCode state separate from any OpenCode installation.

## Signing and notarization

v1 binaries are **unsigned and unnotarized**. Signing is deferred to an env-gated post-build step
so secretless CI never fails:

* `MACOS_SIGN_IDENTITY`, `MACOS_NOTARIZE_APPLE_ID`, `MACOS_NOTARIZE_TEAM_ID` and
  `MACOS_NOTARIZE_PASSWORD` are read from repository secrets. If any is absent, the workflow emits
  a notice and skips codesign/notarize; the build still succeeds.
* When all four are present, `script/macos/notarize.ts` signs the `.app` with
  `codesign --deep --force --options runtime --entitlements`, submits the DMG with
  `xcrun notarytool submit --wait`, and staples it with `xcrun stapler staple`.
* Hardened-runtime entitlements for future signing live in `script/macos/entitlements.plist`:
  JIT, unsigned executable memory, library validation disabled, audio input, user-selected file
  read/write, and network client/server. `mac.sign`/`mac.notarize` are intentionally left unset in
  the electron-builder config so packaging works without secrets.
* Until signing ships, docs instruct users to open via right-click → **Open** or to clear
  quarantine with `xattr -dr com.apple.quarantine "/Applications/LarpCode macOS.app"`.

Helper scripts exposed in `package.json`: `stage:macos`, `verify:bundle`, `notarize`,
`check:macos` (shell syntax + packaging tests).

## Architecture strategy

* `arm64` is primary: the `macos-14` runner is Apple Silicon and native arm64 is the reference
  build.
* `x64` (Intel) is produced by cross-building from the macOS host with electron-builder's x64
  target; the `afterPack` hook verifies that the bundled `opencode-cli` matches a thin build's CPU
  (`arm64` or `x64`) and rejects unsupported architectures.
* The universal DMG combines both slices and is the default published installer. Because it has no
  single native slice, `afterPack` skips the strict per-arch CLI check for `universal` while still
  requiring a usable bundled CLI.
* Per-arch DMGs are published as smaller alternatives; the standalone `larpcode` is always
  architecture-specific, and `install-cli.sh` selects `arm64` or `x64` from the host.
* The app's minimum OS is macOS 13 on either architecture; no Rosetta-dependent build is shipped.

## Intentionally unchanged from upstream

* The AI/TUI/UI engine: `packages/core`, `packages/app`, `packages/tui`, `packages/ui`, provider and
  model handling, tools, plugins, session/SQLite storage, and CLI runtime behaviour (including the
  XDG-honouring config code — only the launcher-supplied values change).
* The `larpcode` command name, the `opencode` URL scheme, and the internal `opencode-cli` sidecar
  name inside the app bundle.
* Generic upstream references: `opencode.ai` provider docs, the upstream MIT `LICENSE`, i18n/locale
  files, and channel identities other than prod (`ai.larpcode.desktop.dev` / `.beta`).
* Dependency patches in `patches/` and the pinned dependency lockfile; the Electron version stays
  pinned in `packages/desktop/package.json` and verified from the official `SHASUMS256.txt`.
* Windows source files remain in tree as upstream reference (`installer/LarpCode-Setup.iss`,
  `shortcuts/*.bat/.vbs/.cmd`, `script/install-cli.ps1`); they are not part of the macOS release
  path.

## Known limitations

* **Unsigned build / Gatekeeper:** v1 has no Developer ID signature or notarization. macOS may
  report an "unidentified developer"; users must right-click → Open or clear quarantine with
  `xattr -dr com.apple.quarantine`, and repeat after each replacement of the `.app`.
* **No bundled Tor/curl-impersonate by default:** the Windows installer bundles `tor.exe` and
  `curl-impersonate.exe`; the macOS release workflow has no fetch step for them and ships no
  native equivalents. Tor-based egress rotation and impersonation-dependent behaviour are
  unavailable out of the box; `larpcode doctor`/`settings` report these helpers as missing
  (warnings, not fatal errors). A future native build can be dropped into `deps/tor/` where
  `torBinaryPath()` already looks for it.
* **Arch-specific CLI / larger universal DMG:** the standalone `larpcode` must match the host
  architecture, and the universal DMG contains both slices, so it is larger than a per-arch DMG.
