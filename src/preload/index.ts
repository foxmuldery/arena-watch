import { contextBridge, ipcRenderer } from 'electron'
import type { Settings, UpdateState } from '../shared/types'

const api = {
  listBoards: () => ipcRenderer.invoke('boards:list'),
  getSnapshot: (boardId: string) => ipcRenderer.invoke('boards:snapshot', boardId),
  toggleSub: (boardId: string) => ipcRenderer.invoke('boards:toggleSub', boardId),
  refresh: () => ipcRenderer.invoke('boards:refresh'),
  listWatches: () => ipcRenderer.invoke('watch:list'),
  addWatch: (boardId: string, model: string) => ipcRenderer.invoke('watch:add', boardId, model),
  removeWatch: (id: string) => ipcRenderer.invoke('watch:remove', id),
  searchModels: (query: string) => ipcRenderer.invoke('models:search', query),
  listEvents: (limit?: number) => ipcRenderer.invoke('events:list', limit),
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  setSettings: (patch: Partial<Settings>): Promise<Settings> => ipcRenderer.invoke('settings:set', patch),
  openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url),
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
  getUpdateState: (): Promise<UpdateState> => ipcRenderer.invoke('update:state'),
  checkForUpdates: (): Promise<UpdateState> => ipcRenderer.invoke('update:check'),
  downloadUpdate: (): Promise<UpdateState> => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateState: (cb: (s: UpdateState) => void) => {
    ipcRenderer.on('update:state', (_e, s: UpdateState) => cb(s))
  },
  onUpdated: (cb: () => void) => {
    ipcRenderer.on('data:updated', () => cb())
  },
  onRefreshing: (cb: (refreshing: boolean) => void) => {
    ipcRenderer.on('refresh:state', (_e, refreshing: boolean) => cb(refreshing))
  }
}

contextBridge.exposeInMainWorld('arena', api)

export type ArenaApi = typeof api
