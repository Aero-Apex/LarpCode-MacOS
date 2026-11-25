import { app } from "electron"

type Channel = "local" | "dev" | "beta" | "prod"

const raw = import.meta.env.OPENCODE_CHANNEL

// LarpCode: default to "local" so the User-Agent sent to opencode.ai matches
// the standalone CLI build (opencode/local/<ver>/opencode-cli). Opencode.ai
// appears to apply looser free-tier limits to "local" (dev-tree) builds than
// to the "dev" nightly channel, which is why the TUI from the same source
// tree worked while the desktop was being rate-limited.
export const CHANNEL: Channel = raw === "local" || raw === "dev" || raw === "beta" || raw === "prod" ? raw : "local"

export const VERSION = app.isPackaged ? app.getVersion() : (process.env.OPENCODE_VERSION ?? app.getVersion())

// Drives app.setName(), which feeds the Windows taskbar/Alt-Tab tooltip,
// the macOS Dock/menu bar label, and the userData folder name. Must match
// electron-builder productName so an upgraded install finds its own state.
const appNames: Record<string, string> = {
  local: "LarpCode macOS",
  dev: "LarpCode macOS Dev",
  beta: "LarpCode macOS Beta",
  prod: "LarpCode macOS",
}

const appIDs: Record<string, string> = {
  local: "ai.larpcode.desktop.macos.dev",
  dev: "ai.larpcode.desktop.macos.dev",
  beta: "ai.larpcode.desktop.macos.beta",
  prod: "ai.larpcode.desktop.macos",
}

// Local renderer/server mode keeps the dev application identity. Fallback
// covers any unexpected CHANNEL value so app.setName never receives undefined.
const isProduction =
  app.isPackaged ||
  CHANNEL === "prod" ||
  (!process.env.OPENCODE_DESKTOP_CLI_DEV && !process.env.ELECTRON_RENDERER_URL && CHANNEL !== "local" && CHANNEL !== "dev")

export const APP_NAME = isProduction ? (appNames[CHANNEL] ?? "LarpCode macOS") : "LarpCode macOS"

export const APP_ID = isProduction ? (appIDs[CHANNEL] ?? "ai.larpcode.desktop.macos") : (appIDs[CHANNEL] ?? "ai.larpcode.desktop.macos.dev")
