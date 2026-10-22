import { app, BrowserWindow, ipcMain, Menu, Notification, nativeImage, shell, Tray } from 'electron'
import { join } from 'path'
import { BOARDS, fetchBoard, getBoardDef } from './adapters'
import { diffBoard, diffWatch } from './diff'
import { Store } from './store'
import { ICON_DATA_URL } from './icon-data'
import type { ChangeEvent, Settings } from '../shared/types'

let win: BrowserWindow | null = null
let tray: Tray | null = null
let store: Store
let timer: NodeJS.Timeout | null = null
let refreshing = false
let quitting = false
const lastErrors: Record<string, string> = {}

const isDev = !app.isPackaged

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
  const icon = nativeImage.createFromDataURL(ICON_DATA_URL).resize({ width: 18, height: 18 })
  tray = new Tray(icon)
  tray.setToolTip('Arena Watch — 模型榜单盯梢')
  const menu = Menu.buildFromTemplate([
    { label: '显示 / 隐藏', click: toggleWindow },
    { label: '立即刷新', click: () => void refreshAll() },
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
      const entries = await fetchBoard(def.id)
      const prev = store.latestSnapshot(def.id)
      store.pushSnapshot({ boardId: def.id, fetchedAt: new Date().toISOString(), entries })
      delete lastErrors[def.id]
      if (prev) {
        if (store.isBoardSubscribed(def.id)) {
          newEvents.push(...diffBoard(def.id, prev.entries, entries, store.settings))
        }
        for (const w of store.watchesForBoard(def.id)) {
          newEvents.push(...diffWatch(def.id, w.model, prev.entries, entries))
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

  ipcMain.handle('watch:list', () =>
    store.watches.map((w) => {
      const latest = store.latestSnapshot(w.boardId)
      const current = latest?.entries.find((e) => e.model === w.model) ?? null
      const history = store
        .snapshotsFor(w.boardId)
        .map((s) => s.entries.find((e) => e.model === w.model)?.rank ?? null)
      return { ...w, current, history }
    })
  )

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
})

// Keep the app alive in the tray when all windows are closed/hidden.
app.on('window-all-closed', () => {
  /* tray app: intentionally do not quit */
})

void app.whenReady().then(() => {
  store = new Store(join(app.getPath('userData'), 'arena-watch.json'))
  registerIpc()
  createWindow()
  createTray()
  app.setLoginItemSettings({ openAtLogin: store.settings.openAtLogin })
  startTimer()
  setTimeout(() => void refreshAll(), 2500)

  app.on('activate', () => {
    if (!win) createWindow()
    else win.show()
  })
})
