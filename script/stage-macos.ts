#!/usr/bin/env bun
// Stages macOS release assets into dist/release/ for the GitHub release.
//
// Inputs (produced by the desktop and CLI builds):
//   dist/desktop/LarpCode-macOS-<arch>.dmg / .zip   (electron-builder pack output)
//   packages/desktop/dist/LarpCode-macOS-*.dmg      (also accepted)
//   packages/cli/dist-cli-arm64/**/bin/opencode     (standalone CLI, arm64)
//   packages/cli/dist-cli-x64/**/bin/opencode       (standalone CLI, x64)
//   install-cli.sh                                  (CLI installer, copied verbatim)
//
// Output: dist/release/ with the binaries, install-cli.sh, cli.json, update.json
// and SHA256SUMS. `release-assets.ts` adds the source archives and rewrites the
// manifests with the final checksums.
//
// Every required input is resolved before the output directory is touched, so a
// failed run never leaves a partial release behind.
import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
export const RELEASE_BASE_URL = "https://github.com/Aero-Apex/LarpCode-MacOS/releases/latest/download/"
export const DESKTOP_DISTS = [path.join("dist", "desktop"), path.join("packages", "desktop", "dist")]
export const RELEASE_DIR = path.join("dist", "release")

export const DMG_NAMES = [
  "LarpCode-macOS-universal.dmg",
  "LarpCode-macOS-arm64.dmg",
  "LarpCode-macOS-x64.dmg",
] as const
export const ZIP_NAMES = [
  "LarpCode-macOS-universal.zip",
  "LarpCode-macOS-arm64.zip",
  "LarpCode-macOS-x64.zip",
] as const
export const CLI_NAMES = ["larpcode", "opencode"] as const
export const INSTALL_SCRIPT = "install-cli.sh"

export function isValidVersion(value: string) {
  return /^\d+\.\d+\.\d+$/.test(value)
}

export async function readVersion(root = ROOT) {
  const version = (await readFile(path.join(root, "VERSION"), "utf8")).trim()
  if (!isValidVersion(version)) throw new Error(`VERSION must be semver-like, got ${JSON.stringify(version)}`)
  return version
}

export async function isFile(target: string) {
  try {
    return (await stat(target)).isFile()
  } catch {
    return false
  }
}

// electron-builder writes artifacts at the root of its output dir, but tolerate
// a nested layout so a changed artifactName pattern cannot silently break the feed.
export async function findNamedFile(dir: string, name: string): Promise<string | undefined> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return undefined
  }
  for (const entry of entries) {
    const target = path.join(dir, entry.name)
    if (entry.isFile() && entry.name === name) return target
    if (entry.isDirectory()) {
      const found = await findNamedFile(target, name)
      if (found) return found
    }
  }
  return undefined
}

export async function findDesktopAsset(root: string, name: string) {
  for (const dir of DESKTOP_DISTS) {
    const direct = path.join(root, dir, name)
    if (await isFile(direct)) return direct
    const found = await findNamedFile(path.join(root, dir), name)
    if (found) return found
  }
  return undefined
}

export async function findCli(root: string, arch: "arm64" | "x64") {
  const dirs = [
    path.join(root, "packages", "cli", `dist-cli-${arch}`),
    path.join(root, "packages", "cli", "dist-cli"),
    path.join(root, `dist-cli-${arch}`),
    path.join(root, "dist-cli"),
  ]
  for (const dir of dirs) {
    for (const name of CLI_NAMES) {
      const found = await findNamedFile(dir, name)
      if (found) return found
    }
  }
  return undefined
}

export async function sha256(file: string) {
  return new Promise<string>((resolve, reject) => {
    const hash = createHash("sha256")
    createReadStream(file)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", () => resolve(hash.digest("hex")))
  })
}

export function buildCliManifest(
  version: string,
  assets: Record<string, { url: string; sha256: string }>,
): { version: string; assets: Record<string, { url: string; sha256: string }> } {
  return { version, assets }
}

