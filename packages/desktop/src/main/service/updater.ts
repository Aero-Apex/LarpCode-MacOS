// LarpCode in-app auto-updater.
//
// Polls the public GitHub release feed for `update.json`, downloads the
// sha256-verified payload to a temp dir, and surfaces an in-app toast via the
// renderer. Clicking "Install" closes the app and swaps in the new build:
//
//   - Windows: launches the Inno Setup installer to %TEMP% with /SILENT
//     /CLOSEAPPLICATIONS /FORCEAPPLICATIONS so the running electron is killed,
//     files replaced, and the new version relaunched automatically.
//   - macOS: mounts a verified .dmg (or unzips a verified .zip), copies the
//     bundled .app over /Applications/<App>.app with a rollback backup, detaches
//     and cleans up, then relaunches via `open -a`.
//
// Security properties:
// - The feed is public and unauthenticated. No license key or machine id
//   leaves the app while checking for updates.
// - The downloaded payload's sha256 is verified against the value in
//   `update.json` BEFORE install. A tampered mirror or a corrupted download
//   fails this check and nothing runs.
// - Only an https URL is accepted from the feed. On macOS only .dmg / .zip
//   payloads are accepted, so a stale Windows `.exe` is never spawned there.
//
// What this does NOT do:
// - No delta / block-diff updates (electron-updater supports those; we
//   don't need them for a <400 MB payload, every few weeks).
// - No scheduled auto-install without user consent. The user clicks the
//   toast. We never install silently in the background.

import { app, BrowserWindow, dialog, ipcMain } from "electron"
import crypto from "node:crypto"
import { spawn } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"

const POLL_INITIAL_DELAY_MS = 30_000
const POLL_INTERVAL_MS = 6 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 10_000
const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000
const COMMAND_TIMEOUT_MS = 5 * 60 * 1000

const DEFAULT_UPDATE_FEED = "https://github.com/Aero-Apex/LarpCode-MacOS/releases/latest/download/update.json"

// Trusted local override for QA / staging feeds. Unset in production.
function updateFeedUrl(): string {
  return process.env.LARPCODE_UPDATE_URL || DEFAULT_UPDATE_FEED
}

type UpdateMeta = {
  version: string
  url: string
  sha256: string
}

type ReadyUpdate = {
  meta: UpdateMeta
  installerPath: string
}

type InstallResult = {
  ok: boolean
  message?: string
  appPath?: string
}

let currentUpdate: ReadyUpdate | undefined
let pollTimer: NodeJS.Timeout | undefined
let initialTimer: NodeJS.Timeout | undefined

