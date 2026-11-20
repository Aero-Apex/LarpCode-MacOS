import { app, ipcMain } from "electron"
import fs from "node:fs"
import path from "node:path"

export function registerThemeHandlers(): void {
  const getThemeFile = () => {
    const stateHome = process.env.XDG_STATE_HOME ?? path.join(app.getPath("userData"), "xdg", "state")
    return path.join(stateHome, "opencode", "theme.json")
  }

  ipcMain.removeHandler("larpcode:theme-get")
  ipcMain.handle("larpcode:theme-get", async () => {
    try {
      const file = getThemeFile()
      if (fs.existsSync(file)) {
        const raw = fs.readFileSync(file, "utf8").trim()
        if (!raw) return null
        const data = JSON.parse(raw) as { theme?: string } | string
        if (typeof data === "string") return data
        if (typeof data?.theme === "string") return data.theme
      }
    } catch {
      /* ignore read failure */
    }
    return null
  })

  ipcMain.removeHandler("larpcode:theme-set")
  ipcMain.handle("larpcode:theme-set", async (_, id: string) => {
    try {
      const file = getThemeFile()
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, JSON.stringify({ theme: id }, null, 2), "utf8")
      return { ok: true }
    } catch {
      return { ok: false }
    }
  })

  ipcMain.removeHandler("larpcode:backdrop-luminance")
  ipcMain.handle("larpcode:backdrop-luminance", async () => {
    return null
  })
}
