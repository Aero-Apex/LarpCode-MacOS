// LarpCode: locate the bundled CLI on disk.
//
// Lives in its own module because desktop-cli.ts and the sidecar probe spawn
// the binary to run the backend.

import { app } from "electron"
import { existsSync } from "node:fs"
import path from "node:path"

/** CLI file names to try, in priority order. Windows keeps its upstream names. */
export function cliNames(): readonly string[] {
  if (process.platform === "win32") return ["opencode-cli.exe", "opencode.exe"]
  // The macOS port may ship the binary under the product name. Keep the
  // upstream names first so an unmodified bundle keeps working.
  if (process.platform === "darwin") return ["opencode-cli", "opencode", "larpcode"]
  return ["opencode-cli", "opencode"]
}

/** A macOS `.app` bundle path resolves to the directory holding its resources. */
function cliDirectory(base: string): string {
  return process.platform === "darwin" && base.endsWith(".app") ? path.join(base, "Contents", "Resources") : base
}

/** Candidate CLI paths under `base`; a macOS `.app` bundle resolves to `Contents/Resources`. */
export function cliCandidates(base: string): string[] {
  const directory = cliDirectory(base)
  return cliNames().map((name) => path.join(directory, name))
}

function findCli(base: string, label: string, names: readonly string[]): string | undefined {
  const directory = cliDirectory(base)
  for (const name of names) {
    const candidate = path.join(directory, name)
    if (existsSync(candidate)) {
      console.log(`[larpcode-cli-binary] CLI found (${label}):`, candidate)
      return candidate
    }
  }
  return undefined
}

export function resolveCliBinary(bundlePath?: string): string {
  const names = cliNames()
  const appPath = bundlePath ?? app.getAppPath()
  console.log("[larpcode-cli-binary] app.getAppPath():", appPath)

  // A supplied macOS .app bundle carries the CLI in its Resources directory:
  // Contents/Resources/opencode-cli or Contents/Resources/larpcode.
  if (process.platform === "darwin" && appPath.endsWith(".app")) {
    const bundle = findCli(appPath, "app bundle", names)
    if (bundle) return bundle
  }

  // LarpCode installer layout: Inno Setup launches Electron with the
  // desktop-pkg folder as its app path, and the CLI lives inside
  // <app-path>/resources/<name>. Check this BEFORE process.resourcesPath,
  // because a non-packaged Electron (direct electron.exe) sets
  // resourcesPath to Electron's own resources dir, which does not contain
  // our CLI and makes every look-up miss.
  const installer = findCli(path.join(appPath, "resources"), "installer layout", names)
  if (installer) return installer

  // electron-builder / asar layout — the renamed binary sits at
  // process.resourcesPath/<exe>, next to the main app.asar.
  if (process.resourcesPath) {
    const packaged = findCli(process.resourcesPath, "packaged resourcesPath", names)
    if (packaged) return packaged
  }

  // macOS launchers may place `larpcode` beside the app executable (Contents/MacOS)
  // instead of in the bundle's Resources directory.
  if (process.platform === "darwin") {
    const beside = findCli(path.dirname(process.execPath), "next to executable", names)
    if (beside) return beside
  }

  // Dev-tree / preview: walk up from app.getAppPath() looking for the
  // sibling cli package's dist/<arch>/bin/<name>.
  const archDir =
    process.platform === "win32"
      ? "cli-windows-x64"
      : process.platform === "darwin"
        ? process.arch === "arm64"
          ? "cli-darwin-arm64"
          : "cli-darwin-x64"
        : process.arch === "arm64"
          ? "cli-linux-arm64"
          : "cli-linux-x64"

  const bases = [
    appPath,
    path.join(appPath, ".."),
    path.join(appPath, "..", ".."),
    path.join(appPath, "..", "..", ".."),
    path.join(appPath, "..", "..", "..", ".."),
  ]
  for (const base of bases) {
    for (const n of names) {
      const c = path.resolve(base, "..", "cli", "dist", archDir, "bin", n)
      if (existsSync(c)) {
        console.log("[larpcode-cli-binary] CLI found (dev-tree):", c)
        return c
      }
    }
  }
  const fallback = path.join(appPath, "resources", names[0])
  console.log("[larpcode-cli-binary] all probes missed; falling through to:", fallback)
  return fallback
}
