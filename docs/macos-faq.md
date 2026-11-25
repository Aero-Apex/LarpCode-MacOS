# LarpCode macOS — FAQ

Every answer below is taken only from `PORT_SPEC.md` (v1), the single source of truth for this
repository. Where the specification does not address a question, that is stated explicitly rather
than guessed.

## Is this an official build?

The specification does not describe the macOS edition as official, nor does it claim endorsement
or affiliation with OpenCode or the upstream LarpCode project. What it establishes is:

- Upstream: <https://github.com/Tazmyan/LarpCode> — a Windows-only fork of OpenCode.
- This repository: <https://github.com/Aero-Apex/LarpCode-MacOS> — a separate port, titled
  "LarpCode (macOS)", with the product display name "LarpCode macOS".

The document calls it "the macOS edition being built in this repository" and "this port". It makes
no further statement about official status, so no stronger claim can be made here.

## How does it relate to upstream LarpCode and OpenCode?

Upstream LarpCode is a Windows-only fork of OpenCode. This port keeps the application source intact
and replaces only the Windows-only delivery layer with a macOS one:

| Windows delivery | macOS replacement |
| --- | --- |
| Windows Inno Setup installer | macOS DMG/ZIP built by `electron-builder` |
| `.exe` CLI + PowerShell installer | standalone `larpcode` binary + `install-cli.sh` |
| `.bat`/`.vbs`/`.cmd` launchers | `.command` app launcher + POSIX CLI shim |
| Windows release workflow | macOS GitHub Actions workflow |
| Windows-only user docs | macOS install/update/permission docs |
| All in-app and in-repo release URLs | this repository's release feed |

The AI/TUI/UI engine is not forked or rewritten. Generic upstream references — such as
`opencode.ai` provider docs, the upstream MIT license, and i18n files — stay untouched unless they
are part of the macOS delivery layer. The `opencode` URL scheme is kept for session compatibility.

## Can I use it on Intel Macs?

Yes. The minimum requirement is macOS 13 (Ventura) on Apple Silicon **or** Intel. Supported
architectures are `arm64` (primary) and `x64` (Intel), with an optional universal DMG. The release
assets include:

- `LarpCode-macOS-universal.dmg` (primary desktop install, drag to Applications)
- `LarpCode-macOS-arm64.dmg` and `LarpCode-macOS-x64.dmg` (per-architecture installs)
- `LarpCode-macOS-universal.zip` (ZIP alternative)

The standalone `larpcode` CLI binary is architecture-specific and is published in architecture
subfolders or under suffixed names.

## Does it need Rosetta?

The specification does not mention Rosetta at all and makes no claim about it. What it does specify
is that native `arm64` and `x64` builds, plus an optional universal DMG, are produced.

## Is it signed?

No — v1 binaries are unsigned and not notarized. The documentation is required to tell users how
to open them via right-click → Open, and how to remove the quarantine attribute with:

```
xattr -dr com.apple.quarantine
```

The build workflow contains environment-gated `MACOS_SIGN_IDENTITY` and `MACOS_NOTARIZE_*` hooks;
the absence of those secrets must not fail the build. Hardened runtime entitlements are provided
for future signing.

## Where are my sessions stored?

The CLI/upstream code honours XDG variables, and the macOS launchers set them to the following
locations:

```
XDG_DATA_HOME="$HOME/Library/Application Support/LarpCode macOS/xdg/data"
XDG_CONFIG_HOME="$HOME/Library/Application Support/LarpCode macOS/xdg/config"
XDG_CACHE_HOME="$HOME/Library/Caches/LarpCode macOS/xdg/cache"
XDG_STATE_HOME="$HOME/Library/Application Support/LarpCode macOS/xdg/state"
```

The specification names these as the macOS data locations; it does not define a separate
"sessions" path beyond them. Note that `~/Library/Application Support/...` paths must be quoted
everywhere because the app name contains a space.

## Can I share sessions with Windows LarpCode?

The only related behaviour the specification states is that the `opencode` URL scheme is kept for
session compatibility. It does not document a session-sharing, import/export, or migration
procedure between the macOS and Windows editions, so none is described here. (Separately, the
in-app updater must never be pointed at the Windows `LarpCode-Setup.exe` asset — that constraint is
about updates, not sessions.)

## How do updates work?

The in-app updater reads `update.json` from the release feed at:

```
https://github.com/Aero-Apex/LarpCode-MacOS/releases/latest/download/
```

It must never be pointed at the Windows `LarpCode-Setup.exe` asset. The version file `VERSION` is
`1.0.0`, and the release tag `v1` is explicitly accepted as an alias of `v1.0.0`. Related release
assets include `cli.json` (CLI version/checksum manifest) and `SHA256SUMS` (checksums for all
binary assets).

## How do I uninstall?

The specification does not document an uninstall procedure. What it does document is the install
target — the primary DMG is installed by dragging to Applications, with per-architecture DMGs and
a ZIP alternative — and the data/cache locations listed in "Where are my sessions stored?" above.
No removal steps are specified.

## How do I install the CLI only?

The CLI command is `larpcode`. The Windows `.exe` CLI and PowerShell installer were replaced by a
standalone `larpcode` binary plus `install-cli.sh`. The relevant release assets are:

- `larpcode` — standalone CLI binary (architecture-specific, in architecture subfolders or with
  suffixed names)
- `install-cli.sh` — CLI installer
- `cli.json` — CLI version/checksum manifest

All assets are available from the release feed base shown under "How do updates work?". The
specification identifies these assets but does not spell out the exact installer invocation, so no
specific command is given here.

## What providers are supported?

The specification does not enumerate supported providers. It states that the AI/TUI/UI engine is
not forked or rewritten, and that generic upstream references such as `opencode.ai` provider docs
stay untouched unless they are part of the macOS delivery layer. Provider support is therefore
inherited unchanged from upstream, but no provider list is defined in this document.

## Why is my terminal asked for folder access?

The specification does not address macOS permission prompts and offers no explanation for them.
The only related behaviour it defines is that the macOS launchers set XDG variables pointing into
`~/Library/Application Support/LarpCode macOS/xdg/...` and
`~/Library/Caches/LarpCode macOS/xdg/cache`, and that those paths must be quoted because the app
name contains a space. No further reason for a folder-access request is specified.
