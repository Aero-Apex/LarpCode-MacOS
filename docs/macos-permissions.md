# macOS permissions (TCC)

macOS protects the microphone and certain file locations through **Transparency, Consent, and
Control (TCC)**. The first time an app tries to use one of them, macOS asks you to approve it and
remembers your answer. LarpCode does not grant itself these permissions, and clicking through the
Gatekeeper warning for the unsigned v1 build is a separate step that does **not** grant TCC access.
See the [README](../README.md) for opening the unsigned app.

These settings apply per macOS user account. LarpCode requires macOS 13 (Ventura) or later.

## What LarpCode requests

The app's `Info.plist` carries a purpose string for each protected resource it may use. The string
is what macOS prints in the permission dialog. The desktop build sets these keys through
`mac.extendInfo` in `packages/desktop/electron-builder.config.ts`, using the English source strings
from `packages/app/src/runtime/i18n/desktop-native.ts`:

| Protected resource | Exact `Info.plist` key | Purpose string shown in the dialog |
| --- | --- | --- |
| Microphone (voice input / voice calls) | `NSMicrophoneUsageDescription` | "LarpCode uses your microphone for voice calls." |
| Documents folder | `NSDocumentsFolderUsageDescription` | "LarpCode uses files in your Documents folder for projects you open and commands you run there." |
| Desktop folder | `NSDesktopFolderUsageDescription` | "LarpCode uses files on your Desktop for projects you open and commands you run there." |
| Downloads folder | `NSDownloadsFolderUsageDescription` | "LarpCode uses files in your Downloads folder for projects you open and commands you run there." |
| Network volumes (mounted network shares) | `NSNetworkVolumesUsageDescription` | "LarpCode uses files on network volumes for projects you open and commands you run there." |
| Removable volumes (external/USB disks) | `NSRemovableVolumesUsageDescription` | "LarpCode uses files on removable volumes for projects you open and commands you run there." |

The five file/folder keys cover the file tools and the bundled `larpcode` CLI when they are used
from the desktop app — for example opening a project in `~/Documents`, or running a command in a
project on an external drive. Each location is a separate TCC decision, so allowing Documents does
not also allow a network share or a USB disk. Files outside those five locations are generally not
gated by these prompts; see [Full Disk Access](#full-disk-access-for-terminal-workflows) for the
broader case.

## Why the prompt names LarpCode

The desktop app runs the CLI server and its terminals as child processes of the app bundle. macOS
attributes their protected-resource access to the **responsible process**, which is the LarpCode
app, so the dialog names LarpCode (it may appear as "LarpCode macOS" depending on the build and
channel) and displays the purpose string from LarpCode's `Info.plist` — even when the code making
the request is the bundled CLI. This is intentional and is why all six keys live in the desktop
bundle's configuration.

With the CLI-only install there is no LarpCode app bundle responsible for the process: `larpcode`
runs inside your terminal, so macOS attributes those accesses to the terminal app instead. That is
why the terminal, rather than LarpCode, is the app you may need to authorize for terminal workflows.

## Grant or revoke access in System Settings

1. Open **System Settings** from the Apple menu.
2. Select **Privacy & Security** in the sidebar (scroll down if needed).
3. Open the relevant category:
   - **Microphone** for voice input.
   - **Files & Folders** for the five locations. Inside it, select the individual entry for
     **Documents Folder**, **Desktop Folder**, **Downloads Folder**, **Network Volumes**, or
     **Removable Volumes**.
   - **Full Disk Access** for the broader terminal/workflow access described below.
4. Find **LarpCode** (or the terminal app for a CLI-only install) and turn its switch on. If it is
   not listed, click the **+** button and select the app from Applications, or drag the app bundle
   from Finder into the list; you may be asked to authenticate.
5. Quit and reopen LarpCode so the new grant takes effect.

To **revoke** access, turn the same switch off, or select the entry and click the **−** button.
Revoking does not delete any files; the app will simply be denied the next time it tries to access
that location, and may show an error until access is restored or the app is restarted. Removing an
entry from the list and re-adding it is also a way to reset a single decision.

## Full Disk Access for terminal workflows

Full Disk Access is a separate, much broader TCC category. It is not requested by a purpose string
and has no automatic prompt: you add the app manually under **System Settings > Privacy & Security >
Full Disk Access**. It covers protected locations outside the five file/folder categories, such as
other apps' containers and system data.

- **Desktop app:** its own file/folders grants are normally sufficient. Grant Full Disk Access to
  **LarpCode** only if a workflow needs to read protected data outside those five locations.
- **CLI-only install:** `larpcode` runs inside Terminal, iTerm, or another terminal emulator, so
  macOS sees the terminal as the requesting app. Grant Full Disk Access to that **terminal app** —
  not to LarpCode — when a CLI workflow needs broader protected-file access. Be aware this applies
  to everything else you run in that terminal too.

Use the narrowest grant that works; do not enable Full Disk Access just to open a project in
Documents or on an external disk.

## Troubleshooting a denied prompt

- **You clicked "Don't Allow".** macOS remembers a denial and will not ask again. Enable the
  switch in the matching System Settings category, then quit and relaunch LarpCode.
- **A location still fails after granting access.** Check the specific sub-entry under
  **Files & Folders**: an external disk needs **Removable Volumes**, a mounted share needs
  **Network Volumes**, and a folder in the home directory needs its own matching entry. Fully quit
  the app (Cmd-Q), not just the window, and reopen it.
- **The wrong app is listed.** Dev, beta, and production builds, or a second copy of the app left in
  Downloads, are separate apps with separate TCC entries. Enable the one you actually launched, or
  remove the stale ones with the **−** button.
- **The CLI is denied in a terminal.** The grant belongs to the terminal app, not to LarpCode, for
  the reasons above. Check the terminal's entries under Files & Folders / Full Disk Access.
- **Nothing appears in the list.** Launch the app and trigger the feature again (start a voice
  input, open a project in that folder) so macOS registers the request, then recheck System Settings.
- **Last resort — reset the decision so the prompt appears again.** In Terminal, `tccutil reset`
  takes a service name and an optional bundle ID. Apple's documented service names for the keys
  above are `Microphone`, `SystemPolicyDocumentsFolder`, `SystemPolicyDesktopFolder`,
  `SystemPolicyDownloadsFolder`, `SystemPolicyNetworkVolumes`, `SystemPolicyRemovableVolumes`, and
  `SystemPolicyAllFiles` (Full Disk Access). For example:

  ```bash
  tccutil reset SystemPolicyDocumentsFolder <bundle-id>
  tccutil reset Microphone <bundle-id>
  ```

  Omitting `<bundle-id>` resets that permission for **every** app, and `tccutil reset All` resets
  all TCC decisions; use those forms only if you intend that. The next access attempt shows the
  prompt again. `man tccutil` has the full syntax; the command affects the current user unless run
  with `sudo`.

If a prompt never appears even after these steps, verify you are running a build that includes the
usage keys (they are added at packaging time, so a locally built or modified binary can differ) and
that you changed the setting for the same macOS user account that runs the app.
