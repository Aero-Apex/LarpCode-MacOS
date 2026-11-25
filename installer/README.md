# Packaging layout (macOS)

`PORT_SPEC.md` is the source of truth: this repository replaces the upstream
Windows delivery layer (Inno Setup `.exe` installer + PowerShell CLI installer)
with a macOS one. Desktop installs are DMG/ZIP bundles built by
`electron-builder`; the standalone `larpcode` binary is published on its own.
This directory still contains the Windows staging tree, which is **legacy** for
this port (see [Why the Inno Setup script is legacy](#why-the-inno-setup-script-is-legacy)).

## The `.app` bundle

`electron-builder` is configured in `packages/desktop/electron-builder.config.ts`
with `directories.output: "dist"` (relative to `packages/desktop`) and
`mac.target: ["dmg", "zip"]`. The prod channel sets the display name
**LarpCode macOS**, bundle id `ai.larpcode.desktop.macos`, and keeps the
`opencode` URL scheme for session compatibility. The bundle produced by the
desktop build is:

```text
dist/LarpCode macOS.app/
└── Contents/
    ├── Info.plist                      # CFBundleIdentifier = ai.larpcode.desktop.macos
    ├── MacOS/
    │   └── LarpCode macOS              # main executable
    └── Resources/
        ├── app.asar                    # Electron app code
        ├── opencode-cli                # bundled CLI, outside the asar
        ├── opencode-cli.version        # version of the bundled CLI
        └── icon.icns                   # app/DMG icon for pre-macOS 26
```

`script/macos/verify-bundle.ts` checks exactly this shape: `Contents/Info.plist`
with the prod identifier, an executable `Contents/MacOS/LarpCode macOS`, an
executable `Contents/Resources/opencode-cli`, and `Contents/Resources/icon.icns`.
Its default bundle path is `dist/LarpCode macOS.app` (quote the space when
running it from a shell):

```sh
bun script/macos/verify-bundle.ts "dist/LarpCode macOS.app"
```

### Bundled `opencode-cli`

`electron-builder.config.ts` excludes `resources/opencode-cli*` from the asar
`files` list and adds them back through `extraResources`, so the sidecar lands at
`Contents/Resources/opencode-cli` with its `opencode-cli.version` sibling. The
`afterPack` hook fails the build if either file is empty, and uses
`script/native-arch.ts` to verify the CLI matches the Electron architecture
(`arm64` with `arm64`, `x64` with `x64`) before packaging continues. The `.app`
bundle is what the DMG installs; the standalone `larpcode` binary is a separate
release asset installed by `install-cli.sh`.

### Icon resources

Icons live per channel under `packages/desktop/icons/{dev,beta,prod}`;
`packages/desktop/script/copy-icons.ts` copies the selected channel into
`packages/desktop/resources/icons` before packaging. For prod, `mac.icon` uses
the Icon Composer package `resources/icons/icon.icon` (macOS 26 and later draw
the Dock/Finder icon from its compiled `Assets.car`), while older macOS uses the
ICNS. The `afterPack` hook overwrites the actool-generated ICNS fallback with
`resources/icons/icon.icns` (the generated one is capped at 256 px and draws a
light ring around the squircle), and `dmg.icon` uses that same ICNS for the DMG
volume icon.

## DMG and ZIP

`mac.target` is `["dmg", "zip"]`. The DMG is the primary install: it mounts a
volume containing `LarpCode macOS.app` and an `Applications` symlink, so users
drag the app into Applications. The ZIP is an alternative for users who cannot
mount a DMG; expanding it yields `LarpCode macOS.app` directly.

Release asset names follow the `PORT_SPEC.md` table:

| Asset | Purpose |
| --- | --- |
| `LarpCode-macOS-universal.dmg` | Primary desktop install (drag to Applications) |
| `LarpCode-macOS-arm64.dmg`, `LarpCode-macOS-x64.dmg` | Per-architecture installs |
| `LarpCode-macOS-universal.zip` | ZIP alternative |
| `larpcode` | Standalone CLI binary (arch-specific) |
| `install-cli.sh`, `cli.json`, `update.json`, `SHA256SUMS` | CLI install + update/checksum feeds |

The in-app updater reads `update.json` from the repository's release feed. It
must never be pointed at the Windows `LarpCode-Setup.exe` asset.

## Entitlements and signing

`script/macos/entitlements.plist` provides the hardened-runtime entitlements
for future signing: JIT and unsigned executable memory (needed by the Electron
runtime), library validation disabled for the bundled native helpers,
audio (microphone) input, user-selected file read/write, and network
client/server access.

`script/macos/notarize.ts` signs the `.app` with `codesign --entitlements`, then
submits the DMG with `xcrun notarytool` and staples the ticket. It only runs when
all of `MACOS_SIGN_IDENTITY`, `MACOS_NOTARIZE_APPLE_ID`,
`MACOS_NOTARIZE_TEAM_ID`, and `MACOS_NOTARIZE_PASSWORD` are set; the release
workflow env-gates those secrets so an unsigned build does not fail. Per
`PORT_SPEC.md`, **v1 binaries are unsigned and not notarized**: users open the
app via right-click → Open, or clear the quarantine attribute with
`xattr -dr com.apple.quarantine "/Applications/LarpCode macOS.app"`.

## What `script/stage-macos.ts` stages

The macOS staging script assembles release inputs into a single output tree;
it does not build the app or the CLI. It reads `VERSION` and requires a
semver-like `x.y.z` value, resolves **all** required inputs before touching the
output directory (so a failed run cannot leave a partial release), then
recreates `dist/release/` and copies:

| Input (resolved by exact name) | Copied to `dist/release/` as |
| --- | --- |
| `packages/desktop/dist/LarpCode-macOS-universal.dmg` (required) | `LarpCode-macOS-universal.dmg` |
| `packages/desktop/dist/LarpCode-macOS-universal.zip` (required) | `LarpCode-macOS-universal.zip` |
| `packages/desktop/dist/LarpCode-macOS-arm64.dmg` (optional) | `LarpCode-macOS-arm64.dmg` |
| `packages/desktop/dist/LarpCode-macOS-x64.dmg` (optional) | `LarpCode-macOS-x64.dmg` |
| `dist-cli/larpcode` or `packages/cli/dist-cli/**/larpcode` (required) | `larpcode` |

Asset lookup also searches nested directories under `packages/desktop/dist` and
the two CLI output roots, so artifacts placed in a subdirectory (for example by
a changed `artifactName` pattern) are still found. After copying, the script
generates:

- `cli.json` — `{ version, name: "larpcode", sha256 }` for the standalone CLI.
- `update.json` — `{ version, notes, url: <base>/LarpCode-macOS-universal.dmg,
  zipUrl: <base>/LarpCode-macOS-universal.zip }`. The base defaults to
  `https://github.com/Aero-Apex/LarpCode-MacOS/releases/latest/download/` and
  can be overridden with `LARPCODE_RELEASE_URL`; notes come from
  `LARPCODE_RELEASE_NOTES`.
- `SHA256SUMS` — SHA-256 for every copied binary asset, sorted by filename.

Finally it reads the two manifests back and fails if their version, URL, name,
or checksum does not match what it just wrote. `dist/release/` is the directory
the release workflow uploads; other published inputs from `PORT_SPEC.md`
(`install-cli.sh` and the source archives) are added by the release asset
assembly step, not by this staging script.

## Why the Inno Setup script is legacy

`installer/LarpCode-Setup.iss` (with `script/stage-installer.ts`) is the
upstream Windows installer: it is compiled by `ISCC.exe`, installs under
`{app}`, ships `electron.exe`, `opencode-cli.exe`, `tor.exe`,
`curl-impersonate.exe`, and `.vbs`/`.cmd` launchers, rewrites the per-user
`PATH` in the registry, and outputs `installer/dist/LarpCode-Setup.exe`. None of
that applies to macOS, where the app is a signed-or-unsigned `.app` bundle
installed by dragging it from a DMG, and the CLI is installed by a POSIX script
into `~/.larpcode/bin`.

`PORT_SPEC.md` explicitly replaces the Windows Inno Setup installer with a
macOS DMG/ZIP built by `electron-builder`, and requires every in-app release URL
to point at this repository's feed. The `.iss` file is retained only as the
Windows/upstream reference implementation; it is not invoked by the macOS
release workflow, and its `.exe` asset must never appear in the macOS
`update.json`.
