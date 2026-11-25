// Local release smoke check for the macOS port. Reads checked-in sources only,
// so it runs without Electron binaries or a full install.
//
//   bun script/macos/release-smoke.ts
//
// Checks are exported so tests can import `checks` and `runChecks` without
// triggering the CLI output or a process exit (`import.meta.main` guard).

import { readdir, stat } from "node:fs/promises"
import path from "node:path"

export const root = path.resolve(import.meta.dir, "..", "..")

export interface Check {
  name: string
  ok: boolean
  detail: string
}

type CheckFn = (base: string) => Promise<Check> | Check

// PORT_SPEC Identity values that belong in a user-facing README. The bundle id
// is checked against the electron-builder config instead, and the version file
// is checked directly rather than expecting its literal value in prose.
export const identityTokens = [
  "LarpCode macOS",
  "Aero-Apex/LarpCode-MacOS",
  "opencode",
  "larpcode",
  "macOS 13",
  "Ventura",
  "Apple Silicon",
  "Intel",
  "arm64",
  "x64",
  "v1",
]

export const xdgVariables = ["XDG_DATA_HOME", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_STATE_HOME"]

const publishUrl = "https://github.com/Aero-Apex/LarpCode-MacOS/releases/latest/download/"
const oldPublishUrl = "https://github.com/Tazmyan/LarpCode"

function defineCheck(name: string, run: CheckFn) {
  return { name, run }
}

function missing(tokens: string[], source: string) {
  return tokens.filter((token) => !source.includes(token))
}

function detailFor(name: string, missingTokens: string[]) {
  return missingTokens.length === 0 ? name : `missing ${missingTokens.join(", ")}`
}

async function source(base: string, relative: string) {
  const file = path.join(base, relative)

  return await Bun.file(file).text()
}

export const checks = [
  defineCheck("VERSION is semver", async (base) => {
    const version = (await source(base, "VERSION")).trim()
    const ok = /^\d+\.\d+\.\d+$/.test(version)

    return { name: "VERSION is semver", ok, detail: version }
  }),

  defineCheck("README carries PORT_SPEC identity values", async (base) => {
    const absent = missing(identityTokens, await source(base, "README.md"))

    return {
      name: "README carries PORT_SPEC identity values",
      ok: absent.length === 0,
      detail: detailFor("all present", absent),
    }
  }),

  defineCheck("release workflow uses Aero-Apex/LarpCode-MacOS", async (base) => {
    const text = await source(base, ".github/workflows/release.yml")
    const token = "Aero-Apex/LarpCode-MacOS"

    return {
      name: "release workflow uses Aero-Apex/LarpCode-MacOS",
      ok: text.includes(token),
      detail: text.includes(token) ? token : `missing ${token}`,
    }
  }),

  defineCheck("release workflow has no Windows-only markers", async (base) => {
    const text = await source(base, ".github/workflows/release.yml")
    const forbidden = ["windows-latest", "LarpCode-Setup.exe"]
    const found = forbidden.filter((token) => text.includes(token))

    return {
      name: "release workflow has no Windows-only markers",
      ok: found.length === 0,
      detail: found.length === 0 ? "none found" : `found ${found.join(", ")}`,
    }
  }),

  defineCheck("electron-builder uses ai.larpcode.desktop.macos", async (base) => {
    const text = await source(base, "packages/desktop/electron-builder.config.ts")
    const token = "ai.larpcode.desktop.macos"

    return {
      name: "electron-builder uses ai.larpcode.desktop.macos",
      ok: text.includes(token),
      detail: text.includes(token) ? token : `missing ${token}`,
    }
  }),

  defineCheck("electron-builder uses the new publish URL", async (base) => {
    const text = await source(base, "packages/desktop/electron-builder.config.ts")
    const problems: string[] = []

    if (!text.includes(publishUrl)) problems.push(`missing ${publishUrl}`)
    if (text.includes(oldPublishUrl)) problems.push(`still references ${oldPublishUrl}`)

    return {
      name: "electron-builder uses the new publish URL",
      ok: problems.length === 0,
      detail: problems.length === 0 ? publishUrl : problems.join(", "),
    }
  }),

  defineCheck("install-cli.sh is executable", async (base) => {
    const file = path.join(base, "install-cli.sh")
    const info = await stat(file)
    const executable = (info.mode & 0o111) !== 0

    return {
      name: "install-cli.sh is executable",
      ok: executable,
      detail: `mode ${(info.mode & 0o777).toString(8)}`,
    }
  }),

  defineCheck("install-cli.sh verifies checksums and clears quarantine", async (base) => {
    const text = await source(base, "install-cli.sh")
    const absent = missing(["shasum -a 256", "xattr", "com.apple.quarantine"], text)

    return {
      name: "install-cli.sh verifies checksums and clears quarantine",
      ok: absent.length === 0,
      detail: detailFor("checksum + quarantine handling present", absent),
    }
  }),

  defineCheck("both launchers export the four XDG_* variables", async (base) => {
    const problems: string[] = []

    for (const name of ["LarpCode.command", "larpcode"]) {
      const text = await source(base, path.join("shortcuts", name))

      for (const variable of xdgVariables) {
        const exported = new RegExp(`^\\s*export\\b[^\\n]*\\b${variable}\\b`, "m").test(text)
        const assigned = new RegExp(`^${variable}="[^"]+"`, "m").test(text)

        if (!exported || !assigned) problems.push(`${name}:${variable}`)
      }
    }

    return {
      name: "both launchers export the four XDG_* variables",
      ok: problems.length === 0,
      detail: problems.length === 0 ? "all exported and quoted" : `incomplete ${problems.join(", ")}`,
    }
  }),

  defineCheck("docs/ contains documentation files", async (base) => {
    const dir = path.join(base, "docs")
    const entries = await readdir(dir, { withFileTypes: true })
    const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort()

    return {
      name: "docs/ contains documentation files",
      ok: files.length > 0,
      detail: files.length > 0 ? files.join(", ") : "no files under docs/",
    }
  }),

  defineCheck("docs/ contains no LarpCode-Setup.exe", async (base) => {
    const dir = path.join(base, "docs")
    const entries = await readdir(dir, { withFileTypes: true })
    const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort()
    const found: string[] = []

    for (const file of files) {
      const text = await source(base, path.join("docs", file))

      if (text.includes("LarpCode-Setup.exe")) found.push(file)
    }

    return {
      name: "docs/ contains no LarpCode-Setup.exe",
      ok: files.length > 0 && found.length === 0,
      detail: found.length === 0 ? "no Windows installer asset named" : `found in ${found.join(", ")}`,
    }
  }),
]

export async function runChecks(base = root): Promise<Check[]> {
  const results: Check[] = []

  for (const check of checks) {
    try {
      results.push(await check.run(base))
    } catch (error) {
      results.push({
        name: check.name,
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return results
}

if (import.meta.main) {
  const results = await runChecks()

  console.log("macOS release smoke checks")
  for (const result of results) {
    console.log(`  ${result.ok ? "PASS" : "FAIL"}  ${result.name} — ${result.detail}`)
  }
  const failed = results.filter((result) => !result.ok).length

  console.log(`${results.length - failed}/${results.length} checks passed`)
  if (failed > 0) process.exit(1)
}
