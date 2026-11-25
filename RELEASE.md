# Releasing LarpCode macOS

Maintainer-only runbook for producing a LarpCode macOS release. The single source
of truth for names, versions, and behaviour is [`PORT_SPEC.md`](PORT_SPEC.md);
this document only describes the release procedure.

## Version and tags

* `VERSION` at the repository root holds the release version. For v1 it is
  `1.0.0`.
* The release tag is `v1`. It is **explicitly accepted as an alias of `v1.0.0`**,
  so either tag name resolves to the same v1 release; use `v1` as the canonical
  tag and `v1.0.0` only when a strict `v<VERSION>` match is needed.
* Every build is for macOS 13 (Ventura) or later, on Apple Silicon (`arm64`) or
  Intel (`x64`); a universal DMG is also published.

## Cutting a release

1. Set the root `VERSION` file to the version being released (`1.0.0` for v1).
   Confirm the value is semver-like and free of trailing whitespace.
2. Commit the version change (and any other changes that belong in the release)
   to `main`.
3. Tag the commit that contains the final `VERSION`:

   ```bash
   git tag v1            # accepted alias of v1.0.0
   # or, equivalently:
   git tag v1.0.0
   ```

4. Push the commit and the tag:

   ```bash
   git push origin main
   git push origin v1    # or v1.0.0
   ```

5. Pushing a `v*` tag triggers the `release` workflow
   (`.github/workflows/release.yml`) on a macOS runner. The workflow treats the
   `v1` tag as version `1.0.0`; for any other tag it requires the tag to equal
   `v<VERSION>` from `VERSION`, and refuses to continue otherwise.

The workflow can also be started manually with `workflow_dispatch`, which runs
the build without publishing a release.

## What the workflow does

The macOS release workflow performs these steps in order:

1. Checks out the tagged commit and sets up Bun from `package.json`.
2. Resolves and validates the version/tag pair described above.
3. Builds the bundled CLI (for the desktop app), the standalone `larpcode` CLI,
   and the desktop app itself.
4. Stages the macOS assets: the DMG and ZIP artefacts, the standalone CLI
   binary, `install-cli.sh`, the `cli.json` and `update.json` manifests, and the
   source archives. The in-app update feed points at this repository's release
   base URL, never at the Windows `LarpCode-Setup.exe` asset.
5. Writes `SHA256SUMS` for all staged binary assets.
6. Verifies the staged assets by checking `SHA256SUMS` before publishing. A
   checksum mismatch fails the job and nothing is published.
7. Publishes the staged assets as attachments to a **draft** GitHub release for
   the tag. A maintainer must review and publish (undraft) that release before
   users or the `latest` feed see the assets. For v1, the assets should be
   attached to the existing release described in
   [The existing source-only v1 release](#the-existing-source-only-v1-release).

## GitHub secrets for signing and notarization (optional)

The workflow reads the following repository secrets through environment gates:

| Secret | Purpose |
| --- | --- |
| `MACOS_SIGN_IDENTITY` | `codesign` identity (Developer ID Application) used to sign the app and CLI. |
| `MACOS_NOTARIZE_APPLE_ID` | Apple ID used for notarization submission. |
| `MACOS_NOTARIZE_PASSWORD` | App-specific password for that Apple ID. |
| `MACOS_NOTARIZE_TEAM_ID` | Developer Team ID for the notarization submission. |

All four are **optional**. They are env-gated: when any of them is absent the
build does **not** fail — it produces **unsigned and unnotarized** builds. That
is the expected state for v1, whose binaries are unsigned and not notarized.
Hardened-runtime entitlements are provided in the repository so signing can be
enabled later without changing the build layout.

For unsigned builds, users can still launch the app by right-clicking it and
choosing **Open**, or by clearing the quarantine attribute after downloading:

```bash
xattr -dr com.apple.quarantine /Applications/LarpCode\ macOS.app
```

## Release assets

Base URL for the in-app updater and CLI installer:

`https://github.com/Aero-Apex/LarpCode-MacOS/releases/latest/download/`

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

The in-app updater reads `update.json`. It must never be pointed at the Windows
`LarpCode-Setup.exe` asset.

## Verifying a release locally

After a release is published, verify what users will actually download:

1. Download `SHA256SUMS` and every binary asset you want to check from the
   release's `latest/download/` URL (or the specific tag URL) into one directory.
2. Check the checksums from that directory (macOS ships `shasum`):

   ```bash
   shasum -a 256 -c SHA256SUMS
   ```

   Every line must end in `OK`. This is the same check the workflow runs before
   publishing.

3. Inspect the feed. `update.json` must report the released version (for v1,
   `1.0.0`) and a SHA-256 that matches the DMG it advertises:

   ```bash
   cat update.json
   shasum -a 256 LarpCode-macOS-universal.dmg
   ```

   Its `url` must live under this repository's `releases/latest/download/`
   base, and must not reference `LarpCode-Setup.exe`.

4. Smoke-test the binaries. `./larpcode --version` must report the released
   version, and the DMG should mount and contain an app that opens via
   right-click → **Open** (unsigned v1 builds). If quarantine blocks a binary,
   remove it with `xattr -dr com.apple.quarantine <path>` as shown above.

## Rotating the `update.json` feed

`update.json` is the in-app and CLI update feed, published as a release asset so
that `releases/latest/download/update.json` always resolves to the newest
release. To rotate it to a new version:

1. Cut the new release following
   [Cutting a release](#cutting-a-release). The workflow regenerates
   `update.json` from the new `VERSION`, the release base URL, and the SHA-256
   of the new DMG, then attaches it to the new draft release alongside the other
   assets. Publish (undraft) that release to put the new feed live.
2. Because the feed is read from the `latest` download URL, no in-app URL change
   is needed — the desktop app and `larpcode upgrade` begin seeing the new
   version as soon as the new release is the latest one and not a draft.
3. Confirm the rotation by fetching the feed and checking that its `version`
   and `sha256` match the new DMG, as in
   [Verifying a release locally](#verifying-a-release-locally).

If a release must be pulled, make it a draft or delete it so that `latest`
resolves back to the previous good release; do not leave a broken `update.json`
as the newest published feed.

## The existing source-only v1 release

A GitHub release for `v1` already exists in this repository and currently
contains **source archives only** — it has no binary assets yet. It is not a
binary v1 release. The macOS workflow publishes the DMG/ZIP, standalone CLI,
manifests, and checksum files into that same `v1` release; maintainers should
attach the assets there rather than create a second, competing v1 release. Until
the workflow has run successfully and those assets appear (and pass the local
verification above), treat v1 as source-only.
