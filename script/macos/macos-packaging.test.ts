import { describe, expect, test } from "bun:test"
import path from "node:path"

const root = path.resolve(import.meta.dir, "..", "..")
const script = (name: string) => path.resolve(import.meta.dir, "..", name)
const shortcut = (name: string) => path.resolve(root, "shortcuts", name)

async function source(file: string) {
  const text = await Bun.file(file).text()
  expect(text.length, `${path.relative(root, file)} must exist and be non-empty`).toBeGreaterThan(0)
  return text
}

const deliveryScripts = ["stage-macos.ts", "release-assets.ts"]

describe("macOS delivery scripts", () => {
  test("use the PORT_SPEC release asset names", async () => {
    for (const name of deliveryScripts) {
      const text = await source(script(name))
      for (const asset of ["LarpCode-macOS-", "update.json", "cli.json", "SHA256SUMS"]) {
        expect(text, `${name} must reference ${asset}`).toContain(asset)
      }
    }
  })

  test("never fall back to Windows-only delivery assets", async () => {
    for (const name of deliveryScripts) {
      const text = await source(script(name))
      for (const windowsAsset of ["LarpCode-Setup.exe", "install-cli.ps1"]) {
        expect(text, `${name} must not reference ${windowsAsset}`).not.toContain(windowsAsset)
      }
    }
  })
})

describe("install-cli.sh", () => {
  const candidates = [
    script("install-cli.sh"),
    path.resolve(import.meta.dir, "install-cli.sh"),
    path.resolve(root, "install-cli.sh"),
    path.resolve(root, "installer", "macos", "install-cli.sh"),
    path.resolve(root, "installer", "install-cli.sh"),
  ]

  test("covers checksums, quarantine, both architectures and the canonical repo", async () => {
    const present = candidates.filter((file) => Bun.file(file).exists())
    expect(present.length, `install-cli.sh must exist in one of: ${candidates.join(", ")}`).toBeGreaterThan(0)
    const text = await source(present[0]!)
    for (const token of ["shasum", "xattr", "arm64", "x64", "https://github.com/Aero-Apex/LarpCode-MacOS"]) {
      expect(text, `install-cli.sh must contain ${token}`).toContain(token)
    }
  })
})

describe("macOS launchers", () => {
  test("LarpCode.command and larpcode export quoted XDG paths", async () => {
    for (const name of ["LarpCode.command", "larpcode"]) {
      const text = await source(shortcut(name))
      for (const variable of ["XDG_DATA_HOME", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_STATE_HOME"]) {
        expect(text, `${name} must export ${variable}`).toMatch(new RegExp(`\\bexport\\b[^\\n]*\\b${variable}\\b`))
        expect(text, `${name} must assign ${variable} to a quoted path`).toMatch(
          new RegExp(`^${variable}="[^"]+"$`, "m"),
        )
      }
      for (const variable of ["XDG_DATA_HOME", "XDG_CONFIG_HOME", "XDG_STATE_HOME"]) {
        expect(text, `${name} must keep ${variable} under "Application Support"`).toMatch(
          new RegExp(`^${variable}="[^"]*Application Support/LarpCode macOS[^"]*"$`, "m"),
        )
      }
    }
  })
})
