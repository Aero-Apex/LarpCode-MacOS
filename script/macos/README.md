# macOS release scripts

Helpers for verifying, signing, and smoke-testing the macOS delivery layer of
LarpCode. [`PORT_SPEC.md`](../../PORT_SPEC.md) is the source of truth for asset
names, identifiers, and release behaviour; the maintainer runbook is
[`RELEASE.md`](../../RELEASE.md).

Run every command from the repository root with the Bun version pinned in
`package.json` (currently 1.4.4). The release workflow runs on macOS 14; the
scripts that invoke Apple tools require macOS.

**v1 is unsigned and not notarized.** Signing is optional and gated on secrets.
None of these scripts requires signing secrets for an unsigned build to succeed.

## Quick reference

| File | Purpose | Environment | When |
| --- | --- | --- | --- |
| `verify-bundle.ts` | Structural check of a staged `.app` bundle | None | After the desktop build, before staging/signing; also in CI |
| `notarize.ts` | Optional codesign, notarize, and staple | `MACOS_SIGN_IDENTITY` + all three `MACOS_NOTARIZE_*` values (optional: `MACOS_APP_PATH`, `MACOS_DMG_PATH`, `LARPCODE_ENTITLEMENTS`) | After the `.app` and DMG exist, before release assets are assembled |
| `release-smoke.ts` | Smoke check of checked-in release sources (identity, workflow, launchers, docs) | None | Before a PR / before cutting a release |
| `macos-packaging.test.ts` | Static contracts for asset names, installer, and launchers | None | Before a PR and after changing delivery scripts or launchers |
| `entitlements.plist` | Hardened-runtime entitlements for future signing | Consumed via `LARPCODE_ENTITLEMENTS` | Only when signing is enabled; not used for v1 |

## `verify-bundle.ts`

```bash
bun run script/macos/verify-bundle.ts "dist/LarpCode macOS.app"
# or, using the default dist/LarpCode macOS.app:
bun run verify:bundle
```

`checkBundle()` verifies five things:

1. `Contents/Info.plist` exists.
2. Its `CFBundleIdentifier` is `ai.larpcode.desktop.macos`.
3. `Contents/MacOS/LarpCode macOS` exists and is executable.
4. `Contents/Resources/opencode-cli` (the bundled CLI) exists and is executable.
5. `Contents/Resources/icon.icns` exists.

Each check prints `PASS` or `FAIL` with a detail message on failure; any failed
check sets exit code 1. No environment variables are required.

Run it after `bun run --cwd packages/desktop build` and again after any step that
rewrites the bundle (for example, signing). It is safe to run on any machine —
it only reads files. The script is intended for CI and local pre-flight checks;
the release workflow does not call it automatically.

## `notarize.ts`

```bash
# Flags or positional paths; both the .app and the DMG are required.
bun run script/macos/notarize.ts \
  --app "dist/LarpCode macOS.app" \
  --dmg dist/LarpCode-macOS-universal.dmg
bun run script/macos/notarize.ts "dist/LarpCode macOS.app" dist/LarpCode-macOS-universal.dmg
```

Paths can also come from the environment instead of argv (argv wins):

| Variable | Purpose |
| --- | --- |
| `MACOS_APP_PATH` | Default `.app` path when `--app`/positional argument is omitted |
| `MACOS_DMG_PATH` | Default DMG path when `--dmg`/positional argument is omitted |
| `LARPCODE_ENTITLEMENTS` | Optional override for the entitlements plist; defaults to `entitlements.plist` next to the script |

Signing requires **all four** of these secrets; if any is missing the script
prints a skip message and exits successfully without touching the artifacts:

| Variable | Purpose |
| --- | --- |
| `MACOS_SIGN_IDENTITY` | `codesign` identity (Developer ID Application) |
| `MACOS_NOTARIZE_APPLE_ID` | Apple ID for notarization |
| `MACOS_NOTARIZE_PASSWORD` | App-specific password (not trimmed; logged as `***`) |
| `MACOS_NOTARIZE_TEAM_ID` | Developer Team ID |

With all four present and `process.platform === "darwin"`, it checks that the
app, DMG, and entitlements files are accessible, then runs, in order:

1. `codesign --deep --force --options runtime --entitlements <plist> --sign <identity> <app>`
2. `xcrun notarytool submit <dmg> --apple-id <id> --password <password> --team-id <team> --wait`
3. `xcrun stapler staple <dmg>`

Commands are spawned directly (no shell), so passwords and paths are passed
verbatim. Run this after the `.app` and DMG are built and before the release
assets are copied into `dist/release/`. For v1 it is a no-op: unsigned builds
are expected, and users open them with right-click → **Open** or by removing
quarantine with `xattr -dr com.apple.quarantine <path>`.

