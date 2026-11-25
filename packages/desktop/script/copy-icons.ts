import { $ } from "bun"
import { cp } from "node:fs/promises"
import { relative } from "node:path"
import { resolveChannel } from "./utils"

const arg = process.argv[2]

const channel = arg === "dev" || arg === "beta" || arg === "prod" ? arg : resolveChannel()

// LarpCode: "local" channel reuses the "dev" icon set — there's no separate
// local asset dir, and we only care about the channel string for the outgoing
// User-Agent, not the icon branding.
const iconChannel = channel === "local" ? "dev" : channel

const src = `./icons/${iconChannel}`

const dest = "resources/icons"

// LarpCode: macOS builds only need these four entries. The ICO, Android and iOS
// assets are Windows/mobile leftovers that just bloat the packaged app, so filter
// them out on darwin and keep the full copy for Windows and Linux.
const macosIcons = new Set(["icon.icns", "icon.icon", "dock.png", "icon.png"])

function darwinFilter(source: string) {
  const entry = relative(src, source)

  if (!entry) return true

  return macosIcons.has(entry.split(/[\\/]/)[0])
}

await $`rm -rf ${dest}`

await cp(src, dest, { recursive: true, filter: process.platform === "darwin" ? darwinFilter : undefined })

console.log(`Copied ${iconChannel} icons from ${src} to ${dest} (channel=${channel})`)
