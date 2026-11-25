#!/usr/bin/env bun
import { $ } from "bun"
import { cp, mkdir, readdir, rm } from "node:fs/promises"
import path from "node:path"
import { getConfig } from "../electron-builder.config"
import { getCurrentCli, resolveChannel } from "./utils"

// Packages the built app (out/) for OPENCODE_TARGET into dist/desktop at the repository root, unsigned:
// macOS: DMG and ZIP installers. Windows: the unpacked app in app/, or with OPENCODE_DESKTOP_APP, the NSIS
// installer around that (signed) app. Linux: AppImage, deb and rpm. The release workflow signs afterwards.
const dir = path.resolve(import.meta.dir, "..")

const out = path.resolve(dir, "../../dist/desktop")

// This repo's release feed publishes LarpCode-macOS-*.dmg/.zip, never the upstream Windows .exe.
const RELEASE_FEED = "https://github.com/Aero-Apex/LarpCode-MacOS/releases/latest/download/"

const cli = getCurrentCli()

const os =
  new Map([
    ["darwin", "mac"],
    ["win32", "win"],
  ]).get(cli.os) ?? "linux"

const app = process.env.OPENCODE_DESKTOP_APP

const flags = [`--${os}`, `--${cli.cpu}`, "--publish", "never", "--config", "electron-builder.config.ts"]

process.chdir(dir)

await rm("dist", { recursive: true, force: true })

await rm(out, { recursive: true, force: true })

await mkdir(out, { recursive: true })

if (app) {
  // The installer uses the channel's icons; the rest of the app is already built and signed.
  await $`bun ./script/copy-icons.ts ${resolveChannel()}`
  await $`bunx electron-builder ${flags} --prepackaged ${app}`
  await cp(`dist/opencode-desktop-win-${cli.cpu}.exe`, path.join(out, `opencode-desktop-win-${cli.cpu}.exe`))
}

if (!app && os === "linux") {
  await $`bunx electron-builder ${flags}`
  const files = (await readdir("dist")).filter((file) => /\.(AppImage|deb|rpm)$/.test(file))
  await Promise.all(files.map((file) => cp(path.join("dist", file), path.join(out, file))))
}

if (!app && os === "mac") {
  // flags already carries --mac and the OPENCODE_TARGET-derived --cpu. Build real dmg/zip targets instead of
  // --dir; a secretless job stays unsigned, and a configured identity is passed straight to electron-builder.
  const identity = process.env.MACOS_SIGN_IDENTITY?.trim()
  // dmg + zip targets come from electron-builder.config.ts (mac.target); they
  // are not separate CLI flags.
  const macFlags = [
    identity ? `-c.mac.identity=${identity}` : "-c.mac.identity=null",
    `-c.publish.url=${RELEASE_FEED}`,
  ]
  await $`bunx electron-builder ${flags} ${macFlags}`

  const artifacts = (await readdir("dist")).filter((file) => /\.(dmg|zip)$/.test(file))
  const dmg = artifacts.find((file) => file.endsWith(".dmg"))
  const zip = artifacts.find((file) => file.endsWith(".zip"))

  if (!dmg || !zip) throw new Error(`Expected a .dmg and a .zip in dist, found ${artifacts.join(", ")}`)

  const parent = path.join("dist", cli.cpu === "arm64" ? "mac-arm64" : "mac")
  const bundles = (await readdir(parent)).filter((file) => file.endsWith(".app"))

  if (bundles.length !== 1) throw new Error(`Expected one .app bundle in ${parent}, found ${bundles.join(", ")}`)
  await writeUpdateConfig(path.join(parent, bundles[0], "Contents", "Resources"), RELEASE_FEED)
  await cp(path.join("dist", dmg), path.join(out, `LarpCode-macOS-${cli.cpu}.dmg`))
  await cp(path.join("dist", zip), path.join(out, `LarpCode-macOS-${cli.cpu}.zip`))
}

if (!app && os === "win") {
  await $`bunx electron-builder ${flags} --dir`
  const unpacked = path.join("dist", cli.cpu === "arm64" ? "win-arm64-unpacked" : "win-unpacked")
  await writeUpdateConfig(path.join(unpacked, "resources"))
  await cp(unpacked, path.join(out, "app"), { recursive: true })
}

// electron-builder writes resources/app-update.yml for dmg, zip and nsis targets, but not for --dir builds.
// Keep writing it for those --dir builds; macOS passes this repo's dmg/zip feed so the packaged metadata never
// points at the upstream Windows .exe installer.
async function writeUpdateConfig(resources: string, url = getConfig().publish.url) {
  const publish = getConfig().publish
  const name: string = (await Bun.file("package.json").json()).name
  await Bun.write(
    path.join(resources, "app-update.yml"),
    [
      `provider: ${publish.provider}`,
      `url: ${url}`,
      `channel: ${publish.channel}`,
      `updaterCacheDirName: '${name.replace(/[/\\:*?"<>|]/g, "").toLowerCase()}-updater'`,
    ].join("\n") + "\n",
  )
}
