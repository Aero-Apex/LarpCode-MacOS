# LarpCode CLI on macOS

This guide covers the **standalone `larpcode` CLI** on macOS: the terminal UI and the `larpcode`
command, without the desktop app. It applies to the v1 release (unsigned and not notarized) on
macOS 13 (Ventura) or later, on Apple Silicon (`arm64`) or Intel (`x64`).

The CLI-only install uses the same LarpCode sessions, settings, and providers as the desktop app. It
does not install the desktop app or create desktop shortcuts.

Every download comes from the release feed:

```
https://github.com/Aero-Apex/LarpCode-MacOS/releases/latest/download/
```

Only install files obtained from that page.

## Install with install-cli.sh

Open Terminal and run the one-liner:

```sh
curl -fsSL https://github.com/Aero-Apex/LarpCode-MacOS/releases/latest/download/install-cli.sh | sh
```

If you prefer to read the script before running it, download it from the
[latest release](https://github.com/Aero-Apex/LarpCode-MacOS/releases/latest), review it, and run
it locally:

```sh
bash install-cli.sh
```

The script detects your Mac's architecture, downloads the matching standalone `larpcode` binary,
verifies its SHA-256 checksum against `cli.json`, installs it, and prints instructions for adding
the install directory to your `PATH`.

### Installer options

Pass options through the shell after `--` when piping the script, for example
`... | sh -s -- --version 1.0.0`. When running a local copy, pass them directly:
`bash install-cli.sh --version 1.0.0`.

| Option | Description |
| --- | --- |
| `--version <version>` | Install a specific version instead of the latest (for example `1.0.0`; `v1` is accepted as an alias of `v1.0.0`). |
| `--dir <path>` | Install into a custom directory instead of the default `~/.larpcode/bin`. Quote the path if it contains spaces. This is an option of the **installer**, not of the `larpcode` command. |
| `--uninstall` | Remove the installed CLI. Use with `--dir` if it was installed into a custom directory. |
| `--no-check` | Skip the automatic SHA-256 checksum verification against `cli.json`. Verification is on by default and skipping it is discouraged; see [Checksum verification](#checksum-verification). |

Examples:

```sh
# Install a specific version
curl -fsSL https://github.com/Aero-Apex/LarpCode-MacOS/releases/latest/download/install-cli.sh | sh -s -- --version 1.0.0

# Install into a custom directory (quote paths containing spaces)
bash install-cli.sh --dir "$HOME/Tools/LarpCode"

# Remove a CLI installed by this script
bash install-cli.sh --uninstall
```

## Where the binary lands

By default the installer places the executable at:

```
~/.larpcode/bin/larpcode
```

(`$HOME/.larpcode/bin/larpcode`.) With `--dir <path>`, the binary lands in that directory instead.
You can also download the correct `larpcode` binary from the Releases page and place it in any
folder already on your `PATH`.

## Add the CLI to your PATH

Add the install directory to your `PATH` using your shell's config file, then open a new terminal
(or run `source` on the config file).

For `zsh`, the macOS default, add to `~/.zshrc` (or `~/.zshenv`):

```sh
export PATH="$HOME/.larpcode/bin:$PATH"
```

For `bash`, add to `~/.bashrc`, `~/.bash_profile`, or `~/.profile`:

```sh
export PATH="$HOME/.larpcode/bin:$PATH"
```

If you installed with `--dir`, use that directory instead:

```sh
export PATH="$HOME/Tools/LarpCode:$PATH"
```

Reload the shell and confirm the command is found:

```sh
source ~/.zshrc          # or the config file you edited
command -v larpcode
```

## Verify the install

```sh
larpcode --help
larpcode --version
```

`larpcode --help` lists the available commands and flags. `larpcode --version` should report the
installed version, for example `larpcode v1.0.0`.

## Architecture selection

The installer picks the binary automatically from `uname -m`:

- Apple Silicon reports `arm64` (`aarch64` is normalized to `arm64`).
- Intel reports `x64` (`x86_64` is normalized to `x64`).

The `larpcode` binary is architecture-specific and is published in architecture subfolders or under
suffixed names; `cli.json` is the version/checksum manifest for the release. If an Intel shell is
running under Rosetta on Apple Silicon, it may report `x86_64`, so confirm with `uname -m` in a
native terminal before installing a per-architecture binary manually.

## Checksum verification

By default, `install-cli.sh` fetches `cli.json` and verifies the downloaded binary's SHA-256
checksum before installing it; a mismatch aborts the install. Keep this check enabled. `--no-check`
disables it and should only be used if you have verified the download another way.

Release assets are also listed in `SHA256SUMS`. To verify a download manually, put the asset and
`SHA256SUMS` in the same folder and run, from that folder:

```sh
shasum -a 256 -c SHA256SUMS
```

Each line should end in `OK`. Keep the downloaded filename exactly as published so it matches
`SHA256SUMS`. For the CLI, the installer's automatic `cli.json` check is normally sufficient, so a
separate `SHA256SUMS` check is optional.

## Quarantine removal

The v1 binaries are unsigned and not notarized. If you downloaded `larpcode` manually with a browser
(and not through `install-cli.sh`), macOS may quarantine it and refuse to run it. Remove the
quarantine attribute before running:

```sh
xattr -dr com.apple.quarantine "$HOME/.larpcode/bin/larpcode"
```

Use the path to the binary you actually installed (including a custom `--dir` path). Only do this
for a copy downloaded from the official Releases page.

## Run the CLI

With `~/.larpcode/bin` on your `PATH`, `larpcode` works in Terminal and in the desktop app's
terminal. With no arguments it opens the TUI in the current directory:

```sh
cd ~/Projects/my-app && larpcode
larpcode
larpcode --help
```

Pass a project directory as the first argument to start there. Quote paths that contain spaces:

```sh
larpcode "/Users/you/Projects/My App"
larpcode "$HOME/Projects/Client Work/website"
```

The CLI also accepts a `--dir` flag for the working directory, which is useful when combined with
other commands:

```sh
larpcode --dir "/Users/you/Projects/My App"
```

Do not confuse this `larpcode --dir` flag (working directory for the TUI) with the installer's
`install-cli.sh --dir` option (where the binary is installed).

Other useful commands:

```sh
larpcode usage       # limits, reset times, and local activity graphs
larpcode reset       # clear local usage counters (--deep also clears sessions)
larpcode settings    # LarpCode switches, Auto JB, dependencies, and paths
larpcode doctor      # server, database, WARP, Tor, and curl-impersonate
```

## Update the CLI

```sh
larpcode upgrade
```

`larpcode upgrade` checks the same release feed, downloads the matching `larpcode` binary,
verifies its checksum, and replaces the installed CLI. Open a new terminal afterward. This applies
to a CLI installed by `install-cli.sh`; the CLI bundled with the desktop app is updated through the
desktop app and does not replace itself.

If `larpcode upgrade` is unavailable, re-run the `install-cli.sh` one-liner: it overwrites
`~/.larpcode/bin/larpcode` with the latest verified binary. Keep your existing `PATH` entry. Add
`--dir` if you originally installed to a custom directory.

## Uninstall

Remove the CLI installed by the script:

```sh
bash install-cli.sh --uninstall
```

To remove it manually instead, delete the install directory and then remove the `PATH` line you
added to your shell config (for example `~/.zshrc`) and open a new terminal:

```sh
rm -rf "$HOME/.larpcode"
```

If you used `install-cli.sh --dir <path>` or a standalone binary elsewhere, remove that directory
or binary instead.

This removes only the CLI. To remove LarpCode sessions, settings, and caches as well, delete the
XDG directories under `~/Library/Application Support/LarpCode macOS` and
`~/Library/Caches/LarpCode macOS`. These paths contain a space, so quote them:

```sh
rm -rf "$HOME/Library/Application Support/LarpCode macOS" "$HOME/Library/Caches/LarpCode macOS"
```

This cannot be undone; back up anything you want to keep first.
