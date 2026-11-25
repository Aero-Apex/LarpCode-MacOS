# Keyboard and mouse on macOS

LarpCode macOS follows standard macOS conventions. Where Windows/Linux instructions say **Ctrl**, use **Command (⌘)** on macOS; **Alt** corresponds to **Option (⌥)**. Internally the app uses a `mod` modifier that resolves to ⌘ on macOS and Ctrl on Windows/Linux (`packages/app/src/shell/commands/command.tsx`), so a shortcut written `mod+…` in the source is `⌘…` here.

Mouse: normal macOS pointer behavior applies — click to focus, right-click (or Control-click) for context menus, for example on side-panel tabs. No macOS-specific mouse remapping was found in this repo.

## Open Settings

Press **⌘,** (Command-comma). This is the `settings.open` command, bound to `mod+comma` in `packages/app/src/settings/command.tsx`. Settings can also be found from the command palette and the app's home screen.

## Focus the composer

The prompt composer takes focus automatically when a session opens, and focus returns to it after many dialogs close; click the composer to focus it manually. A dedicated "focus composer" keyboard shortcut could not be verified from this repo, so none is listed here — check the in-app keybind editor below for the current binding.

## Copy and paste

Use the standard macOS editing shortcuts **⌘C** and **⌘V** in the composer and other text fields. The desktop composer relies on native editing; no app-specific copy/paste override was found in the repo. Ctrl-based copy/paste bindings in the upstream keybind reference belong to the terminal TUI, not to desktop text fields.

## Closing windows and tabs with ⌘W

**⌘W** is the close shortcut on macOS (`mod+w`). In the desktop app it closes the tab under focus, including side-panel tabs; **⇧⌘W** is reserved for closing the window and **⌥⌘W** closes the session tab. These behaviors are recorded in this repo's `CHANGELOG.md`; the in-app keybind editor is authoritative for your version.

## Full keybind list

- **In the app:** Settings › Shortcuts ("Keyboard shortcuts") is the built-in keybind editor. There you can search bindings, press keys to rebind, unbind, or reset to defaults.
- **Upstream CLI/TUI reference:** <https://opencode.ai/docs/cli/keybinds> (linked from `packages/core/src/plugin/skill/opencode.md`).
- **macOS-specific changes:** this repo's `CHANGELOG.md`.

This page does not reproduce an exhaustive desktop keybind table: not every app binding could be verified from the repository, and bindings are user-configurable, so treat the in-app editor as the source of truth.