// Numeric version compare over dot-separated integer segments, left-pads
// missing segments with 0. Returns >0 if `a` is newer, <0 if older, 0 if
// equal. "1.0.2" > "1.0.1". "2.1" > "2.0.99" via left-pad.
// Semver prerelease tags (-rc1, -beta) are ignored; releases are plain
// numeric `1.0.0` versions.
function compareVersions(a: string, b: string): number {
  const stripTag = (v: string) => v.split(/[-+]/, 1)[0]
  const sa = stripTag(a).split(".").map((n) => parseInt(n, 10) || 0)
  const sb = stripTag(b).split(".").map((n) => parseInt(n, 10) || 0)
  const n = Math.max(sa.length, sb.length)
  for (let i = 0; i < n; i++) {
    const d = (sa[i] ?? 0) - (sb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

async function fetchLatest(): Promise<UpdateMeta | undefined> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const resp = await fetch(updateFeedUrl(), {
      signal: controller.signal,
      headers: { "cache-control": "no-store" },
      redirect: "follow",
    })
    if (!resp.ok) return undefined
    const body = (await resp.json()) as {
      version?: string
      url?: string
      sha256?: string
    }
    if (!body?.version || !body.url || !body.sha256) return undefined
    if (!/^https:\/\//.test(body.url)) return undefined
    if (!/^[0-9a-f]{64}$/i.test(body.sha256)) return undefined
    return {
      version: String(body.version),
      url: String(body.url),
      sha256: String(body.sha256).toLowerCase(),
    }
  } catch {
    return undefined
  } finally {
    clearTimeout(timer)
  }
}

// Windows: download the Inno installer to a fresh per-version temp file and
// verify it before it is ever handed to spawn below.
async function downloadVerifyWin(meta: UpdateMeta): Promise<string | undefined> {
  const dir = path.join(os.tmpdir(), "larpcode-update")
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch {
    return undefined
  }
  // Fresh filename per version so a failed previous download doesn't
  // leave a stale file that passes the sha check later for the wrong
  // version string.
  const dest = path.join(dir, `LarpCode-Setup-${meta.version.replace(/[^A-Za-z0-9._-]/g, "_")}.exe`)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS)
  let buf: Buffer
  try {
    const resp = await fetch(meta.url, { signal: controller.signal })
    if (!resp.ok) return undefined
    buf = Buffer.from(await resp.arrayBuffer())
  } catch {
    return undefined
  } finally {
    clearTimeout(timer)
  }

  const actualSha = crypto.createHash("sha256").update(buf).digest("hex")
  if (actualSha !== meta.sha256) {
    // Do NOT persist a corrupt or tampered installer to disk. Silent
    // failure here just means no update offer surfaces — the user stays
    // on the current version safely.
    return undefined
  }

  try {
    fs.writeFileSync(dest, buf, { mode: 0o755 })
  } catch {
    return undefined
  }
  return dest
}

function archiveKind(name: string): "dmg" | "zip" | undefined {
  const lower = name.toLowerCase()
  if (lower.endsWith(".dmg")) return "dmg"
  if (lower.endsWith(".zip")) return "zip"
  return undefined
}

// Only macOS payloads are considered here. In particular an `.exe` left in a
// stale feed must never be downloaded (let alone spawned) on darwin.
function payloadKind(meta: UpdateMeta): "dmg" | "zip" | undefined {
  try {
    return archiveKind(path.basename(new URL(meta.url).pathname))
  } catch {
    return undefined
  }
}

// macOS: download the feed's URL to a fresh per-version temp file and verify
// its sha256. Mount/extract and installation happen only after the user
// confirms, in installMac below.
async function downloadVerifyMac(meta: UpdateMeta): Promise<string | undefined> {
  const kind = payloadKind(meta)
  if (!kind) return undefined

  const dir = path.join(os.tmpdir(), "larpcode-update")
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch {
    return undefined
  }
  const safeVersion = meta.version.replace(/[^A-Za-z0-9._-]/g, "_")
  const dest = path.join(dir, `LarpCode-macOS-${safeVersion}.${kind}`)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS)
  let buf: Buffer
  try {
    const resp = await fetch(meta.url, { signal: controller.signal })
    if (!resp.ok) return undefined
    buf = Buffer.from(await resp.arrayBuffer())
  } catch {
    return undefined
  } finally {
    clearTimeout(timer)
  }

  const actualSha = crypto.createHash("sha256").update(buf).digest("hex")
  if (actualSha !== meta.sha256) {
    // Same rule as Windows: never persist a corrupt or tampered payload and
    // never surface an update offer (so no install can claim success).
    return undefined
  }

  try {
    fs.writeFileSync(dest, buf, { mode: 0o644 })
  } catch {
    return undefined
  }
  return dest
}

async function downloadVerify(meta: UpdateMeta): Promise<string | undefined> {
  if (process.platform === "win32") return downloadVerifyWin(meta)
  if (process.platform === "darwin") return downloadVerifyMac(meta)
  return undefined
}

type CmdResult = {
  code: number | null
  stdout: string
  stderr: string
  error?: string
}

