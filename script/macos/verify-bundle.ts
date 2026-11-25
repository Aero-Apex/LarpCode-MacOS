#!/usr/bin/env bun
// Verifies a staged macOS app bundle. Used after the electron-builder staging
// step (and in CI) to fail early when a bundle is structurally incomplete.
//
// Usage: bun script/macos/verify-bundle.ts [path/to/LarpCode\ macOS.app]
import { readFile, stat } from "node:fs/promises"
import path from "node:path"

export const EXPECTED_IDENTIFIER = "ai.larpcode.desktop.macos"
export const DEFAULT_BUNDLE = path.join("dist", "LarpCode macOS.app")

export interface CheckResult {
  label: string
  ok: boolean
  detail: string
}

function describe(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

async function fileCheck(label: string, target: string, executable = false): Promise<CheckResult> {
  try {
    const info = await stat(target)
    if (!info.isFile()) return { label, ok: false, detail: `${target} is not a regular file` }
    if (executable && (info.mode & 0o111) === 0) return { label, ok: false, detail: `${target} is not executable` }
    return { label, ok: true, detail: target }
  } catch {
    return { label, ok: false, detail: `${target} is missing` }
  }
}

function readBundleIdentifier(text: string): string | undefined {
  // Info.plist emitted by electron-builder is an XML plist with key/string pairs.
  const match = text.match(/<key>\s*CFBundleIdentifier\s*<\/key>\s*<string>([\s\S]*?)<\/string>/)
  return match?.[1]?.trim()
}

export async function checkBundle(bundle: string): Promise<CheckResult[]> {
  const contents = path.join(bundle, "Contents")
  const plist = path.join(contents, "Info.plist")
  const identifierLabel = `CFBundleIdentifier == ${EXPECTED_IDENTIFIER}`
  const results: CheckResult[] = []

  const plistCheck = await fileCheck("Contents/Info.plist exists", plist)
  results.push(plistCheck)

  if (!plistCheck.ok) {
    results.push({ label: identifierLabel, ok: false, detail: "Info.plist is missing" })
  } else {
    let text: string | undefined
    try {
      text = await readFile(plist, "utf8")
    } catch (error) {
      results.push({ label: identifierLabel, ok: false, detail: `cannot read Info.plist: ${describe(error)}` })
    }
    if (text !== undefined) {
      const identifier = readBundleIdentifier(text)
      results.push({
        label: identifierLabel,
        ok: identifier === EXPECTED_IDENTIFIER,
        detail: identifier === undefined ? "CFBundleIdentifier not found" : `found ${identifier}`,
      })
    }
  }

  const appBinary = path.join(contents, "MacOS", "LarpCode macOS")
  const cliBinary = path.join(contents, "Resources", "opencode-cli")
  results.push(await fileCheck("Contents/MacOS/LarpCode macOS is executable", appBinary, true))
  results.push(await fileCheck("Contents/Resources/opencode-cli is executable", cliBinary, true))
  results.push(await fileCheck("Contents/Resources/icon.icns exists", path.join(contents, "Resources", "icon.icns")))

  return results
}

function formatResult(result: CheckResult) {
  const status = result.ok ? "PASS" : "FAIL"
  return result.ok ? `  ${status}  ${result.label}` : `  ${status}  ${result.label}: ${result.detail}`
}

if (import.meta.main) {
  const bundle = path.resolve(process.cwd(), process.argv[2] ?? DEFAULT_BUNDLE)
  const results = await checkBundle(bundle)
  for (const result of results) console.log(formatResult(result))

  const failed = results.filter((result) => !result.ok).length
  if (failed === 0) {
    console.log(`PASS: bundle verified at ${bundle}`)
  } else {
    console.log(`FAIL: ${failed} of ${results.length} checks failed for ${bundle}`)
    process.exitCode = 1
  }
}
