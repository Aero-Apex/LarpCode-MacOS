# Launchers (`shortcuts/`)

This folder holds the user-facing launchers for LarpCode macOS. It replaces the
Windows launcher layer described in `PORT_SPEC.md`: the Windows `.bat`/`.vbs`/`.cmd`
files become a `.command` app launcher and a POSIX CLI shim.

The two macOS files are:

- `LarpCode.command` — double-click launcher for the desktop app.
- `larpcode` — POSIX `sh` shim for the bundled CLI.

Both are executable shell scripts. The app name contains a space
(`LarpCode macOS`), so those paths are quoted everywhere.

## `LarpCode.command` — desktop app launcher

Double-click `LarpCode.command` in Finder to start the installed desktop app.
Double-clicking a `.command` file opens a Terminal window that runs the script.
It is a `bash` script that uses `set -euo pipefail` and does the following:

1. Resolves its own directory with `cd "$(dirname "$0")" && pwd -P`, then sets
   `APP_ROOT` to the parent of `shortcuts/`. `pwd -P` resolves symlinked parent
   directories so `APP_ROOT` points at the real install location.
2. Exports the XDG variables below and creates each directory with `mkdir -p`:

   ```sh
   XDG_DATA_HOME="$HOME/Library/Application Support/LarpCode macOS/xdg/data"
   XDG_CONFIG_HOME="$HOME/Library/Application Support/LarpCode macOS/xdg/config"
   XDG_CACHE_HOME="$HOME/Library/Caches/LarpCode macOS/xdg/cache"
   XDG_STATE_HOME="$HOME/Library/Application Support/LarpCode macOS/xdg/state"
   ```

   The CLI/upstream code honours these variables. They keep LarpCode's state out
   of a generic OpenCode profile. The `~/Library/Application Support/...` paths
   must stay quoted because the app name contains a space.
3. Launches the app bundle's executable. The default path is:

   ```sh
   "$APP_ROOT/LarpCode macOS.app/Contents/MacOS/LarpCode macOS"
   ```

   Set `LARPCODE_APP_PATH` to override it. The override may be either the
   executable itself or a `.app` bundle; when it is a directory, the launcher
   appends `Contents/MacOS/LarpCode macOS` to it.

If the target exists but is not executable, the launcher prints a `chmod +x`
hint and exits. If it does not exist, it prints the path it looked for and
exits.

### Executable bit (`chmod +x`)

A `.command` file must have its executable bit set to be double-clickable, and
the app's `Contents/MacOS/LarpCode macOS` binary must also be executable. If a
copy or extraction lost those bits, restore them from a terminal:

```sh
chmod +x "path/to/shortcuts/LarpCode.command"
chmod +x "/Applications/LarpCode macOS.app/Contents/MacOS/LarpCode macOS"
```

The same applies to the `larpcode` shim described below.

### Gatekeeper note

v1 binaries are unsigned and not notarized. On first launch macOS may report
that "LarpCode macOS" is from an unidentified developer. To open it,
**Control-click** (or right-click) the app and choose **Open**, then confirm in
the dialog. Alternatively, remove the quarantine attribute from a terminal:

```sh
xattr -dr com.apple.quarantine "/Applications/LarpCode macOS.app"
```

Only do this for files downloaded from the official release feed. See
`INSTALL.md` for the full first-launch instructions.

## `larpcode` — POSIX CLI shim

`larpcode` is a `#!/bin/sh` shim that runs the bundled CLI and forwards every
argument (`exec "$CLI" "$@"`), so both of these work:

```sh
larpcode /path/to/project
larpcode --help
```

Run with no arguments to open the TUI in the current directory. It exports the
same four XDG variables as `LarpCode.command`, creates those directories, and
then resolves the CLI relative to the shim's own location:

1. `$APP_ROOT/desktop-pkg/resources/opencode-cli` — the CLI bundled with the
   desktop install.
2. `$APP_ROOT/larpcode` — a standalone CLI binary, used when the bundled one is
   not executable.

If neither is executable, it prints both paths to stderr and exits 1.

### Putting `larpcode` on `PATH`

Add the directory that contains the shim (the install root's `shortcuts/`
folder) to your `PATH` in your shell config, then open a new terminal. For
`zsh`, the macOS default, add a line like this to `~/.zshrc`:

```sh
export PATH="/absolute/path/to/LarpCode/shortcuts:$PATH"
```

Use the real absolute path where the installed `shortcuts/` folder lives, and
keep the shim executable (`chmod +x`). Run `larpcode --help` in a new terminal
to confirm it resolves.

A CLI-only install does not use this shim. `install-cli.sh` downloads the
architecture-specific standalone `larpcode` binary and installs it to
`$HOME/.larpcode/bin`; that folder goes on `PATH` instead:

```sh
export PATH="$HOME/.larpcode/bin:$PATH"
```

Both routes expose the same `larpcode` command. The desktop app, this shim, and
the CLI-only binary all read the same XDG data/config/cache/state locations, so
they share sessions and settings and do not touch an OpenCode profile on the
same machine.

## Windows launchers → macOS replacements

| Windows launcher (`shortcuts/`) | macOS replacement | Role |
| --- | --- | --- |
| `LarpCode.bat` | `LarpCode.command` | Starts the installed desktop app from the install root. |
| `LarpCode.vbs` | `LarpCode.command` | Direct launch of the desktop app (Start Menu / desktop shortcut equivalent). |
| `larpcode.cmd` | `larpcode` (POSIX `sh` shim) | Runs the bundled CLI with the same flags and XDG env. |
| `larpcode.cmd` (CLI-only) | standalone `larpcode` in `$HOME/.larpcode/bin` | Installed by `install-cli.sh`. |

## Legacy Windows launchers

`LarpCode.bat`, `LarpCode.vbs`, and `larpcode.cmd` remain in this folder only as
**legacy reference** for the upstream Windows installer (`installer/LarpCode-Setup.iss`
and `script/stage-installer.ts`, which stages the whole `shortcuts/` folder).
They are Windows-specific and are **not shipped in macOS builds**: DMG/ZIP
bundles use `LarpCode.command` and the POSIX `larpcode` shim instead. Do not
wire the `.bat`/`.vbs`/`.cmd` files into the macOS delivery layer.