// Small sequential command runner. Uses an argv array so paths containing
// spaces (e.g. "/Volumes/LarpCode macOS") never need shell quoting.
function runCmd(command: string, args: string[]): Promise<CmdResult> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] })
    } catch (e) {
      resolve({ code: null, stdout: "", stderr: "", error: (e as Error).message })
      return
    }
    let stdout = ""
    let stderr = ""
    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk)
    })
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk)
    })
    const timer = setTimeout(() => {
      child.kill()
      finish({ code: null, stdout, stderr, error: `command timed out: ${command}` })
    }, COMMAND_TIMEOUT_MS)
    let done = false
    function finish(result: CmdResult): void {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve(result)
    }
    child.once("error", (cause) => {
      finish({ code: null, stdout, stderr, error: cause.message })
    })
    child.once("close", (code) => {
      finish({ code, stdout, stderr })
    })
  })
}

type AttachInfo = {
  mount?: string
  device?: string
}

function parseAttach(stdout: string): AttachInfo {
  let mount: string | undefined
  let device: string | undefined
  for (const line of stdout.split("\n")) {
    for (const part of line.split("\t")) {
      const candidate = part.trim()
      if (!device && /^\/dev\/disk\d+/.test(candidate)) device = candidate
      if (!mount && candidate.startsWith("/Volumes/") && fs.existsSync(candidate)) mount = candidate
    }
  }
  return { mount, device }
}

function findApp(root: string, depth = 0): string | undefined {
  if (depth > 2) return undefined
  let entries: string[]
  try {
    entries = fs.readdirSync(root)
  } catch {
    return undefined
  }
  for (const name of entries) {
    if (!name.endsWith(".app")) continue
    const candidate = path.join(root, name)
    try {
      if (fs.statSync(candidate).isDirectory()) return candidate
    } catch {
      /* keep looking */
    }
  }
  for (const name of entries) {
    const child = path.join(root, name)
    try {
      if (!fs.statSync(child).isDirectory()) continue
    } catch {
      continue
    }
    const nested = findApp(child, depth + 1)
    if (nested) return nested
  }
  return undefined
}

// Overwrite an existing app safely: move the old bundle aside first, copy the
// new one in, and roll the old bundle back if the copy fails. The app name may
// contain a space ("LarpCode macOS.app"), so it is always quoted via argv.
function copyAppToApplications(srcApp: string): InstallResult {
  const appName = path.basename(srcApp)
  const dest = path.join("/Applications", appName)
  const backup = path.join("/Applications", `.${appName}.larpcode-backup`)
  let movedOld = false
  try {
    if (fs.existsSync(dest)) {
      if (fs.existsSync(backup)) fs.rmSync(backup, { recursive: true, force: true })
      fs.renameSync(dest, backup)
      movedOld = true
    }
    fs.cpSync(srcApp, dest, { recursive: true, force: true })
    if (movedOld) fs.rmSync(backup, { recursive: true, force: true })
    return { ok: true, appPath: dest }
  } catch (e) {
    if (movedOld) {
      try {
        if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true })
        fs.renameSync(backup, dest)
      } catch {
        /* best-effort rollback */
      }
    }
    return { ok: false, message: `failed to install ${appName}: ${(e as Error).message}` }
  }
}

