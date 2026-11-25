#!/usr/bin/env bun
// Assembles and verifies the files attached to a macOS GitHub release.
//
// Inputs are staged into dist/release/ by the macOS staging step:
//   LarpCode-macOS-universal.dmg
//   LarpCode-macOS-arm64.dmg, LarpCode-macOS-x64.dmg
//   LarpCode-macOS-universal.zip
//   larpcode-arm64 and larpcode-x64 (a single `larpcode` covers both)
//   install-cli.sh
//
// Outputs, written into the same directory:
//   LarpCode-macOS-<version>-source.zip, LarpCode-macOS-<version>-source.tar.gz
//   cli.json, update.json, SHA256SUMS
//
// The script fails on missing or implausibly small staging inputs, an invalid
// VERSION or tag, or a generated manifest that does not round-trip.
import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { copyFile, mkdir, mkdtemp, readFile, readdir, readlink, rm, stat, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = import.meta.dir ?? path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, "..")
export const RELEASE_DIR = path.join("dist", "release")
export const RELEASE_BASE_URL = "https://github.com/Aero-Apex/LarpCode-MacOS/releases/latest/download/"
export const UPDATE_ASSET = "LarpCode-macOS-universal.dmg"
export const INSTALL_SCRIPT = "install-cli.sh"

export const DESKTOP_ASSETS = {
  universalDmg: UPDATE_ASSET,
  arm64Dmg: "LarpCode-macOS-arm64.dmg",
  x64Dmg: "LarpCode-macOS-x64.dmg",
  universalZip: "LarpCode-macOS-universal.zip",
} as const

export type Arch = "arm64" | "x64"

// Suffixed names are preferred; a single arch-neutral binary may serve both.
export const CLI_ASSET_CANDIDATES: Record<Arch, string[]> = {
  arm64: ["larpcode-arm64", "arm64/larpcode", "larpcode"],
  x64: ["larpcode-x64", "x64/larpcode", "larpcode"],
}

export type UpdateManifest = { version: string; url: string; sha256: string; notes: string }
export type CliAssetManifest = { url: string; sha256: string }
export type CliManifest = { version: string; assets: Record<string, CliAssetManifest> }

export function parseVersion(text: string): string {
  const version = text.trim()
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`VERSION must be semver-like, got ${version}`)
  return version
}

export function resolveTag(version: string, env: NodeJS.ProcessEnv = process.env): string {
  const fallback = `v${version}`
  const tag = env.LARPCODE_TAG || (env.GITHUB_REF_TYPE === "tag" ? env.GITHUB_REF_NAME : undefined) || fallback
  // v1 is an explicit alias of v1.0.0 in the release feed.
  const accepted = version === "1.0.0" ? [fallback, "v1"] : [fallback]
  if (!accepted.includes(tag)) throw new Error(`release tag ${tag} does not match VERSION ${version}`)
  return tag
}

export function releaseBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const base = env.LARPCODE_RELEASE_BASE_URL || RELEASE_BASE_URL
  if (!base.startsWith("https://")) throw new Error(`release base URL must be https, got ${base}`)
  return base.endsWith("/") ? base : `${base}/`
}

export function assetUrl(name: string, base: string = RELEASE_BASE_URL): string {
  return `${base.endsWith("/") ? base : `${base}/`}${name.replace(/^\/+/, "")}`
}

export async function exists(target: string): Promise<boolean> {
  try {
    await stat(target)
    return true
  } catch {
    return false
  }
}

export async function requireFile(file: string, label: string, minimum: number): Promise<void> {
  if (!(await exists(file))) throw new Error(`${label} is missing: ${file}`)
  const size = (await stat(file)).size
  if (size < minimum) throw new Error(`${label} is suspiciously small: ${file} (${size} bytes)`)
}

export function sha256(file: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const hash = createHash("sha256")
    createReadStream(file)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", () => resolve(hash.digest("hex")))
  })
}

export function sourceArchiveNames(version: string) {
  const prefix = `LarpCode-macOS-${version}`
  return {
    prefix,
    zip: `${prefix}-source.zip`,
    tarGz: `${prefix}-source.tar.gz`,
  }
}

export async function findCliAsset(release: string, arch: Arch): Promise<string> {
  for (const name of CLI_ASSET_CANDIDATES[arch]) {
    if (await exists(path.join(release, name))) return name
  }
  throw new Error(`standalone CLI for ${arch} is missing from ${release}`)
}

// The staging step publishes whichever DMG the desktop build produced. Prefer
// the universal image, then arm64, then x64, so a per-arch-only CI run still
// yields a usable update feed.
export async function findPrimaryDmg(release: string): Promise<string> {
  for (const name of [DESKTOP_ASSETS.universalDmg, DESKTOP_ASSETS.arm64Dmg, DESKTOP_ASSETS.x64Dmg]) {
    if (await exists(path.join(release, name))) return name
  }
  throw new Error(`no ${DESKTOP_ASSETS.universalDmg} was staged in ${release}`)
}

