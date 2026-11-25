# macOS documentation

Index of the documentation written for the **macOS edition** of LarpCode. These
guides cover only the macOS delivery layer: installing, updating, permissions,
security, and using the `larpcode` command on a Mac. All names, versions, and
behaviour follow [`PORT_SPEC.md`](../PORT_SPEC.md), the single source of truth
for this edition.

## Guides

- [INSTALL.md](../INSTALL.md) — Desktop (DMG/ZIP) and CLI-only installation, download verification, upgrade, and uninstall.
- [MACOS.md](../MACOS.md) — macOS-specific notes on permissions, Gatekeeper, and launching unsigned v1 builds.
- [RELEASE.md](../RELEASE.md) — Maintainer runbook for tagging, building, verifying, and publishing macOS release assets.
- [macos-troubleshooting.md](./macos-troubleshooting.md) — Fixes for common macOS issues such as Gatekeeper/quarantine blocks and launch failures.
- [macos-faq.md](./macos-faq.md) — Frequently asked questions about the macOS edition, answered from `PORT_SPEC.md`.
- [macos-permissions.md](./macos-permissions.md) — macOS permission prompts and the folders or features that may trigger them.
- [macos-updates.md](./macos-updates.md) — How in-app and `larpcode upgrade` updates work via the `update.json` release feed.
- [macos-cli.md](./macos-cli.md) — Installing, configuring, and using the standalone `larpcode` command on macOS.
- [macos-security.md](./macos-security.md) — v1 signing/notarization status, quarantine removal, and the optional signing hooks.
- [macos-keyboard.md](./macos-keyboard.md) — Keyboard shortcuts and key mappings for LarpCode on macOS.

## General feature documentation

General feature docs — sessions, tools, providers, plugins, configuration, and
the TUI — come from upstream [OpenCode](https://github.com/anomalyco/opencode).
This port keeps the application source intact (including the AI/TUI/UI engine),
so those upstream docs apply unchanged. The guides above document only the
macOS-specific delivery layer, not general product features.