// The confirmed macOS install. Mounts/unzips, copies the .app, and always
// cleans the mount and temp payload via `finally` — including on failure.
async function installMac(payloadPath: string): Promise<InstallResult> {
  const kind = archiveKind(payloadPath)
  if (!kind) return { ok: false, message: "unsupported update payload on macOS" }

  let mountPoint: string | undefined
  let detachTarget: string | undefined
  let extractDir: string | undefined
  try {
    let srcApp: string | undefined
    if (kind === "dmg") {
      const attach = await runCmd("hdiutil", ["attach", "-nobrowse", "-noautoopen", payloadPath])
      if (attach.error || attach.code !== 0) {
        return { ok: false, message: `failed to mount update image: ${attach.error || attach.stderr.trim()}` }
      }
      const mounted = parseAttach(attach.stdout)
      mountPoint = mounted.mount
      detachTarget = mountPoint || mounted.device
      if (!mountPoint) return { ok: false, message: "could not find mounted update volume" }
      srcApp = findApp(mountPoint)
    } else {
      extractDir = path.join(path.dirname(payloadPath), `extract-${path.basename(payloadPath, ".zip")}`)
      try {
        fs.mkdirSync(extractDir, { recursive: true })
      } catch (e) {
        return { ok: false, message: `failed to prepare extraction dir: ${(e as Error).message}` }
      }
      const unzip = await runCmd("unzip", ["-q", payloadPath, "-d", extractDir])
      if (unzip.error || unzip.code !== 0) {
        return { ok: false, message: `failed to extract update: ${unzip.error || unzip.stderr.trim()}` }
      }
      srcApp = findApp(extractDir)
    }
    if (!srcApp) return { ok: false, message: "no .app found in update payload" }

    const copied = copyAppToApplications(srcApp)
    if (!copied.ok) return copied
    return { ok: true, appPath: copied.appPath }
  } finally {
    if (detachTarget) {
      const detached = await runCmd("hdiutil", ["detach", detachTarget])
      if (detached.code !== 0) await runCmd("hdiutil", ["detach", "-force", detachTarget])
    }
    try {
      fs.rmSync(payloadPath, { force: true })
    } catch {
      /* best-effort */
    }
    if (extractDir) {
      try {
        fs.rmSync(extractDir, { recursive: true, force: true })
      } catch {
        /* best-effort */
      }
    }
  }
}

function shQuote(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'"
}

// Detached so it survives app.quit(); the sleep lets the old instance exit
// before `open -a` tries to activate the freshly copied bundle.
function relaunchApp(appPath: string): string | undefined {
  try {
    const child = spawn("sh", ["-c", `sleep 3 && open -a ${shQuote(appPath)}`], {
      detached: true,
      stdio: "ignore",
    })
    child.unref()
    return undefined
  } catch (e) {
    return `failed to relaunch: ${(e as Error).message}`
  }
}

function notifyRenderer(meta: UpdateMeta): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    try {
      // Only the version crosses into the renderer.
      win.webContents.send("larpcode:update-ready", { version: meta.version })
    } catch {
      /* best-effort */
    }
  }
}

async function tryUpdateCheck(): Promise<void> {
  // Already have a downloaded update waiting? Don't re-download; the
  // renderer already has the toast. A newer version would still trigger
  // a fresh download below after we compare.
  const meta = await fetchLatest()
  if (!meta) return
  if (compareVersions(meta.version, app.getVersion()) <= 0) return
  // Skip if this exact version is already downloaded.
  if (currentUpdate && currentUpdate.meta.version === meta.version && fs.existsSync(currentUpdate.installerPath)) {
    notifyRenderer(currentUpdate.meta)
    return
  }
  const installerPath = await downloadVerify(meta)
  if (!installerPath) return
  currentUpdate = { meta, installerPath }
  notifyRenderer(meta)
}

