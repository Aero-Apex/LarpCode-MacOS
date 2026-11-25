# LarpCode Desktop (macOS)

The LarpCode desktop app for macOS, built with Electron on top of OpenCode. It
requires macOS 13 (Ventura) or later on Apple Silicon or Intel. Packaging is
handled by `electron-builder`, which produces DMG and ZIP artifacts.

## Development

```bash
bun install
bun dev
```

`bun dev` is separate from packaging: it uses local renderer/server mode, the
dev app identity, and the CLI source by default. `bun dev --download-server <version>`
instead downloads that CLI version for local development.

## Build on macOS

Run the build from the repository root:

```bash
bun run --cwd packages/desktop build
```

(Equivalently, `cd packages/desktop && bun run build`.) This is the same command
the release workflow uses on its `macos-14` runner. It:

1. Copies the channel's icons and metainfo into `resources/` (`script/copy-icons.ts`
   and `script/copy-metainfo.ts`).
2. Makes sure a CLI binary for the target is in `resources/`: it uses
   `packages/cli/dist` when that holds the target's CLI, otherwise `dev`/`local`
   (unset or unrecognized) downloads the published dev CLI and `beta` downloads
   the beta CLI. `prod` fails if the CLI has not been built.
3. Runs `bunx electron-vite build` into `out/`, then verifies the built bundles.

`electron-builder` then packages the built app into its macOS targets — a DMG
and a ZIP — according to `electron-builder.config.ts`. The CLI is placed outside
`app.asar` in the application's `Contents/Resources` directory, and packaging
fails if it is missing, empty or built for the wrong architecture.

### Where outputs land

| Path | Contents |
| --- | --- |
| `packages/desktop/out/` | Compiled main, preload and renderer bundles from `electron-vite`. |
| `packages/desktop/dist/` | `electron-builder` artifacts: `LarpCode-macOS-universal.dmg`, `LarpCode-macOS-arm64.dmg`, `LarpCode-macOS-x64.dmg` and `LarpCode-macOS-universal.zip`. |
| `dist/release/` | Release assets assembled by `bun run stage:macos` from the repository root: the DMG/ZIP files plus the standalone `larpcode`, `cli.json`, `update.json` and `SHA256SUMS`. |

Both `build` and packaging read the same environment as every other release
package:

| Variable | Meaning |
| --- | --- |
| `OPENCODE_CHANNEL` | `dev` (default), `beta`, or `latest`/`prod`. Picks the app identity, icons and bundled CLI. |
| `OPENCODE_VERSION` | Version stamped into the app and its packages. |
| `OPENCODE_TARGET` | `darwin-arm64` or `darwin-x64`. Defaults to the host architecture. |

`arm64` is the primary architecture, `x64` covers Intel Macs, and an optional
universal DMG combines both. The channel also selects the macOS app identity
and icon set described below.

## App identity and icons

| Channel | Bundle identifier | Product name |
| --- | --- | --- |
| `prod` | `ai.larpcode.desktop.macos` | LarpCode macOS |
| `beta` | `ai.larpcode.desktop.beta` | LarpCode Beta |
| `dev` | `ai.larpcode.desktop.dev` | LarpCode Dev |

The packaged app registers the `opencode://` URL scheme, kept for session
compatibility with upstream OpenCode.

