# LarpCode macOS — Updates

This document describes how updates work in the macOS edition of LarpCode. Names, versions, and
release assets come from [`PORT_SPEC.md`](../PORT_SPEC.md); the maintainer procedure lives in
[`RELEASE.md`](../RELEASE.md). Installation and Gatekeeper details are in
[`INSTALL.md`](../INSTALL.md).

There are two update paths: the desktop app updates itself through the in-app updater, and a
CLI-only install updates through `larpcode upgrade`. Both read files published as assets on this
repository's releases, at:

```
https://github.com/Aero-Apex/LarpCode-MacOS/releases/latest/download/
```

Only download from that feed.

## Version and tag mapping

The root `VERSION` file holds the release version; for v1 it is `1.0.0`. The release tag `v1` is
explicitly accepted as an alias of `v1.0.0`, so either name resolves to the same v1 release. Because
the updater reads the `latest/download/` URL, it follows whichever release is newest rather than a
hard-coded version.

## Desktop app updates

- The in-app updater checks this repository's `update.json` from the feed above. It must never be
  pointed at the Windows `LarpCode-Setup.exe` asset.
- When a newer version is offered, the updater downloads the matching macOS build from the release:
  `LarpCode-macOS-universal.dmg`, a per-architecture DMG (`LarpCode-macOS-arm64.dmg` or
  `LarpCode-macOS-x64.dmg`), or `LarpCode-macOS-universal.zip` if you prefer the ZIP alternative.
- There is no automatic elevation or silent install. The updater does not install the app for you or
  write into `/Applications`. You open the downloaded DMG (or expand the ZIP) and drag
  **LarpCode macOS.app** onto **Applications**, replacing the existing copy. Eject the DMG when
  done, then launch the app from Applications.
- Sessions and settings are preserved: they live outside the app bundle, in the XDG directories the
  launchers set under `~/Library/Application Support/LarpCode macOS/` and
  `~/Library/Caches/LarpCode macOS/`. Quote those paths in a terminal because the app name contains
  a space. Replacing the `.app` does not remove that data.

### Gatekeeper on unsigned builds

v1 binaries are unsigned and not notarized. A newly downloaded copy can be quarantined again, so an
update may trigger Gatekeeper even if the previous copy opened fine. If macOS refuses to open the new
app, repeat the steps in [First launch and Gatekeeper](../INSTALL.md#first-launch-and-gatekeeper):
Control-click (or right-click) **LarpCode macOS.app** in Applications and choose **Open**, then
**Open** again in the dialog. Alternatively, clear the quarantine attribute:

```sh
xattr -dr com.apple.quarantine "/Applications/LarpCode macOS.app"
```

Only do this for copies downloaded from the official Releases feed.

## CLI-only updates

A CLI-only install is updated from the terminal:

```sh
larpcode upgrade
```

The command checks this repository's `cli.json` manifest from the same release feed, downloads the
`larpcode` binary that matches your Mac's architecture, verifies its SHA-256 checksum against the
manifest, and replaces the installed CLI. Open a new terminal afterward so the new binary is used.

`install-cli.sh` performs the same checksum check against `cli.json` when installing, so the
`larpcode` binary is verified on both install and upgrade. The CLI bundled with the desktop app is
different: update that copy through the desktop app; it does not replace itself.

## Checksums

The release publishes `SHA256SUMS` with checksums for all binary assets, including the DMGs, ZIP,
and standalone `larpcode` binary. To verify a download, put the asset and `SHA256SUMS` in the same
folder, keep the published filename unchanged, and run from that folder:

```sh
shasum -a 256 -c SHA256SUMS
```

Each line should end in `OK`. For the CLI, the check against `cli.json` already happens during
install/upgrade, so a separate `SHA256SUMS` check is optional. You can also compare the `sha256`
value in `update.json` with the DMG you downloaded.

## Publishing an update (maintainers)

See [`RELEASE.md`](../RELEASE.md) for the full runbook. In short: set the root `VERSION`, commit and
tag it (`v1` is the canonical tag, accepted as an alias of `v1.0.0`), and push the `v*` tag. The
macOS release workflow builds the DMG/ZIP and standalone CLI, writes `update.json` and `cli.json`
pointing at this repository's release feed, generates `SHA256SUMS`, verifies those checksums, and
attaches the assets to the GitHub release. Once that release is the latest published one, the in-app
updater and `larpcode upgrade` see the new version through the `latest/download/` feed without any
URL change.
