import os from "os"
import path from "path"

declare const LARPCODE_CLI_DISTRIBUTION: string | undefined
declare const LARPCODE_DESKTOP_DISTRIBUTION: string | undefined

const home = os.homedir()
// Distribution builds run without the launchers that normally set XDG roots.
// Keep them out of OpenCode's ~/.local/share/opencode and use the same
// LarpCode-owned roots as the desktop app instead.
const standalone = typeof LARPCODE_CLI_DISTRIBUTION === "string" || typeof LARPCODE_DESKTOP_DISTRIBUTION === "string"
const appData = process.env.APPDATA || (home ? path.join(home, "AppData", "Roaming") : undefined)
const standaloneRoot =
  standalone && process.platform === "win32" && appData ? path.join(appData, "ai.larpcode.desktop", "xdg") : undefined
const macRoot =
  standalone && process.platform === "darwin" && home
    ? path.join(home, "Library", "Application Support", "LarpCode macOS", "xdg")
    : undefined
const macCacheRoot =
  standalone && process.platform === "darwin" && home
    ? path.join(home, "Library", "Caches", "LarpCode macOS", "xdg")
    : undefined
const larpcodeRoot = standaloneRoot || macRoot
const fallback = (name: "data" | "cache" | "config" | "state", directory: string | undefined) =>
  larpcodeRoot ? path.join(larpcodeRoot, name) : directory
const data = process.env.XDG_DATA_HOME || fallback("data", home ? path.join(home, ".local", "share") : undefined)
const cache =
  process.env.XDG_CACHE_HOME ||
  (macCacheRoot
    ? path.join(macCacheRoot, "cache")
    : fallback("cache", home ? path.join(home, ".cache") : undefined))
const config = process.env.XDG_CONFIG_HOME || fallback("config", home ? path.join(home, ".config") : undefined)
const state = process.env.XDG_STATE_HOME || fallback("state", home ? path.join(home, ".local", "state") : undefined)

/** The XDG base directories that root opencode's global paths. */
export function roots(app: string) {
  return {
    data: path.join(data!, app),
    cache: path.join(cache!, app),
    config: path.join(config!, app),
    state: path.join(state!, app),
    tmp: path.join(os.tmpdir(), app),
  }
}
