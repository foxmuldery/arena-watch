export interface BoardDef {
  id: string
  /** Display name (Chinese) */
  name: string
  nameEn: string
  source: 'lmarena' | 'artificial-analysis'
  /** Score column label, e.g. "Elo" or "Index" */
  scoreLabel: string
  /** Human-facing leaderboard page */
  url: string
}

export interface Entry {
  rank: number
  model: string
  org: string
  score: number
  votes?: number
}

export interface Snapshot {
  boardId: string
  /** ISO timestamp of when this snapshot was fetched */
  fetchedAt: string
  entries: Entry[]
}

export type ChangeType =
  | 'leader_changed'
  | 'entered_top10'
  | 'left_top10'
  | 'rank_changed'
  | 'score_jump'
  | 'watch_rank'
  | 'watch_top10_in'
  | 'watch_top10_out'

export interface ChangeEvent {
  id: string
  boardId: string
  type: ChangeType
  model: string
  from?: number
  to?: number
  scoreFrom?: number
  scoreTo?: number
  /** ISO timestamp */
  at: string
  /** Human-readable one-liner (Chinese) */
  text: string
}

export interface WatchItem {
  id: string
  boardId: string
  model: string
}

export interface Settings {
  /** Auto-refresh interval in minutes */
  refreshMinutes: number
  /** Score change that counts as a "jump" event */
  scoreJumpThreshold: number
  alwaysOnTop: boolean
  notifications: boolean
  openAtLogin: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  refreshMinutes: 30,
  scoreJumpThreshold: 5,
  alwaysOnTop: true,
  notifications: true,
  openAtLogin: false
}
