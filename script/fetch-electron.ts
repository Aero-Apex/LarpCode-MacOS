#!/usr/bin/env bun
// Downloads the pinned Electron runtime the desktop bundles use.
//
// Reading it from a workspace `node_modules/electron` is fragile: Bun may
// hoist it, keep it only in its virtual store, or skip the package's install
// script, which leaves the Electron executable missing. The release build must
// not depend on that layout, so this script downloads the official Electron zip
// for the version pinned in `packages/desktop/package.json` and verifies it
// against the release's SHASUMS256.txt.
//
// Output (win32): installer/deps/electron/electron.exe
// Output (darwin): installer/.electron-darwin/Electron.app/Contents/MacOS/Electron
//
// Overrides:
//   LARPCODE_ELECTRON_VERSION     electron version (default: packages/desktop/package.json)
//   LARPCODE_ELECTRON_PLATFORM    darwin or win32 (default: darwin on macOS, otherwise win32)
//   LARPCODE_ELECTRON_ARCH        x64, arm64 or universal (default: process.arch)
// On darwin the absolute staging directory is also printed as LARPCODE_ELECTRON_DIR=<path>.
import { $ } from "bun"
import { createHash } from "node:crypto"
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import path from "node:path"

const root = path.resolve(import.meta.dir, "..")
process.chdir(root)

const desktop = (await Bun.file("packages/desktop/package.json").json()) as {
  devDependencies?: Record<string, string>
}
const version = process.env.LARPCODE_ELECTRON_VERSION ?? desktop.devDependencies?.electron
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error(`packages/desktop/package.json must pin a stable electron version, got ${version ?? "nothing"}`)
}

const platformNames: Record<string, "darwin" | "win32"> = {
  darwin: "darwin",
  macos: "darwin",
  osx: "darwin",
  win32: "win32",
  windows: "win32",
}
const defaultPlatform = process.platform === "darwin" ? "darwin" : "win32"
const rawPlatform = (process.env.LARPCODE_ELECTRON_PLATFORM ?? defaultPlatform).trim().toLowerCase()
const platform = platformNames[rawPlatform]
if (!platform) {
  throw new Error(`invalid LARPCODE_ELECTRON_PLATFORM=${rawPlatform}; expected darwin or win32`)
}

const archNames: Record<string, "x64" | "arm64" | "universal"> = {
  x64: "x64",
  x86_64: "x64",
  amd64: "x64",
  arm64: "arm64",
  aarch64: "arm64",
  universal: "universal",
  universal2: "universal",
}
const rawArch = (process.env.LARPCODE_ELECTRON_ARCH ?? process.arch).trim().toLowerCase()
const arch = archNames[rawArch]
if (!arch) {
  throw new Error(`invalid LARPCODE_ELECTRON_ARCH=${rawArch}; expected x64, arm64 or universal`)
}
if (platform === "win32" && arch === "universal") {
  throw new Error("universal Electron builds are only published for darwin")
}

const darwin = platform === "darwin"
const name = `electron-v${version}-${platform}-${arch}.zip`
const base = `https://github.com/electron/electron/releases/download/v${version}`
const cache = path.join(root, "installer", ".electron-download")
const archive = path.join(cache, name)
const targetRel = darwin ? "installer/.electron-darwin" : "installer/deps/electron"
const target = path.join(root, targetRel)
// Keep the win32 stamp layout, but include the platform/arch on darwin so a
// staged arm64 bundle is never mistaken for an x64 or universal one.
const stamp = path.join(target, darwin ? ".larpcode-version" : "version")
const stampValue = darwin ? `${version} ${platform}-${arch}` : version
const sentinel = darwin ? "Electron.app/Contents/MacOS/Electron" : "electron.exe"

async function exists(target: string) {
  try {
    await stat(target)
    return true
  } catch {
    return false
  }
}

function reportStaged(already: boolean) {
  const verb = already ? "already staged at" : "staged at"
  if (darwin) {
    console.log(`Electron ${version} (${platform}-${arch}) ${verb} ${targetRel}`)
    console.log(`LARPCODE_ELECTRON_DIR=${target}`)
  } else {
    console.log(`Electron ${version} ${verb} ${targetRel}`)
  }
}

if (await exists(path.join(target, sentinel))) {
  const staged = await readFile(stamp, "utf8").catch(() => "")
  if (staged.trim() === stampValue) {
    reportStaged(true)
    process.exit(0)
  }
}

console.log(`Fetching Electron ${version} (${platform}-${arch})`)
const sums = await (await fetch(`${base}/SHASUMS256.txt`)).text()
const line = sums.split(/\r?\n/).find((entry) => entry.trim().endsWith(name))
if (!line) throw new Error(`SHASUMS256.txt has no entry for ${name}`)
const expected = line.trim().split(/\s+/)[0]?.toLowerCase()
if (!expected || !/^[0-9a-f]{64}$/.test(expected)) throw new Error(`invalid sha256 entry for ${name}: ${line}`)

const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")

let bytes: Uint8Array | undefined
if (await exists(archive)) {
  const cached = new Uint8Array(await Bun.file(archive).arrayBuffer())
  if (digest(cached) === expected) bytes = cached
}

if (!bytes) {
  const response = await fetch(`${base}/${name}`)
  if (!response.ok) throw new Error(`download failed ${response.status}: ${base}/${name}`)
  bytes = new Uint8Array(await response.arrayBuffer())
  const actual = digest(bytes)
  if (actual !== expected) throw new Error(`sha256 mismatch for ${name}: ${actual}`)
  await mkdir(cache, { recursive: true })
  await Bun.write(archive, bytes)
}

await rm(target, { recursive: true, force: true })
await mkdir(target, { recursive: true })
await $`tar -xf ${archive} -C ${target}`
if (!(await exists(path.join(target, sentinel)))) {
  throw new Error(`${sentinel} not found in ${name}`)
}
await writeFile(stamp, stampValue + "\n")
reportStaged(false)