The release workflow uses the same four secrets as an env gate and currently
performs the equivalent codesign/notarytool/stapler commands inline; missing
secrets produce a notice, not a failure.

## `release-smoke.ts`

```bash
bun run script/macos/release-smoke.ts
```

A local release smoke check that reads **checked-in sources only**, so it runs
without Electron binaries or a full install. It prints `PASS`/`FAIL` for each
check, a `passed/total` summary, and exits 1 if any check fails. No environment
variables or secrets are needed.

Checks cover:

* `VERSION` is semver-like, and the README carries the PORT_SPEC identity
  tokens (`LarpCode macOS`, canonical repo, `opencode`/`larpcode`, macOS 13 /
  Ventura, Apple Silicon / Intel, `arm64`/`x64`, `v1`).
* `.github/workflows/release.yml` uses `Aero-Apex/LarpCode-MacOS` and contains no
  Windows-only markers (`windows-latest`, `LarpCode-Setup.exe`).
* `packages/desktop/electron-builder.config.ts` uses
  `ai.larpcode.desktop.macos` and the new `releases/latest/download/` publish
  URL, with no upstream `Tazmyan/LarpCode` URL.
* Root `install-cli.sh` is executable and contains checksum verification
  (`shasum -a 256`), quarantine removal (`xattr`, `com.apple.quarantine`).
* Both launchers (`shortcuts/LarpCode.command`, `shortcuts/larpcode`) export all
  four quoted `XDG_*` variables.
* `docs/` exists, has files, and contains no `LarpCode-Setup.exe` references.

`checks` and `runChecks(base?)` are exported so tests can run the same checks
against a fixture directory without printing output or exiting the process.
Run this before opening a release-related PR and again before cutting a release;
it complements (but does not replace) the built-artifact checks in
`verify-bundle.ts` and `SHA256SUMS`.

## `macos-packaging.test.ts`

```bash
bun test script/macos/macos-packaging.test.ts
# root script that also syntax-checks the shell launchers and installer:
bun run check:macos
```

Static regression tests (via `bun:test`) that protect the macOS delivery
contracts:

* `stage-macos.ts` and `release-assets.ts` reference the PORT_SPEC asset names
  (`LarpCode-macOS-`, `update.json`, `cli.json`, `SHA256SUMS`) and never fall
  back to Windows-only assets (`LarpCode-Setup.exe`, `install-cli.ps1`).
* `install-cli.sh` (in any of its supported locations) covers checksums
  (`shasum`), quarantine removal (`xattr`), both architectures (`arm64`,
  `x64`), and the canonical `https://github.com/Aero-Apex/LarpCode-MacOS`
  repository.
* `shortcuts/LarpCode.command` and `shortcuts/larpcode` export quoted
  `XDG_DATA_HOME`, `XDG_CONFIG_HOME`, `XDG_CACHE_HOME`, and `XDG_STATE_HOME`
  paths, with the first, second, and fourth under
  `"Application Support/LarpCode macOS"` (the space in the app name matters).

No environment variables are required. Run these tests before opening a PR
that touches delivery scripts, the CLI installer, or the launchers.

## `entitlements.plist`

Hardened-runtime entitlements used by `notarize.ts` when signing is enabled.
They permit JIT and unsigned executable memory, disable library validation,
and allow audio input, user-selected file read/write, and network client/server
access — the capabilities the Electron app and its bundled CLI need.

The file is not a script and needs no environment variables. v1 builds are
unsigned, so these entitlements are not applied; they are provided so signing
can be turned on later without changing the bundle layout. To use a different
plist, set `LARPCODE_ENTITLEMENTS` when running `notarize.ts`.

## Where these fit in the release workflow

1. Build the bundled CLI, standalone `larpcode` CLI, and desktop app
   (`bun run --cwd packages/desktop build` produces the `.app`, DMG, and ZIP).
2. Run `verify-bundle.ts` (manually or in CI) to fail early on an incomplete
   bundle.
3. Optionally run `notarize.ts` when all four signing/notarization secrets are
   configured. With no secrets it is a no-op, which is the expected v1 path.
4. Stage assets with `bun run script/stage-macos.ts` and assemble them with
   `bun run script/release-assets.ts` (`dist/release/`).
5. Before publishing, check `SHA256SUMS` (`shasum -a 256 -c SHA256SUMS`). Run
   `release-smoke.ts` as a pre-PR/pre-tag check of the checked-in release
   configuration; it does not inspect built artefacts.
6. The workflow uploads `dist/release/`, verifies checksums again in the publish
   job, and attaches the assets to the GitHub release. `update.json` always
   points at this repository's `releases/latest/download/` feed, never at the
   Windows `LarpCode-Setup.exe`.
