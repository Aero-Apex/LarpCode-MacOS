# LarpCode macOS — Troubleshooting

Practical fixes for common problems with LarpCode macOS v1 on macOS 13 (Ventura) or later.
Every download must come from the official
[Releases page](https://github.com/Aero-Apex/LarpCode-MacOS/releases/latest); do not bypass
Gatekeeper for a copy obtained anywhere else.

> **v1 is unsigned and not notarized.** macOS may warn that the app is from an unidentified
> developer or that it is "damaged and can't be opened". The steps below are the supported
> workarounds for that warning. A future release may be signed and notarized; the workflow already
> contains environment-gated signing/notarization hooks and hardened-runtime entitlements, but
> v1 binaries do not use them.

Two conventions matter throughout this guide:

- The app name contains a space. **Quote every path containing `LarpCode macOS`.**
- Commands use `$HOME` so they work for any user. If you paste a path with spaces, wrap it in
  double quotes.

For installation steps, see [INSTALL.md](../INSTALL.md); for the CLI, see
[macos-cli.md](./macos-cli.md); for the launchers, see
[shortcuts/README.md](../shortcuts/README.md).

## "LarpCode macOS is damaged and can't be opened" / Gatekeeper

Because the v1 app is unsigned, macOS may refuse to launch it the first time. There are two
supported ways past this.

### Option A — open from Finder (recommended)

1. Open **Applications** in Finder.
2. **Control-click** (or right-click) **LarpCode macOS.app** and choose **Open**.
3. In the dialog that appears, choose **Open** again.

macOS remembers this approval. If a fresh copy is blocked again after an upgrade, repeat the
steps.

### Option B — remove quarantine from the terminal

Downloads from a browser get a `com.apple.quarantine` extended attribute. Remove it from the
app bundle:

```sh
xattr -dr com.apple.quarantine "/Applications/LarpCode macOS.app"
```

Then launch **LarpCode macOS** from **Applications** normally.

To check whether the attribute is present:

```sh
xattr -l "/Applications/LarpCode macOS.app"
```

If the app lives somewhere other than `/Applications`, use its real path and keep it quoted:

```sh
xattr -dr com.apple.quarantine "$HOME/Downloads/LarpCode macOS.app"
```

The ZIP alternative is quarantined in the same way; apply the same fix to the `.app` you
extracted. For a manually downloaded CLI binary, see
[quarantine and permission errors on the CLI](#quarantine-and-permission-errors-on-the-cli).

## Quarantine and permission errors on the CLI

When macOS says `larpcode` "can't be opened because it is from an unidentified developer", the
binary is quarantined (and may also lack the executable bit).

`install-cli.sh` removes quarantine and sets the executable bit automatically. If you downloaded
the `larpcode` binary manually, do both yourself:

```sh
chmod +x "$HOME/.larpcode/bin/larpcode"
xattr -dr com.apple.quarantine "$HOME/.larpcode/bin/larpcode"
```

Use the path to the binary you actually installed, including a custom `--dir` directory.

## Permission prompts (Documents, Desktop, Downloads, microphone)

The desktop app declares why it needs these locations, so macOS asks the first time it touches
them:

- **Documents, Desktop, Downloads** (and external network/removable volumes) — for projects you
  open and commands you run there. The CLI server and its terminals run as children of the app,
  so macOS asks for their access in the app's name.
- **Microphone** — for voice input.

Allow access for folders you actually use with LarpCode. You can review or change these later in
**System Settings → Privacy & Security**:

- **Files and Folders** (and the Documents/Desktop/Downloads entries) for folder access.
- **Microphone** for voice input.

If you denied a prompt by mistake, re-open the relevant project or voice input and allow it, or
toggle the entry back on in **Privacy & Security**. Commands that only work inside one protected
folder usually mean that folder's access is still denied.

## Terminal needs Full Disk Access

The `LarpCode.command` launcher and the `larpcode` shim are shell scripts, and the terminal that
starts them can be blocked from reading protected locations even when the app itself is allowed.
If folder prompts do not help, grant the terminal app Full Disk Access:

1. Open **System Settings → Privacy & Security → Full Disk Access**.
2. Add the terminal app you use (for example **Terminal** or **iTerm**), using the `+` button and
   selecting it from **Applications**.
3. Quit and reopen that terminal, then start LarpCode again.

Only grant this to the terminal you actually use for LarpCode.

## `larpcode: command not found`

The command is not on your shell's `PATH`, or the shell has not reloaded since you edited its
config.

1. Find out which route you installed:
   - CLI only: the binary is at `$HOME/.larpcode/bin/larpcode`.
   - Desktop app: the POSIX shim is in the install root's `shortcuts/` folder; put **that folder**
     on `PATH`, not the app bundle.

2. Add the right directory in your shell config. For `zsh` (the macOS default), edit `~/.zshrc`:

   ```sh
   export PATH="$HOME/.larpcode/bin:$PATH"
   ```

   For the desktop shim, use the real absolute path to the installed `shortcuts/` folder:

   ```sh
   export PATH="/absolute/path/to/LarpCode/shortcuts:$PATH"
   ```

3. Reload and confirm:

   ```sh
   source ~/.zshrc
   command -v larpcode
   ```

`command -v larpcode` must print a path. Open a new terminal if you edited a login shell file
such as `~/.zprofile` or `~/.bash_profile`. If the install used a custom `--dir`, add that
directory instead.

## `larpcode: Permission denied`

The PATH lookup found the file, but it is not executable, or it is quarantined.

```sh
ls -l "$HOME/.larpcode/bin/larpcode"
chmod +x "$HOME/.larpcode/bin/larpcode"
```

For the desktop launchers, restore the executable bit on both the `.command` file and the app's
inner binary if a copy or extraction lost them:

```sh
chmod +x "path/to/shortcuts/LarpCode.command"
chmod +x "/Applications/LarpCode macOS.app/Contents/MacOS/LarpCode macOS"
```

If `ls -l` shows the wrong architecture or a directory where a binary should be, reinstall;
see [Rosetta / architecture mismatch](#rosetta--architecture-mismatch). If a quarantine refusal
remains after `chmod +x`, run the `xattr -dr com.apple.quarantine ...` command above for that path.

## Rosetta / architecture mismatch

`larpcode` and the desktop app are architecture-specific (`arm64` for Apple Silicon, `x64` for
Intel). A mismatch shows up as "bad CPU type in executable", a refusal to launch, or an
unexpected Rosetta prompt.

Check what your terminal reports:

```sh
uname -m
```

- `arm64` → Apple Silicon. Use `LarpCode-macOS-arm64.dmg` or the universal DMG.
- `x86_64` → either an Intel Mac, or an Apple Silicon shell running under Rosetta. On Apple
  Silicon, check for translation:

  ```sh
  sysctl -n sysctl.proc_translated
  ```

  `1` means this terminal is translated. Open a native terminal (in Finder, select the terminal
  app, **Get Info**, and make sure **Open using Rosetta** is unchecked) and check `uname -m`
  again before choosing a binary.

Prefer a native build over Rosetta. If you installed the wrong per-architecture CLI binary,
re-run `install-cli.sh` in a native shell — it detects `uname -m` and downloads the matching
`darwin-arm64` or `darwin-x64` asset. If you manually downloaded a suffixed binary, replace it
with the one matching your Mac.

## Which DMG should I use?

`LarpCode-macOS-universal.dmg` is the primary desktop install and works on both Apple Silicon
and Intel. It is the safest choice if you are unsure, share the file between Macs, or your
terminal is running under Rosetta.

Per-architecture DMGs are also published if you prefer a smaller download:

- `LarpCode-macOS-arm64.dmg` — Apple Silicon (`uname -m` prints `arm64`).
- `LarpCode-macOS-x64.dmg` — Intel (`uname -m` prints `x86_64` and `sysctl -n sysctl.proc_translated`
  is not `1`).

There is also `LarpCode-macOS-universal.zip` if you cannot mount a DMG. After dragging the app to
**Applications**, apply the [Gatekeeper steps](#larpcode-macos-is-damaged-and-cant-be-opened--gatekeeper)
with the app's quoted path.

## Where app data lives

The macOS launchers export these XDG variables, so LarpCode's state stays out of a generic
OpenCode profile:

```sh
XDG_DATA_HOME="$HOME/Library/Application Support/LarpCode macOS/xdg/data"
XDG_CONFIG_HOME="$HOME/Library/Application Support/LarpCode macOS/xdg/config"
XDG_CACHE_HOME="$HOME/Library/Caches/LarpCode macOS/xdg/cache"
XDG_STATE_HOME="$HOME/Library/Application Support/LarpCode macOS/xdg/state"
```

Every `Application Support` path must be quoted because the app name contains a space. Use them
to inspect or back up data, for example:

```sh
ls -la "$HOME/Library/Application Support/LarpCode macOS/xdg/data"
```

If you run the raw standalone `larpcode` binary directly — it does not export the launchers'
XDG variables — the upstream XDG defaults apply under `~/.local/share`, `~/.config`, `~/.cache`,
and `~/.local/state` instead. Launching through `LarpCode.command` or the `larpcode` shim keeps
everything in the LarpCode locations above.

## Where logs are

- **Desktop app debug logs:** written to a `logs` folder under the app's user data directory,
  with a timestamped subfolder for each run. Use the app menu **Export Logs…** (or the **Export
  Logs** button in the recovery dialog) to collect them into one archive. The archive's
  `manifest.json` lists the exact `userData`, `logs`, current run, crash dumps, and server log
  roots, so it is the most reliable way to see where everything is on your machine.
- **CLI / server logs:** under the XDG data directory, in `opencode/log/`. With the launchers'
  variables set, that is:

  ```sh
  "$HOME/Library/Application Support/LarpCode macOS/xdg/data/opencode/log"
  ```

  The LarpCode diagnostic log there is named `larpcode-diag.log`; Tor bootstrap output, when Tor
  is configured, is written to `tor-stdout.log` and `tor-stderr.log` in the same data directory.
  Running the raw standalone binary without the XDG variables uses `~/.local/share/opencode/log`
  instead.

To confirm which paths your CLI resolves, run `larpcode settings` — it reports resolved settings,
paths, and environment. `larpcode doctor` reports the status of the server, database, and
optional helpers.

## Reset flow

`larpcode reset` resets local state, shallow by default:

```sh
larpcode reset       # reset local usage counters only
larpcode reset --deep       # also clear sessions and rotate the network fingerprint
larpcode reset --nuke-credentials    # delete stored provider credentials too (implies --deep)
```

Use the shallow form when you only want fresh usage counters. `--deep` clears sessions and rotates
the network fingerprint; `--nuke-credentials` additionally removes stored provider credentials
and implies `--deep`. Neither form is undone by reinstalling the app; back up anything you want
to keep first.

## When nothing else works — clean reinstall

1. Verify the download against `SHA256SUMS` (or let `install-cli.sh` verify against `cli.json`):

   ```sh
   shasum -a 256 -c SHA256SUMS
   ```

2. Quit LarpCode, then remove the app and its data. **This deletes local sessions and settings.**
   Back up first:

   ```sh
   rm -rf "/Applications/LarpCode macOS.app"
   rm -rf "$HOME/Library/Application Support/LarpCode macOS" "$HOME/Library/Caches/LarpCode macOS"
   ```

3. For the CLI only, remove its install directory and the `PATH` line you added, then open a new
   terminal:

   ```sh
   rm -rf "$HOME/.larpcode"
   ```

4. Reinstall from the [latest release](https://github.com/Aero-Apex/LarpCode-MacOS/releases/latest)
   and repeat the [Gatekeeper steps](#larpcode-macos-is-damaged-and-cant-be-opened--gatekeeper).

For architecture-related failures, reinstall with the [correct DMG](#which-dmg-should-i-use) or
native CLI binary rather than re-running the same one.

## Unsigned / not-notarized caveat

Right-click → Open and `xattr -dr com.apple.quarantine` are workarounds for a build that Apple has
not signed or notarized. They tell macOS to trust this one downloaded copy; they do not make the
binary signed, and macOS may ask again for a new copy or after an upgrade. Only apply them to
files downloaded from the official release feed, and keep checksum verification enabled. If a
future release is signed and notarized, these workarounds should no longer be necessary.
