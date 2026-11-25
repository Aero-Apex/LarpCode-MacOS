#!/usr/bin/env bun
// Optional macOS codesign + notarize step for staged release artifacts.
//
// The macOS release workflow calls this after electron-builder produces a .app
// and a DMG. With no signing secrets configured it is a no-op, so unsigned v1
// builds never fail (see PORT_SPEC.md, "Security / signing").
//
// Usage:
//   bun run script/macos/notarize.ts --app "dist/LarpCode macOS.app" --dmg dist/LarpCode-macOS-universal.dmg
//   bun run script/macos/notarize.ts "dist/LarpCode macOS.app" dist/LarpCode-macOS-universal.dmg
// Paths may also come from MACOS_APP_PATH / MACOS_DMG_PATH.
//
// All four secrets are required to sign:
//   MACOS_SIGN_IDENTITY, MACOS_NOTARIZE_APPLE_ID,
//   MACOS_NOTARIZE_PASSWORD, MACOS_NOTARIZE_TEAM_ID
//
// Commands (argv arrays, never a shell string):
//   codesign --deep --force --options runtime --entitlements script/macos/entitlements.plist --sign <identity> <app>
//   xcrun notarytool submit <dmg> --apple-id <id> --password <app-password> --team-id <team> --wait
//   xcrun stapler staple <dmg>
//
// buildCommands, readNotarizeSecrets and signAndNotarize are exported so tests
// can inspect argv and inject a fake runner instead of invoking codesign.

import { stat } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

export type NotarizeSecrets = {
  identity: string
  appleId: string
  password: string
  teamId: string
}

export type NotarizeCommand = {
  command: string
  args: string[]
}

export type CommandRunner = (command: string, args: string[], secrets: NotarizeSecrets) => Promise<void>

export type NotarizeOptions = {
  app: string
  dmg: string
  secrets: NotarizeSecrets
  entitlements?: string
  run?: CommandRunner
}

const here = import.meta.dir ?? path.dirname(fileURLToPath(import.meta.url))
const defaultEntitlements = path.resolve(here, "entitlements.plist")

// The password is an app-specific password and may contain spaces or other
// shell metacharacters; only trim the non-password fields.
export function readNotarizeSecrets(
  env: Record<string, string | undefined> = process.env,
): NotarizeSecrets | undefined {
  const identity = env.MACOS_SIGN_IDENTITY?.trim()
  const appleId = env.MACOS_NOTARIZE_APPLE_ID?.trim()
  const password = env.MACOS_NOTARIZE_PASSWORD
  const teamId = env.MACOS_NOTARIZE_TEAM_ID?.trim()
  if (!identity || !appleId || !password || !teamId) return undefined
  return { identity, appleId, password, teamId }
}

function describe(command: string, args: string[], secrets: NotarizeSecrets) {
  const parts = [command, ...args].map((arg) => {
    if (arg === secrets.password) return "***"
    return /\s/.test(arg) ? JSON.stringify(arg) : arg
  })
  return parts.join(" ")
}

// Pure argv construction: no shell is involved, so values are passed verbatim
// and cannot be interpreted as shell syntax or extra flags.
export function buildCommands(options: Omit<NotarizeOptions, "run">): NotarizeCommand[] {
  const { app, dmg, secrets, entitlements = defaultEntitlements } = options
  for (const [label, file] of [
    ["app", app],
    ["DMG", dmg],
  ] as const) {
    if (!file) throw new Error(`missing ${label} path`)
    if (file.startsWith("-")) throw new Error(`${label} path must not start with "-": ${file}`)
  }
  if (!app.endsWith(".app")) throw new Error(`app path must end in .app: ${app}`)
  if (!dmg.endsWith(".dmg")) throw new Error(`DMG path must end in .dmg: ${dmg}`)

  return [
    {
      command: "codesign",
      args: [
        "--deep",
        "--force",
        "--options",
        "runtime",
        "--entitlements",
        entitlements,
        "--sign",
        secrets.identity,
        app,
      ],
    },
    {
      command: "xcrun",
      args: [
        "notarytool",
        "submit",
        dmg,
        "--apple-id",
        secrets.appleId,
        "--password",
        secrets.password,
        "--team-id",
        secrets.teamId,
        "--wait",
      ],
    },
    { command: "xcrun", args: ["stapler", "staple", dmg] },
  ]
}

export const defaultRunner: CommandRunner = async (command, args, secrets) => {
  let child: ReturnType<typeof Bun.spawn>
  try {
    child = Bun.spawn([command, ...args], { stdout: "pipe", stderr: "pipe" })
  } catch (error) {
    throw new Error(`could not start ${command}: ${error instanceof Error ? error.message : String(error)}`)
  }
  const [stdout, stderr, exitCode] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited])
  const output = (stdout + stderr).trim()
  if (output) console.log(output)
  if (exitCode !== 0) {
    const detail = output ? `\n${output}` : ""
    throw new Error(`${describe(command, args, secrets)} failed (exit ${exitCode})${detail}`)
  }
}

export async function signAndNotarize(options: NotarizeOptions): Promise<void> {
  const { app, dmg, secrets, entitlements = defaultEntitlements, run = defaultRunner } = options
  const inputs = [
    ["app", app],
    ["DMG", dmg],
    ["entitlements", entitlements],
  ] as const
  for (const [label, file] of inputs) {
    try {
      await stat(file)
    } catch (error) {
      throw new Error(`${label} is not accessible: ${file} (${error instanceof Error ? error.message : String(error)})`)
    }
  }

  for (const step of buildCommands({ app, dmg, secrets, entitlements })) {
    console.log(`+ ${describe(step.command, step.args, secrets)}`)
    await run(step.command, step.args, secrets)
  }
  console.log(`signed ${app}, submitted and stapled ${dmg}`)
}

export const notarize = signAndNotarize

function parseArgs(argv: string[]) {
  let app = process.env.MACOS_APP_PATH
  let dmg = process.env.MACOS_DMG_PATH
  const positional: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    if (arg === "--app" || arg === "--dmg") {
      const value = argv[++i]
      if (!value) throw new Error(`${arg} requires a path`)
      if (arg === "--app") app = value
      else dmg = value
    } else if (arg.startsWith("-")) {
      throw new Error(`unknown argument: ${arg}`)
    } else {
      positional.push(arg)
    }
  }
  if (positional.length > 2) throw new Error(`unexpected extra arguments: ${positional.slice(2).join(" ")}`)
  app = positional[0] ?? app
  dmg = positional[1] ?? dmg
  if (!app || !dmg) throw new Error("both the .app and DMG paths are required: --app <app> --dmg <dmg>")
  return { app, dmg }
}

async function main() {
  const secrets = readNotarizeSecrets()
  if (!secrets) {
    console.log(
      "skipping unsigned build: not all of MACOS_SIGN_IDENTITY, MACOS_NOTARIZE_APPLE_ID, " +
        "MACOS_NOTARIZE_PASSWORD and MACOS_NOTARIZE_TEAM_ID are set; leaving the .app and DMG unsigned and unnotarized",
    )
    return
  }
  if (process.platform !== "darwin") throw new Error("codesign/notarytool require macOS")
  const { app, dmg } = parseArgs(process.argv.slice(2))
  const entitlements = process.env.LARPCODE_ENTITLEMENTS
  await signAndNotarize({ app, dmg, secrets, ...(entitlements ? { entitlements } : {}) })
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(`notarize.ts: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  })
}
