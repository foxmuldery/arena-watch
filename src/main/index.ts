import { app, BrowserWindow, dialog, ipcMain, Menu, Notification, nativeImage, shell, Tray } from 'electron'
import { execFile } from 'child_process'
import { mkdirSync } from 'fs'
import { join } from 'path'
import { BOARDS, fetchBoard, getBoardDef } from './adapters'
import { diffBoard, diffWatch } from './diff'
import { Store } from './store'
import { startDashboardBridge, stopDashboardBridge } from './bridge'
import { buildDashboard } from './dashboard'
import { ICON_DATA_URL, TRAY_ICON_DATA_URL } from './icon-data'
import {
  checkForUpdates,
  downloadUpdate,
  getUpdateState,
  installUpdate,
  onUpdateState,
  setupAutoUpdater
} from './updater'
import { canonicalModel } from '../shared/aliases'
import type { ChangeEvent, Settings, Snapshot, WatchRelated } from '../shared/types'

let win: BrowserWindow | null = null
let tray: Tray | null = null
let store: Store
let timer: NodeJS.Timeout | null = null
let refreshing = false
let quitting = false
const lastErrors: Record<string, string> = {}

const isDev = !app.isPackaged

/** A slow upstream must not stop the whole refresh pass. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} 刷新超时（${Math.round(ms / 1000)} 秒）`)), ms)
    p.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      }
    )
  })
}

function broadcast(channel: string, payload?: unknown): void {
  win?.webContents.send(channel, payload)
}

function createWindow(): void {
  const icon = nativeImage.createFromDataURL(ICON_DATA_URL)
  win = new BrowserWindow({
    width: 400,
    height: 700,
    minWidth: 340,
    minHeight: 480,
    title: 'Arena Watch',
    icon,
    alwaysOnTop: store.settings.alwaysOnTop,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false
    }
  })
  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  // Closing the window hides it to the tray; quitting happens via the tray menu.
  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault()
      win?.hide()
    }
  })
}

function toggleWindow(): void {
  if (!win) return
  if (win.isVisible()) win.hide()
  else {
    win.show()
    win.focus()
  }
}

function createTray(): void {
  // macOS menu bar: a black template image that the system tints for light /
  // dark mode. Windows and Linux keep the coloured app icon.
  const isMac = process.platform === 'darwin'
  const icon = nativeImage
    .createFromDataURL(isMac ? TRAY_ICON_DATA_URL : ICON_DATA_URL)
    .resize({ width: 18, height: 18 })
  if (isMac) icon.setTemplateImage(true)
  tray = new Tray(icon)
  tray.setToolTip('Arena Watch — 模型榜单盯梢')
  const menu = Menu.buildFromTemplate([
    { label: '显示 / 隐藏', click: toggleWindow },
    { label: '立即刷新', click: () => void refreshAll() },
    { label: '桌面小组件…', click: () => openWidgetHost() },
    { type: 'separator' },
    {
      label: '退出 Arena Watch',
      click: () => {
        quitting = true
        app.quit()
      }
    }
  ])
  tray.setContextMenu(menu)
  tray.on('click', toggleWindow)
}

function openWidgetHost(): void {
  if (process.platform !== 'darwin') return
  execFile('open', ['-b', 'app.arenawatch.widgets'], (err) => {
    if (!err) return
    void dialog.showMessageBox({
      type: 'info',
      title: '桌面小组件',
      message: '未找到「Arena Watch Widgets」',
      detail: '请先安装小组件宿主 App（见 docs/widgets.md），启动一次后再从桌面或通知中心添加小组件。'
    })
  })
}

function notify(events: ChangeEvent[]): void {
  if (!store.settings.notifications || events.length === 0) return
  const important = events.filter(
    (e) =>
      e.type === 'leader_changed' ||
      e.type === 'watch_top10_in' ||
      e.type === 'watch_top10_out' ||
      e.type === 'watch_rank' ||
      e.type === 'entered_top10'
  )
  if (important.length === 0) return
  const first = important[0]
  const boardName = getBoardDef(first.boardId).name
  new Notification({
    title: `Arena Watch · ${boardName}`,
    body: important.length === 1 ? first.text : `${first.text}（另有 ${important.length - 1} 条变化）`
  }).show()
}

async function refreshAll(): Promise<{ errors: Record<string, string> }> {
  if (refreshing) return { errors: { ...lastErrors } }
  refreshing = true
  broadcast('refresh:state', true)
  const newEvents: ChangeEvent[] = []
  for (const def of BOARDS) {
    try {
      const entries = await withTimeout(fetchBoard(def.id), 45_000, def.id)
      const prev = store.latestSnapshot(def.id)
      store.pushSnapshot({ boardId: def.id, fetchedAt: new Date().toISOString(), entries })
      delete lastErrors[def.id]
      if (prev) {
        const boardEvents = store.isBoardSubscribed(def.id)
          ? diffBoard(def.id, prev.entries, entries, store.settings)
          : []
        newEvents.push(...boardEvents)
        // A model that is both watched and covered by its subscribed board
        // should not report the same move twice in the feed.
        const covered = new Set(boardEvents.map((e) => `${e.model}\u0000${e.from}\u0000${e.to}`))
        for (const w of store.watchesForBoard(def.id)) {
          const watchEvents = diffWatch(def.id, w.model, prev.entries, entries)
          newEvents.push(...watchEvents.filter((e) => !covered.has(`${e.model}\u0000${e.from}\u0000${e.to}`)))
        }
      }
    } catch (err) {
      lastErrors[def.id] = err instanceof Error ? err.message : String(err)
    }
  }
  if (newEvents.length > 0) store.pushEvents(newEvents)
  store.save()
  notify(newEvents)
  refreshing = false
  broadcast('refresh:state', false)
  broadcast('data:updated')
  return { errors: { ...lastErrors } }
}

function startTimer(): void {
  if (timer) clearInterval(timer)
  const minutes = Math.max(5, store.settings.refreshMinutes)
  timer = setInterval(() => void refreshAll(), minutes * 60_000)
}

function applySettings(patch: Partial<Settings>): Settings {
  const settings = store.updateSettings(patch)
  if (patch.alwaysOnTop !== undefined) win?.setAlwaysOnTop(settings.alwaysOnTop)
  if (patch.refreshMinutes !== undefined) startTimer()
  if (patch.openAtLogin !== undefined) {
    app.setLoginItemSettings({ openAtLogin: settings.openAtLogin })
  }
  return settings
}

function registerIpc(): void {
  ipcMain.handle('boards:list', () =>
    BOARDS.map((def) => {
      const latest = store.latestSnapshot(def.id)
      return {
        ...def,
        subscribed: store.isBoardSubscribed(def.id),
        fetchedAt: latest?.fetchedAt ?? null,
        entryCount: latest?.entries.length ?? 0,
        leader: latest?.entries[0]?.model ?? null,
        error: lastErrors[def.id] ?? null
      }
    })
  )

  ipcMain.handle('boards:snapshot', (_e, boardId: string) => ({
    current: store.latestSnapshot(boardId) ?? null,
    previous: store.previousSnapshot(boardId) ?? null
  }))

  ipcMain.handle('boards:toggleSub', (_e, boardId: string) => {
    getBoardDef(boardId)
    return store.toggleBoardSub(boardId)
  })

  ipcMain.handle('boards:refresh', async () => {
    const { errors } = await refreshAll()
    return { errors }
  })

  ipcMain.handle('watch:list', () => {
    const keyOf = canonicalModel
    const histories = new Map<string, Snapshot[]>()
    for (const def of BOARDS) histories.set(def.id, store.snapshotsFor(def.id))

    return store.watches.map((w) => {
      const key = keyOf(w.model)
      const related: WatchRelated[] = []
      for (const def of BOARDS) {
        const list = histories.get(def.id) ?? []
        const latest = list.length ? list[list.length - 1] : undefined
        if (!latest) continue
        const entry =
          latest.entries.find((e) => e.model === w.model) ??
          latest.entries.find((e) => keyOf(e.model) === key)
        if (!entry) continue
        const history = list.map((s) => {
          const hit = s.entries.find((e) => e.model === entry.model) ?? s.entries.find((e) => keyOf(e.model) === key)
          return hit?.rank ?? null
        })
        related.push({ boardId: def.id, model: entry.model, current: entry, history })
      }
      const own =
        related.find((r) => r.boardId === w.boardId && r.model === w.model) ??
        related.find((r) => r.boardId === w.boardId) ??
        null
      return { ...w, current: own?.current ?? null, history: own?.history ?? [], related }
    })
  })

  ipcMain.handle('watch:add', (_e, boardId: string, model: string) => {
    getBoardDef(boardId)
    return store.addWatch(boardId, model)
  })

  ipcMain.handle('watch:remove', (_e, id: string) => {
    store.removeWatch(id)
    return true
  })

  ipcMain.handle('models:search', (_e, query: string) => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    const results: { boardId: string; model: string; org: string; rank: number; score: number }[] = []
    for (const def of BOARDS) {
      const latest = store.latestSnapshot(def.id)
      if (!latest) continue
      for (const e of latest.entries) {
        if (e.model.toLowerCase().includes(q)) {
          results.push({ boardId: def.id, model: e.model, org: e.org, rank: e.rank, score: e.score })
        }
      }
    }
    return results.slice(0, 40)
  })

  ipcMain.handle('events:list', (_e, limit?: number) => store.listEvents(limit ?? 100))

  ipcMain.handle('settings:get', () => store.settings)
  ipcMain.handle('settings:set', (_e, patch: Partial<Settings>) => applySettings(patch))

  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('update:state', () => getUpdateState())
  ipcMain.handle('update:check', () => checkForUpdates())
  ipcMain.handle('update:download', () => downloadUpdate())
  ipcMain.handle('update:install', () => installUpdate())

  ipcMain.handle('app:openExternal', (_e, url: string) => {
    const allowed = ['lmarena.ai', 'artificialanalysis.ai', 'huggingface.co']
    try {
      const u = new URL(url)
      if (u.protocol === 'https:' && allowed.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`))) {
        void shell.openExternal(url)
        return true
      }
    } catch {
      /* fall through */
    }
    return false
  })
}

app.on('before-quit', () => {
  quitting = true
  stopDashboardBridge()
})

// Keep the app alive in the tray when all windows are closed/hidden.
app.on('window-all-closed', () => {
  /* tray app: intentionally do not quit */
})

void app.whenReady().then(() => {
  // Allow a portable/testing profile without touching the real user data.
  const dataDir = process.env['ARENA_WATCH_DATA_DIR'] || app.getPath('userData')
  if (process.env['ARENA_WATCH_DATA_DIR']) mkdirSync(dataDir, { recursive: true })
  store = new Store(join(dataDir, 'arena-watch.json'))
  startDashboardBridge(() => buildDashboard(store, app.getVersion()))
  registerIpc()
  createWindow()
  createTray()
  app.setLoginItemSettings({ openAtLogin: store.settings.openAtLogin })
  startTimer()
  onUpdateState((s) => broadcast('update:state', s))
  setupAutoUpdater()
  setTimeout(() => void refreshAll(), 2500)

  app.on('activate', () => {
    if (!win) createWindow()
    else win.show()
  })
})
