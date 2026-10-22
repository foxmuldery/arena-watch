import { canonicalModel } from '../shared/aliases'
import { BOARDS } from './adapters'
import type { Store } from './store'

/**
 * Compact read-only payload for the native macOS widgets.
 *
 * The WidgetKit extension is sandboxed and cannot read Electron's userData
 * directory, so the main process serves this over loopback HTTP instead.
 * The payload is intentionally small (top 10 per board, 10 watch groups,
 * 8 events): widgets are refreshed on a system-controlled timeline and only
 * need enough data for their cards.
 */

export const BRIDGE_PORT = 47832

export interface DashboardEntry {
  rank: number
  model: string
  org: string
  score: number
}

export interface DashboardBoard {
  id: string
  name: string
  nameEn: string
  scoreLabel: string
  updatedAt: string | null
  entryCount: number
  entries: DashboardEntry[]
}

export interface DashboardWatchRank {
  boardId: string
  boardName: string
  rank: number
  score: number
}

export interface DashboardWatch {
  model: string
  primaryBoardId: string
  ranks: DashboardWatchRank[]
}

export interface DashboardEvent {
  id: string
  type: string
  text: string
  boardId: string
  boardName: string
  at: string
}

export interface DashboardPayload {
  updatedAt: string | null
  appVersion: string
  boards: DashboardBoard[]
  watches: DashboardWatch[]
  events: DashboardEvent[]
}

export function buildDashboard(store: Store, appVersion: string): DashboardPayload {
  const boards: DashboardBoard[] = []
  const boardNames = new Map<string, string>()
  let updatedAt: string | null = null

  for (const def of BOARDS) {
    boardNames.set(def.id, def.name)
    const latest = store.latestSnapshot(def.id)
    if (!latest) continue
    if (!updatedAt || latest.fetchedAt > updatedAt) updatedAt = latest.fetchedAt
    boards.push({
      id: def.id,
      name: def.name,
      nameEn: def.nameEn,
      scoreLabel: def.scoreLabel,
      updatedAt: latest.fetchedAt,
      entryCount: latest.entries.length,
      entries: latest.entries.slice(0, 10).map((e) => ({
        rank: e.rank,
        model: e.model,
        org: e.org,
        score: e.score
      }))
    })
  }

  // Group watches the same way the desktop window does, so the widget shows
  // one card per model with its rank on every board that knows it.
  const groups = new Map<string, DashboardWatch>()
  for (const w of store.watches) {
    if (groups.size >= 10 && !groups.has(canonicalModel(w.model))) break
    const key = canonicalModel(w.model)
    let group = groups.get(key)
    if (!group) {
      group = { model: w.model, primaryBoardId: w.boardId, ranks: [] }
      groups.set(key, group)
    }
    for (const def of BOARDS) {
      const latest = store.latestSnapshot(def.id)
      if (!latest) continue
      if (group.ranks.some((r) => r.boardId === def.id)) continue
      const entry =
        latest.entries.find((e) => e.model === w.model) ??
        latest.entries.find((e) => canonicalModel(e.model) === key)
      if (!entry) continue
      group.ranks.push({
        boardId: def.id,
        boardName: def.name,
        rank: entry.rank,
        score: entry.score
      })
    }
  }

  const events: DashboardEvent[] = store.listEvents(8).map((e) => ({
    id: e.id,
    type: e.type,
    text: e.text,
    boardId: e.boardId,
    boardName: boardNames.get(e.boardId) ?? e.boardId,
    at: e.at
  }))

  return { updatedAt, appVersion, boards, watches: [...groups.values()], events }
}