// Called once at app.whenReady. Sets up the poll loop and the
// renderer-facing IPC.
export function registerUpdater(): void {
  // Guard against double-registration — hot-reload / re-entrant boots.
  try {
    ipcMain.removeHandler("larpcode:update-install")
    ipcMain.removeHandler("larpcode:update-status")
    ipcMain.removeHandler("larpcode:update-confirm")
    ipcMain.removeHandler("larpcode:app-version")
  } catch {
    /* no prior */
  }
  if (initialTimer) clearTimeout(initialTimer)
  if (pollTimer) clearInterval(pollTimer)

  initialTimer = setTimeout(() => {
    void tryUpdateCheck().catch(() => undefined)
  }, POLL_INITIAL_DELAY_MS)

  pollTimer = setInterval(() => {
    void tryUpdateCheck().catch(() => undefined)
  }, POLL_INTERVAL_MS)

  ipcMain.handle("larpcode:update-status", async () => {
    if (!currentUpdate) return { ready: false }
    return { ready: true, version: currentUpdate.meta.version }
  })

  // Native confirm dialog. Renderer used to call window.confirm() which is
  // suppressed in sandboxed Chromium contexts under some Electron builds —
  // the dialog never showed, confirm() returned false, the install silently
  // didn't fire. Delivering the prompt through dialog.showMessageBox from
  // main sidesteps the sandbox entirely and always works.
  ipcMain.handle(
    "larpcode:update-confirm",
    async (_, info: { version?: string }) => {
      const version = info?.version || "latest"
      const r = await dialog.showMessageBox({
        type: "question",
        title: "LarpCode update",
        message: `Install version ${version}?`,
        detail: "LarpCode will close and reopen.",
        buttons: ["Install", "Later"],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      })
      return { ok: r.response === 0 }
    },
  )

  // Exposed to the renderer via preload. Powers the subtle top-middle
  // version badge so the user always knows what they're on.
  ipcMain.handle("larpcode:app-version", async () => app.getVersion())

  ipcMain.handle("larpcode:update-install", async () => {
    if (!currentUpdate) return { ok: false, message: "no update ready" }
    // Guardrails against the silent-failure patterns that let a stuck install
    // read as "nothing happens" from the user's side.
    //
    //   1. File check. If antivirus quarantined the installer between
    //      download and click, the path points to nothing. spawn() would
    //      return a ChildProcess and fire 'error' async — we'd quit before
    //      the event surfaces. Catch the missing-file case here synchronously.
    //   2. Spawn error listener with a short wait (Windows). CreateProcess
    //      failures (ENOENT, EACCES, antivirus block) surface on 'error'. Give
    //      it a tick so we don't false-negative the common case while still
    //      catching real failures before app.quit() kills the parent.
    //   3. Early-exit watcher (Windows). UAC denied, Inno Setup "already
    //      running" bail, PE signature refusal — the installer dies within
    //      ~2s with a non-zero exit. app.quit() would still fire, user sees
    //      window die, no new version. Watch for exit while we're still alive.
    if (!fs.existsSync(currentUpdate.installerPath)) {
      return { ok: false, message: "installer missing (was it quarantined by antivirus?)" }
    }

    if (process.platform === "win32") {
      // The installer manifest is asInvoker (per-user), so no elevation is
      // requested or needed. Launch it directly.
      const installerArgs = ["/SILENT", "/SUPPRESSMSGBOXES", "/CLOSEAPPLICATIONS", "/FORCECLOSEAPPLICATIONS"]
      let child: ReturnType<typeof spawn>
      try {
        child = spawn(currentUpdate.installerPath, installerArgs, {
          detached: true,
          stdio: "ignore",
          windowsHide: true,
        })
      } catch (e) {
        return { ok: false, message: `installer failed to start: ${(e as Error).message}` }
      }
      const spawnError = await new Promise<string | undefined>((resolve) => {
        const timer = setTimeout(() => resolve(undefined), 800)
        child.once("error", (cause) => {
          clearTimeout(timer)
          resolve(cause.message)
        })
      })
      if (spawnError) return { ok: false, message: `installer failed to start: ${spawnError}` }
      child.unref()
    } else if (process.platform === "darwin") {
      // Progress / failures are reported through the exact same channels as
      // the Windows path: the `larpcode:update-ready` push (fired when the
      // payload was verified) and this `larpcode:update-install` result.
      const installed = await installMac(currentUpdate.installerPath)
      if (!installed.ok || !installed.appPath) return installed
      const relaunchError = relaunchApp(installed.appPath)
      if (relaunchError) return { ok: false, message: relaunchError }
    } else {
      return { ok: false, message: "updates are not supported on this platform" }
    }

    // The running app has to close itself so the new build can take over;
    // there is no elevation broker on macOS, and Windows launches the
    // per-user installer directly. On macOS the detached `open -a` above
    // fires after this quit.
    currentUpdate = undefined
    setTimeout(() => app.quit(), 1200)
    return { ok: true }
  })

  app.once("will-quit", () => {
    if (initialTimer) clearTimeout(initialTimer)
    if (pollTimer) clearInterval(pollTimer)
  })
}
