import { readFileSync, writeFileSync, renameSync } from 'fs'
import {
  DEFAULT_SETTINGS,
  type ChangeEvent,
  type Settings,
  type Snapshot,
  type WatchItem
} from '../shared/types'

interface StoreData {
  settings: Settings
  boardSubs: string[]
  watches: WatchItem[]
  snapshots: Record<string, Snapshot[]>
  events: ChangeEvent[]
}

const MAX_SNAPSHOTS_PER_BOARD = 60
const MAX_EVENTS = 800

const emptyData = (): StoreData => ({
  settings: { ...DEFAULT_SETTINGS },
  boardSubs: [],
  watches: [],
  snapshots: {},
  events: []
})

export class Store {
  private data: StoreData = emptyData()

  constructor(private filePath: string) {
    this.load()
  }

  load(): void {
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf-8')) as Partial<StoreData>
      this.data = {
        ...emptyData(),
        ...parsed,
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) }
      }
    } catch {
      this.data = emptyData()
    }
  }

  save(): void {
    const tmp = `${this.filePath}.tmp`
    writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf-8')
    renameSync(tmp, this.filePath)
  }

  get settings(): Settings {
    return this.data.settings
  }

  updateSettings(patch: Partial<Settings>): Settings {
    this.data.settings = { ...this.data.settings, ...patch }
    this.save()
    return this.data.settings
  }

  isBoardSubscribed(boardId: string): boolean {
    return this.data.boardSubs.includes(boardId)
  }

  toggleBoardSub(boardId: string): boolean {
    const idx = this.data.boardSubs.indexOf(boardId)
    if (idx >= 0) {
      this.data.boardSubs.splice(idx, 1)
      this.save()
      return false
    }
    this.data.boardSubs.push(boardId)
    this.save()
    return true
  }

  get watches(): WatchItem[] {
    return this.data.watches
  }

  watchesForBoard(boardId: string): WatchItem[] {
    return this.data.watches.filter((w) => w.boardId === boardId)
  }

  addWatch(boardId: string, model: string): WatchItem {
    const existing = this.data.watches.find((w) => w.boardId === boardId && w.model === model)
    if (existing) return existing
    const item: WatchItem = {
      id: `${boardId}:${model}`,
      boardId,
      model
    }
    this.data.watches.push(item)
    this.save()
    return item
  }

  removeWatch(id: string): void {
    this.data.watches = this.data.watches.filter((w) => w.id !== id)
    this.save()
  }

  pushSnapshot(snapshot: Snapshot): void {
    const list = this.data.snapshots[snapshot.boardId] ?? []
    list.push(snapshot)
    while (list.length > MAX_SNAPSHOTS_PER_BOARD) list.shift()
    this.data.snapshots[snapshot.boardId] = list
  }

  latestSnapshot(boardId: string): Snapshot | undefined {
    const list = this.data.snapshots[boardId]
    return list && list.length ? list[list.length - 1] : undefined
  }

  previousSnapshot(boardId: string): Snapshot | undefined {
    const list = this.data.snapshots[boardId]
    return list && list.length >= 2 ? list[list.length - 2] : undefined
  }

  snapshotsFor(boardId: string): Snapshot[] {
    return this.data.snapshots[boardId] ?? []
  }

  pushEvents(events: ChangeEvent[]): void {
    this.data.events.push(...events)
    if (this.data.events.length > MAX_EVENTS) {
      this.data.events = this.data.events.slice(-MAX_EVENTS)
    }
  }

  listEvents(limit = 100): ChangeEvent[] {
    return [...this.data.events].reverse().slice(0, limit)
  }
}
