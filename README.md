# LarpCode macOS

LarpCode is an open-source AI coding app — a community fork of
[OpenCode](https://github.com/anomalyco/opencode) with a redesigned interface and
extra tools for working with AI models. This repository is the **macOS edition**,
ported from the Windows LarpCode fork.

It runs on your own Mac. Your files and prompts stay local, except for the
requests you choose to send to an AI provider.

Requires **macOS 13 (Ventura) or later**, on either Apple Silicon or Intel.

## Choose an install

- **Desktop app (recommended)** — the full graphical app plus the `larpcode`
  terminal command.
- **CLI only** — the terminal UI and `larpcode` command, without the desktop app.

Both use the same LarpCode sessions, settings, and providers, kept separate from
any OpenCode installation on your machine.

### Desktop app (DMG)

1. Open the [latest release](https://github.com/Aero-Apex/LarpCode-MacOS/releases/latest).
2. Download `LarpCode-macOS-universal.dmg` (or the `arm64` / `x64` DMG for your
   Mac).
3. Open the DMG and drag **LarpCode macOS** into your Applications folder.
4. Eject the DMG, then launch the app from Applications.

The v1 release is **unsigned and not notarized**, so macOS Gatekeeper may refuse
to open it the first time. To launch it:

- Right-click (or Control-click) the app in Applications, choose **Open**, then
  **Open** again in the dialog; or
- Remove the quarantine flag from a terminal:

  ```bash
  xattr -dr com.apple.quarantine "/Applications/LarpCode macOS.app"
  ```

Only do this for a copy downloaded from the official Releases page above. A ZIP
alternative (`LarpCode-macOS-universal.zip`) is published too if you prefer it.

The desktop install also includes the bundled `larpcode` command — see
[Command line](#command-line).

### CLI only

Open Terminal and run this one line:

```bash
curl -fsSL https://github.com/Aero-Apex/LarpCode-MacOS/releases/latest/download/install-cli.sh | sh
```

The script downloads the latest `larpcode` binary for your Mac, verifies its
SHA-256 checksum against `cli.json`, and installs it at:

```
~/.larpcode/bin/larpcode
```

Add that folder to your `PATH` — for example, in `~/.zshrc` (or your shell's
config file):

```bash
export PATH="$HOME/.larpcode/bin:$PATH"
```

Open a new terminal afterward, then run `larpcode --help` or just `larpcode` to
start the TUI in the current folder. You can also download the `larpcode` binary
from the Releases page and place it in any folder already on your `PATH`.

The CLI-only install does not install the desktop app or create desktop
shortcuts.

## First launch

LarpCode does not include an AI model or an API key. On first launch, open
**Settings** and connect the provider you want to use (for example OpenAI,
Anthropic, Google, or a local model). You can change or remove providers at any
time.

## Updates

- **Desktop app** — checks the public release feed and offers updates inside the
  app. Your sessions and settings are kept.
- **CLI only** — `larpcode upgrade` checks the same release feed, downloads the
  matching `larpcode` binary, verifies its checksum, and replaces the CLI. Open
  a new terminal afterward.
- **CLI bundled with the desktop app** — update through the desktop app; the
  bundled CLI does not replace itself.

The first update check happens automatically. Open `/update` in the TUI or run
`larpcode upgrade` to check manually.

## Command line

With `~/.larpcode/bin` on your `PATH`, `larpcode` works in Terminal and in the
desktop app's terminal. Open a new terminal after installing, then pass a folder
using a POSIX path to start there:

```bash
larpcode /Users/you/Projects/my-app
cd ~/Projects/my-app && larpcode
larpcode --help
```

`larpcode` with no arguments opens the TUI in the current directory. In the TUI,
open the `larpcode` control at the top right or run `/larpcode:settings` to
toggle Auto JB, auto-rotate, free fallback, and Tor routing, reset usage, and
see missing helpers.

Useful commands:

```bash
larpcode usage       limits, reset times, and local activity graphs
larpcode reset       clear local usage counters (--deep also clears sessions)
larpcode settings    LarpCode switches, Auto JB, dependencies, and paths
larpcode doctor      server, database, WARP, Tor, and curl-impersonate
```

Free models use opencode.ai's shared anonymous pool. When that pool refuses a
request and Free fallback is on, LarpCode routes it to a fallback provider
instead: the configured DeepSeek key when present, otherwise Pollinations
(`text.pollinations.ai`). The TUI shows a "Fallback in use" notice and records
the provider in LarpCode settings; `larpcode run` prints the same notice to
stderr (or a `fallback` event with `--format json`). `larpcode usage` reports the
current free-route state and the last fallback used. A refusal is the shared
pool's limit, not a limit on your local usage.

`larpcode doctor` and `larpcode settings` report optional helpers that are not
installed, including Cloudflare WARP, Tor, and curl-impersonate. These are
warnings, not fatal errors.

## Where LarpCode stores data

The macOS launchers set XDG variables under Application Support. Because the app
name contains a space, these paths are quoted:

```
XDG_DATA_HOME   = "$HOME/Library/Application Support/LarpCode macOS/xdg/data"
XDG_CONFIG_HOME = "$HOME/Library/Application Support/LarpCode macOS/xdg/config"
XDG_CACHE_HOME  = "$HOME/Library/Caches/LarpCode macOS/xdg/cache"
XDG_STATE_HOME  = "$HOME/Library/Application Support/LarpCode macOS/xdg/state"
```

The desktop app and CLI-only installs share these locations. They do not read
or overwrite the data of an OpenCode installation on the same machine.

## Verify your download

Release assets are listed in a `SHA256SUMS` file. From the folder containing the
downloaded files:

```bash
shasum -a 256 -c SHA256SUMS
```

## Uninstall

- **Desktop app** — quit LarpCode, then drag **LarpCode macOS** from Applications
  to the Trash.
- **CLI** — delete `~/.larpcode/bin/larpcode` and remove the
  `~/.larpcode/bin` `PATH` line you added to your shell config.
- **All data** — to remove sessions, settings, and caches as well, delete the
  folders listed in [Where LarpCode stores data](#where-larpcode-stores-data).
  This cannot be undone.

## Features

- **Unlimited free AI coding** — no paid edition, activation key, or app-side
  message cap. Connect your own provider or a local model.
- **Auto JB** — one Settings toggle applies a configurable instruction set to
  every model request instead of the workspace `AGENTS.md`.
- **Full OpenCode experience** — sessions, tools, plugins, projects, and the
  local agent runtime, with a LarpCode interface.
- **macOS desktop app** — a DMG you drag to Applications and an in-app updater.
- **Fresh reset** — backs up local sessions, clears local usage data, rotates
  the local client identity, and can rotate your network egress if you have
  configured it.
- **Network options** — optional Tor and SOCKS5 routing for supported requests.
- **Usage dashboard** — see local token and cost estimates and reset the local
  counters when you want a clean slate.

## More documentation

- [INSTALL.md](./INSTALL.md) — detailed install steps.
- [MACOS.md](./MACOS.md) — macOS permissions, Gatekeeper, and unsigned-app notes.
- [docs/](./docs/) — additional guides.

## Build from source

LarpCode is a Bun/TypeScript monorepo. See [CONTRIBUTING.md](./CONTRIBUTING.md)
and [docs/](./docs/) for development and macOS packaging details.

## Community

Questions, bug reports and feature requests are welcome.

- Discord: <https://discord.gg/CXXxz68BR5>

## Legal notice and disclaimer

LarpCode is an independent community project. It is **not affiliated with,
endorsed by, or sponsored by** OpenCode, Anomaly, GitHub, or any AI
model provider. All product names, logos, and trademarks belong to their
respective owners.

LarpCode is provided **"as is"**, without warranty of any kind, express or
implied, including merchantability, fitness for a particular purpose, and
non-infringement. You use LarpCode at your own risk. To the maximum extent
permitted by applicable law, the maintainers and contributors are not liable
for any direct, indirect, incidental, special, consequential, or punitive
damages, including data loss, lost profits, account suspension, service
termination, or any other harm arising from the use of or inability to use
LarpCode.

By downloading or using LarpCode, you agree to this notice. If you do not
agree, do not use LarpCode.

You are responsible for how you use LarpCode. That includes following the terms
of service of any AI provider or other service you connect, respecting
copyright and other rights, and complying with the laws that apply to you.
LarpCode does not include or grant access to any AI account, API key, model, or
service.

Nothing in this notice excludes or limits liability that cannot be excluded or
limited under applicable law. If you are a consumer in the EU/EEA, your
mandatory statutory rights are not affected.

The source code in this repository is available under the MIT License; see
[LICENSE](./LICENSE).

### Takedown and removal policy

We respect the rights of other projects and rights holders. If the OpenCode
maintainers, a rights holder, or GitHub ask us to remove material, or to remove
or disable a feature, we will do so promptly. If you believe something in this
repository infringes your rights, please contact us through the repository's
issue tracker or Discord so we can resolve it.

## Credits

LarpCode is based on **olliEcode**, which is itself built on OpenCode. Credit
for the original custom features and ideas goes to the olliEcode authors.

- OpenCode: <https://github.com/anomalyco/opencode>
- olliEcode: credit to the olliEcode project and its contributors