// All release files, including CLI binaries kept in arch subfolders.
export async function releaseFiles(release: string): Promise<string[]> {
  const names: string[] = []
  async function walk(dir: string, prefix: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) await walk(path.join(dir, entry.name), relative)
      else if (entry.isFile() && relative !== "SHA256SUMS") names.push(relative)
    }
  }
  await walk(release, "")
  return names.sort()
}

export function formatSha256Sums(entries: Array<{ name: string; sha256: string }>): string {
  for (const entry of entries) {
    if (!/^[0-9a-f]{64}$/i.test(entry.sha256)) throw new Error(`invalid sha256 for ${entry.name}`)
  }
  return entries.map((entry) => `${entry.sha256.toLowerCase()}  ${entry.name}`).join("\n") + "\n"
}

export function buildUpdateManifest(version: string, url: string, hash: string): UpdateManifest {
  if (!url.startsWith("https://")) throw new Error(`update.json url must be https, got ${url}`)
  if (!/^[0-9a-f]{64}$/i.test(hash)) throw new Error(`update.json sha256 is invalid for ${url}`)
  return { version, url, sha256: hash.toLowerCase(), notes: "" }
}

export function buildCliManifest(
  version: string,
  assets: Record<string, CliAssetManifest>,
  base: string = RELEASE_BASE_URL,
): CliManifest {
  const result: Record<string, CliAssetManifest> = {}
  for (const [key, asset] of Object.entries(assets)) {
    if (!asset.url.startsWith(base)) {
      throw new Error(`cli.json url for ${key} is outside the release feed: ${asset.url}`)
    }
    if (!/^[0-9a-f]{64}$/i.test(asset.sha256)) throw new Error(`cli.json sha256 for ${key} is invalid`)
    result[key] = { url: asset.url, sha256: asset.sha256.toLowerCase() }
  }
  if (Object.keys(result).length === 0) throw new Error("cli.json has no assets")
  return { version, assets: result }
}

export function verifyManifests(
  documents: { update: unknown; cli: unknown },
  expected: {
    version: string
    url: string
    sha256: string
    assets: Record<string, { url: string; sha256: string }>
  },
): void {
  const update = documents.update as Partial<UpdateManifest> | null
  const cli = documents.cli as Partial<CliManifest> | null
  if (!update || update.version !== expected.version) throw new Error("update.json has the wrong version")
  if (update.url !== expected.url) throw new Error("update.json has the wrong url")
  if (update.sha256 !== expected.sha256.toLowerCase()) throw new Error("update.json has the wrong sha256")
  if (!cli || cli.version !== expected.version) throw new Error("cli.json has the wrong version")
  for (const [key, asset] of Object.entries(expected.assets)) {
    const found = cli.assets?.[key]
    if (found?.url !== asset.url) throw new Error(`cli.json has the wrong ${key} url`)
    if (found?.sha256 !== asset.sha256.toLowerCase()) throw new Error(`cli.json has the wrong ${key} sha256`)
  }
  const extra = Object.keys(cli.assets ?? {}).filter((key) => !(key in expected.assets))
  if (extra.length > 0) throw new Error(`cli.json has unexpected assets: ${extra.join(", ")}`)
}

function gitAvailable(): boolean {
  return Bun.spawnSync(["git", "rev-parse", "--is-inside-work-tree"], { cwd: root }).exitCode === 0
}

const excludedSourceEntries = new Set([".git", "node_modules", "dist"])

async function copySourceTree(source: string, destination: string): Promise<void> {
  await mkdir(destination, { recursive: true })
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (excludedSourceEntries.has(entry.name)) continue
    const from = path.join(source, entry.name)
    const to = path.join(destination, entry.name)
    if (entry.isDirectory()) await copySourceTree(from, to)
    else if (entry.isFile()) await copyFile(from, to)
    else if (entry.isSymbolicLink()) await symlink(await readlink(from), to)
  }
}