export function buildUpdateManifest(version: string, notes: string, dmg: string, zip: string, baseUrl: string) {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`
  return { version, notes, url: `${base}${dmg}`, zipUrl: `${base}${zip}` }
}

export function buildSha256Sums(
  entries: ReadonlyArray<{
    name: string
    sha256: string
  }>,
) {
  return (
    [...entries]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((entry) => `${entry.sha256}  ${entry.name}`)
      .join("\n") + "\n"
  )
}

export interface StageResult {
  version: string
  files: string[]
}

export interface StageOptions {
  notes?: string
  baseUrl?: string
}

export async function stage(root = ROOT, options: StageOptions = {}): Promise<StageResult> {
  const version = await readVersion(root)

  const dmgPaths = new Map<string, string>()
  const zipPaths = new Map<string, string>()
  for (const name of DMG_NAMES) {
    const found = await findDesktopAsset(root, name)
    if (found) dmgPaths.set(name, found)
  }
  for (const name of ZIP_NAMES) {
    const found = await findDesktopAsset(root, name)
    if (found) zipPaths.set(name, found)
  }
  const cliArm = await findCli(root, "arm64")
  const cliX64 = await findCli(root, "x64")
  const installer = path.join(root, INSTALL_SCRIPT)

  const missing: string[] = []
  if (dmgPaths.size === 0) missing.push(`  - a LarpCode-macOS-*.dmg (looked in ${DESKTOP_DISTS.join(", ")})`)
  if (zipPaths.size === 0) missing.push(`  - a LarpCode-macOS-*.zip (looked in ${DESKTOP_DISTS.join(", ")})`)
  if (!cliArm) missing.push("  - standalone arm64 CLI (looked in dist-cli-arm64/**/bin/opencode)")
  if (!cliX64) missing.push("  - standalone x64 CLI (looked in dist-cli-x64/**/bin/opencode)")
  if (!(await isFile(installer))) missing.push(`  - ${INSTALL_SCRIPT}`)
  if (missing.length > 0) {
    throw new Error(
      ["macOS release inputs are missing:", ...missing, "Run the desktop and CLI builds first, then re-run this script."].join(
        "\n",
      ),
    )
  }

  const release = path.join(root, RELEASE_DIR)
  await rm(release, { recursive: true, force: true })
  await mkdir(release, { recursive: true })

  const copies: Array<[string, string]> = [
    ...[...dmgPaths].map(([name, from]) => [from, name] as [string, string]),
    ...[...zipPaths].map(([name, from]) => [from, name] as [string, string]),
    [cliArm!, "larpcode-arm64"],
    [cliX64!, "larpcode-x64"],
    [installer, INSTALL_SCRIPT],
  ]
  for (const [from, name] of copies) await copyFile(from, path.join(release, name))

  const hashes = await Promise.all(
    copies.map(async ([, name]) => ({ name, sha256: await sha256(path.join(release, name)) })),
  )
  const byName = new Map(hashes.map((entry) => [entry.name, entry.sha256]))

  const notes = options.notes ?? process.env.LARPCODE_RELEASE_NOTES ?? ""
  const baseUrl = options.baseUrl ?? process.env.LARPCODE_RELEASE_URL ?? RELEASE_BASE_URL
  const primaryDmg = DMG_NAMES.find((name) => dmgPaths.has(name))!
  const primaryZip = ZIP_NAMES.find((name) => zipPaths.has(name))!
  await writeFile(
    path.join(release, "cli.json"),
    JSON.stringify(
      buildCliManifest(version, {
        "darwin-arm64": { url: `${baseUrl}larpcode-arm64`, sha256: byName.get("larpcode-arm64")! },
        "darwin-x64": { url: `${baseUrl}larpcode-x64`, sha256: byName.get("larpcode-x64")! },
      }),
      null,
      2,
    ) + "\n",
  )
  await writeFile(
    path.join(release, "update.json"),
    JSON.stringify(buildUpdateManifest(version, notes, primaryDmg, primaryZip, baseUrl), null, 2) + "\n",
  )
  await writeFile(path.join(release, "SHA256SUMS"), buildSha256Sums(hashes))

  // Read the manifests back so a typo cannot ship a feed the updater rejects.
  const update = JSON.parse(await readFile(path.join(release, "update.json"), "utf8")) as {
    version?: string
    url?: string
  }
  if (update.version !== version || !update.url?.startsWith("https://")) {
    throw new Error("update.json has the wrong version or URL")
  }
  const cli = JSON.parse(await readFile(path.join(release, "cli.json"), "utf8")) as { version?: string }
  if (cli.version !== version) throw new Error("cli.json has the wrong version")

  console.log(`staged LarpCode ${version} into ${path.relative(root, release)}`)
  return {
    version,
    files: [...copies.map(([, name]) => name), "cli.json", "update.json", "SHA256SUMS"],
  }
}

if (import.meta.main) await stage()
