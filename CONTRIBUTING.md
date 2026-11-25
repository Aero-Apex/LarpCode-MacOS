# Contributing to LarpCode (macOS)

This is the macOS edition of LarpCode. It keeps the OpenCode-based application
source intact and replaces the Windows delivery layer with a macOS one (DMG/ZIP
via `electron-builder`, the `larpcode` CLI plus `install-cli.sh`, and
`.command`/POSIX launchers). Read [PORT_SPEC.md](./PORT_SPEC.md) before starting:
it is the source of truth for what this port covers.

The changes most likely to be accepted are:

- Bug fixes
- Additional LSPs and formatters
- LLM performance improvements
- Environment-specific fixes
- Missing standard behavior
- Documentation improvements

UI and core product features require design review before implementation. If you are unsure whether a change fits, ask a maintainer or choose an issue labeled [`help wanted`](https://github.com/Aero-Apex/LarpCode-MacOS/issues?q=is%3Aissue%20state%3Aopen%20label%3Ahelp-wanted), [`good first issue`](https://github.com/Aero-Apex/LarpCode-MacOS/issues?q=is%3Aissue%20state%3Aopen%20label%3A%22good%20first%20issue%22), [`bug`](https://github.com/Aero-Apex/LarpCode-MacOS/issues?q=is%3Aissue%20state%3Aopen%20label%3Abug), or [`perf`](https://github.com/Aero-Apex/LarpCode-MacOS/issues?q=is%3Aopen%20is%3Aissue%20label%3A%22perf%22).

Want to take on an issue? Leave a comment and a maintainer may assign it unless it is already being worked on.

> [!NOTE]
> PRs that ignore these guardrails will likely be closed.

## Adding Providers

New providers should rarely require LarpCode changes. Add the provider to [models.dev](https://github.com/anomalyco/models.dev) first.

## Development

### Platform requirements

The desktop app only builds and runs on **macOS 13 (Ventura) or newer**, on
Apple Silicon (`arm64`) or Intel (`x64`). If you are on Linux or Windows you can
still work on the CLI, shared packages, and documentation, but you cannot run
`bun run dev:desktop` or verify the macOS launchers locally. Ask a maintainer if
you need a macOS machine for a desktop-only change.

This repo requires the Bun version in the `packageManager` field of
[`package.json`](./package.json) — currently **Bun 1.4.4** — or newer. From the
repository root:

```bash
bun install
bun dev [directory]
```

`bun dev` runs the CLI and TUI. Pass a directory to open another project, or `.` to open this repository.

To test a development TUI against your installed LarpCode background service and live sessions:

```bash
bun run dev:live [directory]
```

For web development, run the backend and app in separate terminals. Other interfaces have root scripts:

```bash
bun dev serve --port 4096
bun run dev:web
bun run dev:desktop # macOS 13+ only
bun run dev:site
```

Local builds are unsigned and not notarized. If Gatekeeper blocks one, open it
with right-click → Open, or clear the quarantine attribute with
`xattr -dr com.apple.quarantine <path>`.

### Packages

- `packages/schema`: shared wire and storage contracts
- `packages/core`: domain behavior and persistence
- `packages/protocol`: public API definitions
- `packages/server`: HTTP server and runtime composition
- `packages/client`: generated TypeScript clients
- `packages/cli`: command-line entrypoint and service lifecycle
- `packages/tui`: terminal interface
- `packages/app`: shared web interface
- `packages/desktop`: Electron desktop application
- `packages/plugin`: plugin API

### Verification

Run the full typecheck from the repository root:

```bash
bun run typecheck
```

Tests, and typechecks where defined, can also be run from the affected package
rather than the repository root:

```bash
cd packages/core
bun run test
bun typecheck
```

Follow package-specific instructions in nearby `AGENTS.md` files. After changing the public Protocol or Server `HttpApi`, run `bun run generate` from `packages/client`; never edit generated client files directly.

#### macOS launchers

The launchers in `shortcuts/` (`LarpCode.command` for the desktop app and
`larpcode` for the POSIX CLI shim) and the CLI installer are plain shell
scripts. Syntax-check any shell script you touch before opening a PR:

```bash
bash -n shortcuts/LarpCode.command shortcuts/larpcode
```

If you change `install-cli.sh`, include it in the same check. The app name
contains a space, so keep every `"$HOME/Library/Application Support/LarpCode macOS/..."`
path quoted.

#### Release scripts

The release scripts live in `script/`. Preview the generated release notes
without triggering a release:

```bash
bun run script/release.ts --print
```

`script/release-assets.ts` assembles `dist/release/` and reads back the
generated `update.json`, `cli.json`, and `SHA256SUMS` to verify them. Run it
locally when you change macOS asset names or manifests; it needs the built DMG,
ZIP, and CLI artifacts:

```bash
bun run script/release-assets.ts
```

When editing the release workflow, keep the signing/notarization hooks optional:
the absence of macOS signing secrets must not fail a build (see
[PORT_SPEC.md](./PORT_SPEC.md)).

Follow the repository [style guide](./AGENTS.md).

## Pull Requests

### Link Issues When Required

Bug fixes, chores, and tests must reference an existing issue. Documentation, refactor, and feature PRs are exempt from the automated linked-issue check. When required, use `Fixes #123` or `Closes #123` in the PR description.

Before implementing new functionality, open a feature request describing the problem, why it belongs in LarpCode macOS, and your proposed approach if you have one. Wait for design approval before opening the implementation PR.

Open pull requests against [`Aero-Apex/LarpCode-MacOS`](https://github.com/Aero-Apex/LarpCode-MacOS), base them on `dev`, and complete the provided pull request template. Do not send macOS changes to the Windows upstream.

### Keep It Focused

- Keep PRs small and focused.
- Explain the problem and why the change fixes it.
- Check whether the functionality already exists.
- For UI changes, include before-and-after screenshots or video.
- For logic changes, explain what you tested and how a reviewer can verify it.

### Keep It Brief

Long, AI-generated PR descriptions and issues may be ignored. Write a short explanation in your own words. If the change cannot be explained briefly, the PR may be too large.

### Use Conventional Titles

Use `type(scope): summary`. Supported types are `feat`, `fix`, `docs`, `chore`, `refactor`, and `test`. The scope is optional.

Examples:

- `docs: update contributing guide`
- `fix(tui): restore scroll position`
- `feat(app): add workspace search`

## Issues

Bug reports and feature requests must use their issue templates. Blank issues are not allowed; ask support and how-to questions in the [Discord community](https://discord.gg/opencode).

Automated checks flag missing templates, placeholder text, AI-generated walls of text, and missing meaningful content. You have two hours to correct a flagged issue before it closes automatically. Ask a maintainer if an issue was flagged incorrectly.