// Fallback for checkouts without git: copy the working tree, but never .git or
// build output, then archive the copy so the prefix matches git archive.
export async function archiveFromSourceTree(out: string, format: "zip" | "tar.gz", prefix: string): Promise<void> {
  const temp = await mkdtemp(path.join(tmpdir(), "larpcode-source-"))
  try {
    await copySourceTree(root, path.join(temp, prefix))
    const command =
      format === "zip"
        ? Bun.spawnSync(["zip", "-q", "-r", out, prefix], { cwd: temp })
        : Bun.spawnSync(["tar", "-czf", out, prefix], { cwd: temp })
    if (command.exitCode !== 0) {
      throw new Error(`failed to create ${format} source archive: ${command.stderr.toString().trim()}`)
    }
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
}

async function assertNoGitEntries(archive: string, format: "zip" | "tar.gz"): Promise<void> {
  const listing =
    format === "zip"
      ? Bun.spawnSync(["unzip", "-Z1", archive])
      : Bun.spawnSync(["tar", "-tzf", archive])
  // Listing tools are not guaranteed outside macOS; both creation paths
  // already exclude .git, so an unavailable listing tool is not fatal.
  if (listing.exitCode !== 0) return
  if (/(^|\/)\.git(\/|$)/m.test(listing.stdout.toString())) {
    throw new Error(`${archive} contains .git entries`)
  }
}

export async function createSourceArchives(release: string, version: string): Promise<string[]> {
  const names = sourceArchiveNames(version)
  const prefix = `${names.prefix}/`
  const useGit = gitAvailable()
  const formats: Array<{ format: "zip" | "tar.gz"; file: string }> = [
    { format: "zip", file: names.zip },
    { format: "tar.gz", file: names.tarGz },
  ]
  for (const { format, file } of formats) {
    const out = path.join(release, file)
    if (useGit) {
      const result = Bun.spawnSync(
        ["git", "archive", `--format=${format}`, `--prefix=${prefix}`, "-o", out, "HEAD"],
        { cwd: root },
      )
      if (result.exitCode === 0) {
        await assertNoGitEntries(out, format)
        continue
      }
      console.warn(`git archive failed for ${file}; falling back to a source tree copy`)
    }
    await archiveFromSourceTree(out, format, names.prefix)
    await assertNoGitEntries(out, format)
  }
  return formats.map((entry) => entry.file)
}

export async function run(): Promise<void> {
  process.chdir(root)
  const version = parseVersion(await readFile("VERSION", "utf8"))
  const tag = resolveTag(version)
  const base = releaseBaseUrl()
  const release = path.join(root, RELEASE_DIR)
  if (!(await exists(release))) throw new Error(`${release} is missing; run the macOS staging step first`)

  const binaryMinimum = 1024 * 1024
  const primaryDmg = await findPrimaryDmg(release)
  await requireFile(path.join(release, primaryDmg), "desktop app image", binaryMinimum)
  await requireFile(path.join(release, INSTALL_SCRIPT), "CLI install script", 512)
  for (const name of [DESKTOP_ASSETS.arm64Dmg, DESKTOP_ASSETS.x64Dmg, DESKTOP_ASSETS.universalZip]) {
    if (await exists(path.join(release, name))) {
      await requireFile(path.join(release, name), name, binaryMinimum)
    }
  }

  const cliAssets: Record<Arch, string> = {
    arm64: await findCliAsset(release, "arm64"),
    x64: await findCliAsset(release, "x64"),
  }
  for (const arch of ["arm64", "x64"] as const) {
    await requireFile(path.join(release, cliAssets[arch]), `standalone CLI (${arch})`, binaryMinimum)
  }

  // Only generated files are replaced; staged inputs from the earlier step stay.
  const generated = ["update.json", "cli.json", ...Object.values(sourceArchiveNames(version))]
  for (const name of generated) await rm(path.join(release, name), { force: true })

  const imageSha = await sha256(path.join(release, primaryDmg))
  const cliSha: Record<Arch, string> = {
    arm64: await sha256(path.join(release, cliAssets.arm64)),
    x64: await sha256(path.join(release, cliAssets.x64)),
  }
  const update = buildUpdateManifest(version, assetUrl(primaryDmg, base), imageSha)
  const expectedAssets: Record<string, { url: string; sha256: string }> = {}
  for (const arch of ["arm64", "x64"] as const) {
    expectedAssets[`darwin-${arch}`] = {
      url: assetUrl(cliAssets[arch], base),
      sha256: cliSha[arch],
    }
  }
  const cli = buildCliManifest(version, expectedAssets, base)

  await Bun.write(path.join(release, "update.json"), JSON.stringify(update, null, 2) + "\n")
  await Bun.write(path.join(release, "cli.json"), JSON.stringify(cli, null, 2) + "\n")
  await createSourceArchives(release, version)

  const names = await releaseFiles(release)
  const hashes = Object.fromEntries(
    await Promise.all(names.map(async (name) => [name, await sha256(path.join(release, name))])),
  ) as Record<string, string>
  const sums = formatSha256Sums(names.map((name) => ({ name, sha256: hashes[name]! })))
  await Bun.write(path.join(release, "SHA256SUMS"), sums)

  // Read the manifests back so a typo cannot ship a feed the clients reject.
  const writtenUpdate = (await Bun.file(path.join(release, "update.json")).json()) as unknown
  const writtenCli = (await Bun.file(path.join(release, "cli.json")).json()) as unknown
  verifyManifests(
    { update: writtenUpdate, cli: writtenCli },
    { version, url: update.url, sha256: imageSha, assets: expectedAssets },
  )

  console.log(`release assets for LarpCode macOS ${version} (${tag}):`)
  for (const name of names) {
    const size = (await stat(path.join(release, name))).size
    console.log(`  ${name}  ${(size / 1024 / 1024).toFixed(1)} MB  ${hashes[name]!.slice(0, 12)}…`)
  }
}

if (import.meta.main) await run()