For `prod`, the app icon is an [Icon Composer](https://developer.apple.com/icon-composer/)
package (`icons/prod/icon.icon`), which macOS 26 and later draw from the
compiled `Assets.car`. An `icon.icns` is bundled as the pre-macOS 26 fallback and
is also used as the DMG volume icon. Dev and beta builds use `icon.icns`
directly. The ICNS must be regenerated with the correct inset and premultiplied
alpha; see `icons/README.md`.

## Signing and notarization (optional)

v1 binaries are **unsigned and not notarized**. The normal build and release
path needs no signing secrets and never fails because they are absent. A helper
is available for maintainers who do have a Developer ID:

```bash
bun run script/macos/notarize.ts --app "dist/LarpCode macOS.app" --dmg dist/LarpCode-macOS-universal.dmg
```

The paths can also be supplied with `MACOS_APP_PATH` and `MACOS_DMG_PATH`. The
helper codesigns the `.app` with the hardened-runtime entitlements in
`script/macos/entitlements.plist`, submits the DMG to `notarytool` and staples
the ticket. It runs only when all four of `MACOS_SIGN_IDENTITY`,
`MACOS_NOTARIZE_APPLE_ID`, `MACOS_NOTARIZE_TEAM_ID` and
`MACOS_NOTARIZE_PASSWORD` are set (and only on macOS); otherwise it is a no-op,
leaving the artifacts unsigned. The password is an app-specific password and is
never echoed in the logged commands.

`bun run verify:bundle` checks a staged `dist/LarpCode macOS.app` for its
`Info.plist` bundle identifier, an executable main binary and bundled CLI, and
the ICNS resource.

## Updates and beta channel

The release workflow publishes the DMG and ZIP assets from a `v*` tag. The
packaged app uses `ai.larpcode.desktop.macos` for production
(`ai.larpcode.desktop.beta` and `ai.larpcode.desktop.dev` for preview builds)
and reads `update.json` from the latest GitHub release of this repository —
never from the upstream Windows `LarpCode-Setup.exe` asset.

## Startup benchmark

`perf/startup.bench.ts` times a launch with [strobe](https://github.com/anomalyco/strobe),
from process spawn to what a person waits for, in pairs of launches of two builds
with an interval per case. Every launch runs in a private home (its own XDG
folders, database, config and macOS `~/Library` containers, with the developer's
`OPENCODE_*`, `OTEL_*` and `SENTRY_*` environment removed), so it never touches
the developer's app, profile or live service.

| Case | Launch | Ends on |
| --- | --- | --- |
| launch to Home | Profile kept from earlier launches; the service already runs, from the bundled CLI. | Home |
| launch to a restored tab | Profile kept; the first launch's onboarding draft is restored. | The composer |
| launch to Home, service stopped | Profile kept; the desktop spawns its service. | Home |
| first launch | No profile or GPU shader caches: right after an install, onboarding opens a draft. | The composer |
| dev start to Home | `bun dev:desktop` with Vite's caches and `out` deleted. | Home |

```bash
# A returning user's launches of two packaged builds (pack each with OPENCODE_CHANNEL=beta or prod), or two installed
# channels.
strobe bench perf/startup.bench.ts --target desktop --base app:LarpCode --head app:LarpCode-beta

# The first launch after an install.
strobe bench perf/startup.bench.ts --target install --base app:LarpCode --head app:LarpCode-beta

# The dev loop's cold start, dev against this checkout.
strobe bench perf/startup.bench.ts --target dev --base origin/dev --head .
```

strobe runs on macOS, Windows and Linux, but page and desktop cases measure the
most on Windows. On macOS, frames come from Chromium's trace only, runs are not
pinned to a CPU, and a desktop case launches only a build whose bundle id this
account has never run (`packages/app/perf/README.md` lists what each OS gives).

Besides `launch.ready`, each launch reports its milestones as `launch.<name>` in
ms since spawn: the main process's own marks from its log (`entry`, `electron`,
`window`, `served`, `bundle`, `logging`, `storage`, `init`, `layers`, `visible`,
`service.starting`, `service.ready`; `src/main/lifecycle/marks.ts`), or each
step of the dev command's output. `launch.painted` and `launch.settled` are when
the window's pixels first and last changed, `cpu.work` is the CPU every process
used until ready, and `launch.node.*` is Node's bootstrap timing in builds that
accept `--inspect`. The first launch of each build is discarded, because a newly
downloaded binary pays a one-time Gatekeeper/quarantine check. The packaged
returning-user cases keep the GPU shader caches their build compiled in earlier
launches, as a person's machine has them; `first launch` starts each launch
without them. `--why always` adds a profiled launch per build: the main process
and the renderer, both from their first statement.

A packaged beta or prod build registers itself as the `opencode://` handler when
it starts, even from the bench; the installed app takes the registration back on
its next launch. Those channels run with `HTTPS_PROXY` pointed at a closed port
(`--offline` forces it for dev) so the updater's first check fails fast instead
of reaching GitHub.
