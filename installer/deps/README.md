# Installer dependencies

This directory documents third-party binary handling for two delivery paths:

- **macOS v1 (current)** — the DMG/ZIP, standalone `larpcode` CLI, and updater
  built by this repository. None of the files below are needed on a Mac.
- **Windows installer (legacy)** — the Inno Setup path inherited from the
  upstream Windows fork, retained here only as historical context. macOS builds
  do not run its scripts or require its binaries.

For user-facing macOS install and update instructions, see
[MACOS.md](../../MACOS.md) and [INSTALL.md](../../INSTALL.md).

## macOS v1 (current)

The macOS release is built with `electron-builder` and ships a DMG/ZIP plus a
standalone `larpcode` binary. It does **not** bundle the Windows `.exe` helpers
that the legacy installer used. There is no dependency-staging step for macOS,
and you do not need to run `script/fetch-installer-deps.ts` or
`script/fetch-electron.ts` when building or installing on a Mac. No files under
`installer/deps` are required for the macOS build.

Provider requests use ordinary HTTPS to the provider you configure (or the
`opencode.ai` service) through the system network stack. A macOS v1 install
does not require Tor or curl-impersonate to be present, and the Windows binaries
in this folder are not usable on macOS even if they have been staged.

The upstream app still exposes Tor/SOCKS5 and egress/auto-rotation settings, and
`larpcode doctor` / `larpcode settings` may report Cloudflare WARP, Tor, and
curl-impersonate as missing helpers. Those are warnings inherited from the
Windows build, not fatal errors on macOS. The egress-rotation UI — including the
network-egress step of "Fresh reset" — is also inherited from that build and is
**to be revisited** for macOS. v1 relies on normal HTTPS/provider access and
does not provide bundled Tor routing. See [MACOS.md](../../MACOS.md) before
changing any network UI or its documentation.

## Windows installer (legacy)

> **Legacy:** everything in this section describes the Inno Setup installer
> (`installer/LarpCode-Setup.iss`) from the upstream Windows fork. It is kept
> for historical context only. The macOS release workflow does not use it.

The legacy `script/stage-installer.ts` refused to build unless these release
inputs existed:

```
installer/deps/tor/tor.exe                  Tor Expert Bundle (Windows x86_64)
installer/deps/tor/geoip                    Tor's IPv4 country table
installer/deps/tor/geoip6                   Tor's IPv6 country table (optional)
installer/deps/impersonate/curl-impersonate.exe
installer/deps/impersonate/LICENSE
installer/deps/electron/electron.exe        Electron runtime (or a node_modules fallback)
```

They were third-party binaries and were intentionally not committed. On Windows
they were fetched with:

```powershell
bun run script/fetch-installer-deps.ts
bun run script/fetch-electron.ts
```

`script/fetch-installer-deps.ts` pinned stable Windows x64 Tor and
curl-impersonate builds and verified their SHA-256. To review and use newer
binaries instead, the URLs (and optional expected hashes) could be overridden:

```powershell
$env:TOR_EXPERT_URL="https://dist.torproject.org/torbrowser/<version>/tor-expert-bundle-windows-x86_64-<version>.tar.gz"
$env:CURL_IMPERSONATE_URL="https://github.com/lexiforest/curl-impersonate/releases/download/<version>/<asset>.tar.gz"
bun run script/fetch-installer-deps.ts
```

In that Windows build, Tor was launched on demand by the sidecar, and
curl-impersonate was used only for `opencode.ai` requests, falling back to
native `fetch` when absent. `script/fetch-electron.ts` pinned the Electron
runtime and verified it against the upstream `SHASUMS256.txt`. None of this
applies to the macOS edition.
