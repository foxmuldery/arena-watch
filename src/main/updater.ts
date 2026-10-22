import { app, Notification } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateState } from '../shared/types'

/**
 * Auto-update against GitHub Releases (electron-updater + electron-builder
 * publish config). macOS updates require a signed app: Squirrel.Mac refuses
 * to install an unsigned update, so the UI reports the error instead of
 * failing silently.
 */

let state: UpdateState = { state: app.isPackaged ? 'idle' : 'dev' }
const listeners: ((s: UpdateState) => void)[] = []
let started = false

function set(patch: Partial<UpdateState>): void {
  state = { ...state, ...patch }
  for (const fn of listeners) fn(state)
}

export function getUpdateState(): UpdateState {
  return state
}

export function onUpdateState(fn: (s: UpdateState) => void): void {
  listeners.push(fn)
}

function errText(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  if (/APPIMAGE/i.test(raw)) {
    return '当前安装方式不支持自动更新（AppImage 需要以 AppImage 方式运行）'
  }
  if (/code signature|signature|ShipIt/i.test(raw)) {
    return '更新安装失败：macOS 需要签名的应用才能自动更新'
  }
  return raw
}

export function setupAutoUpdater(): void {
  if (started) return
  started = true
  if (!app.isPackaged) return

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  // Only ever talk to this project's GitHub Releases feed.
  autoUpdater.allowPrerelease = false
  autoUpdater.allowDowngrade = false

  autoUpdater.on('checking-for-update', () => set({ state: 'checking', message: '正在检查更新…' }))
  autoUpdater.on('update-available', (info) =>
    set({ state: 'available', version: info.version, message: `发现新版本 v${info.version}` })
  )
  autoUpdater.on('update-not-available', () =>
    set({ state: 'not-available', message: '已是最新版本' })
  )
  autoUpdater.on('download-progress', (p) =>
    set({
      state: 'downloading',
      percent: Math.round(p.percent),
      message: `正在下载更新… ${Math.round(p.percent)}%`
    })
  )
  autoUpdater.on('update-downloaded', (info) => {
    set({ state: 'downloaded', version: info.version, message: `v${info.version} 已下载，重启后安装` })
    if (Notification.isSupported()) {
      new Notification({
        title: 'Arena Watch 更新就绪',
        body: `v${info.version} 已下载，重启应用即可完成安装。`
      }).show()
    }
  })
  autoUpdater.on('error', (err) => set({ state: 'error', message: errText(err) }))

  // Check shortly after launch, then every 6 hours.
  setTimeout(() => void checkForUpdates(), 20_000)
  setInterval(() => void checkForUpdates(), 6 * 60 * 60_000)
}

export async function checkForUpdates(): Promise<UpdateState> {
  if (!app.isPackaged) {
    set({ state: 'dev', message: '开发模式下不检查更新' })
    return state
  }
  try {
    set({ state: 'checking', message: '正在检查更新…', percent: undefined })
    await autoUpdater.checkForUpdates()
  } catch (err) {
    set({ state: 'error', message: errText(err) })
  }
  return state
}

export async function downloadUpdate(): Promise<UpdateState> {
  if (!app.isPackaged) return state
  try {
    set({ state: 'downloading', percent: 0, message: '正在下载更新…' })
    await autoUpdater.downloadUpdate()
  } catch (err) {
    set({ state: 'error', message: errText(err) })
  }
  return state
}

export function installUpdate(): void {
  if (!app.isPackaged) return
  // Quit and let the platform installer swap in the new version.
  setImmediate(() => autoUpdater.quitAndInstall())
}
