# Installing LarpCode on macOS

This guide covers installing LarpCode macOS (v1) on a Mac. LarpCode comes in two
shapes. Choose one:

- **Desktop app** — the graphical app plus the bundled `larpcode` terminal command.
- **CLI only** — the terminal UI and the `larpcode` command, without the desktop app.

Both use the same LarpCode sessions, settings, and providers.

All downloads come from the [Releases page](https://github.com/Aero-Apex/LarpCode-MacOS/releases)
at `https://github.com/Aero-Apex/LarpCode-MacOS/releases/latest/download/`.
Only install files downloaded from that page.

> **v1 is unsigned and not notarized.** macOS Gatekeeper will warn that the app
> is from an unidentified developer. The workarounds below are documented. Do not
> bypass Gatekeeper for files obtained from anywhere else.

## Requirements

- macOS 13 (Ventura) or newer
- Apple Silicon (`arm64`) or Intel (`x64`)
- About 500 MB of free disk space for the app and its data

## Install the desktop app (DMG)

The universal DMG works on both Apple Silicon and Intel Macs. Per-architecture
DMGs are also published if you prefer a smaller download.

1. Open the [latest release](https://github.com/Aero-Apex/LarpCode-MacOS/releases/latest)
   and download `LarpCode-macOS-universal.dmg` (or `LarpCode-macOS-arm64.dmg` on
   Apple Silicon / `LarpCode-macOS-x64.dmg` on Intel).
2. Open the downloaded DMG in Finder (double-click it).
3. In the DMG window, drag **LarpCode macOS.app** onto the **Applications**
   shortcut shown in the same window.
4. Eject the DMG (click the eject badge next to its name in the Finder sidebar,
   or drag its icon to the Trash).
5. Open **Applications** in Finder and launch **LarpCode macOS**.

The app also installs the `larpcode` terminal command. If you only need the
command line, see [Install the CLI only](#install-the-cli-only).

### First launch and Gatekeeper

Because v1 is unsigned, macOS may report that "LarpCode macOS" cannot be opened
because it is from an unidentified developer. To open it:

1. In **Applications**, **Control-click** (or right-click) **LarpCode macOS.app**
   and choose **Open**.
2. In the dialog that appears, choose **Open** again.

The app is now allowed to launch. If you copied the app from somewhere else, or
it stops opening after an upgrade, repeat these steps.

Alternatively, remove the quarantine attribute from a terminal before launching:

```sh
xattr -dr com.apple.quarantine /Applications/LarpCode\ macOS.app
```

Then open **LarpCode macOS** normally from **Applications**. Note the escaped
space in `LarpCode\ macOS.app`; use a quoted path instead if you prefer:

```sh
xattr -dr com.apple.quarantine "/Applications/LarpCode macOS.app"
```

### ZIP alternative

If you cannot mount a DMG, download `LarpCode-macOS-universal.zip` from the same
[latest release](https://github.com/Aero-Apex/LarpCode-MacOS/releases/latest):

1. Double-click the ZIP in Finder to expand it. This produces **LarpCode macOS.app**.
2. Drag **LarpCode macOS.app** into **Applications**.
3. Follow [First launch and Gatekeeper](#first-launch-and-gatekeeper) above.

ZIP downloads are quarantined just like DMGs, so the Gatekeeper steps apply.

## Verify your download

The release publishes `SHA256SUMS` with checksums for the binary assets. To
verify a download, put the asset and `SHA256SUMS` in the same folder and run,
from that folder:

```sh
shasum -a 256 -c SHA256SUMS
```

Each line should end in `OK`. Keep the downloaded filename exactly as published
(for example, `LarpCode-macOS-universal.dmg`) so it matches `SHA256SUMS`.

For the CLI, `install-cli.sh` performs its own checksum check against `cli.json`
as described below; a separate `SHA256SUMS` check is optional.

## Install the CLI only

Open Terminal and run:

```sh
curl -fsSL https://github.com/Aero-Apex/LarpCode-MacOS/releases/latest/download/install-cli.sh | bash
```

You can also download `install-cli.sh` from the
[latest release](https://github.com/Aero-Apex/LarpCode-MacOS/releases/latest),
review it, and run it locally with `bash install-cli.sh`.

The script:

1. Detects your Mac's architecture and downloads the matching standalone
   `larpcode` binary (Apple Silicon uses `arm64`, Intel uses `x64`).
2. Verifies the binary's SHA-256 checksum against the release's `cli.json`
   manifest and aborts if it does not match.
3. Installs the binary to `~/.larpcode/bin` (`$HOME/.larpcode/bin`).
4. Prints instructions for adding `~/.larpcode/bin` to your `PATH`.

Follow the printed PATH instructions. Typically, for `zsh` (the macOS default),
add this line to `~/.zshrc`:

```sh
export PATH="$HOME/.larpcode/bin:$PATH"
```

Open a new terminal, then run `larpcode --help` or just `larpcode` to start the
TUI in the current folder. You can also download the correct `larpcode` binary
manually and place it in any folder already on your `PATH`.

## Upgrade

- **Desktop app:** download the newer DMG and drag **LarpCode macOS.app** over
  the existing copy in **Applications** to replace it (or delete the old app
  first). Your sessions and settings are stored outside the app bundle, so they
  are preserved. If Gatekeeper blocks the new copy, repeat
  [First launch and Gatekeeper](#first-launch-and-gatekeeper).
- **CLI:** run the `install-cli.sh` command again. It overwrites
  `~/.larpcode/bin/larpcode` with the latest verified binary. Keep your existing
  `PATH` entry.

The in-app updater reads `update.json` from the same release feed. Do not point
it at the Windows `LarpCode-Setup.exe` asset.

## Uninstall

### Desktop app

1. Quit **LarpCode macOS** if it is running.
2. Delete **LarpCode macOS.app** from **Applications** (drag it to the Trash).
3. Delete the app's data directories. In Finder, use **Go → Go to Folder**
   (`Command-Shift-G`) and enter each path, then move it to the Trash:

   - `~/Library/Application Support/LarpCode macOS` — sessions, config, state,
     and the `xdg/data`, `xdg/config`, and `xdg/state` folders.
   - `~/Library/Caches/LarpCode macOS` — cached data (`xdg/cache`).

   These paths contain a space, so quote them in a terminal:

   ```sh
   rm -rf "$HOME/Library/Application Support/LarpCode macOS" "$HOME/Library/Caches/LarpCode macOS"
   ```

   Removing these directories deletes local sessions and settings. Back up
   anything you want to keep first.

### CLI

Delete the CLI installation directory:

```sh
rm -rf "$HOME/.larpcode"
```

Then remove the `export PATH="$HOME/.larpcode/bin:$PATH"` line you added to
`~/.zshrc` (or other shell config) and open a new terminal.
