import type { Entry } from '../../shared/types'
import { fetchJson } from './http'

/**
 * LMArena adapter.
 *
 * Data source: the official LMArena leaderboard dataset on Hugging Face
 * (`lmarena-ai/leaderboard-dataset`, CC BY 4.0), read through the
 * datasets-server rows API. Rows carry a `category` column; the public
 * leaderboards correspond to the `overall` category of each config, while
 * the text config also publishes `coding` and `chinese` category boards.
 *
 * One refresh touches the text config three times (overall/coding/chinese),
 * so pages are cached per config for a short while. The full config is
 * downloaded once instead of walking to a category block per board.
 */

const ROWS_ENDPOINT = 'https://datasets-server.huggingface.co/rows'
const DATASET = 'lmarena-ai/leaderboard-dataset'
const PAGE_SIZE = 100
const MAX_PAGES = 20
const MAX_ENTRIES = 600
const CACHE_TTL_MS = 10 * 60_000

interface RawRow {
  model_name?: string
  organization?: string
  rating?: number
  score?: number
  vote_count?: number
  observation_count?: number
  rank?: number
  category?: string
}

const rowCache = new Map<string, { at: number; rows: Promise<RawRow[]> }>()

async function fetchPage(config: string, offset: number): Promise<RawRow[]> {
  const url =
    `${ROWS_ENDPOINT}?dataset=${encodeURIComponent(DATASET)}` +
    `&config=${encodeURIComponent(config)}&split=latest&offset=${offset}&length=${PAGE_SIZE}`
  const json = await fetchJson<{ rows?: { row: RawRow }[] }>(url, {
    'User-Agent': 'ArenaWatch/0.1 (+https://github.com/foxmuldery/arena-watch)'
  })
  return (json.rows ?? []).map((r) => r.row)
}

async function fetchAllRows(config: string): Promise<RawRow[]> {
  const rows: RawRow[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    let batch: RawRow[]
    try {
      batch = await fetchPage(config, rows.length)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // Don't grind through every remaining page when the dataset server is
      // throttling us: fail the board fast and keep the rest of the refresh.
      if (/\b429\b/.test(msg)) throw new Error(`LMArena rate limited (${config})`)
      throw err
    }
    if (batch.length === 0) break
    rows.push(...batch)
    if (rows.length >= MAX_ENTRIES * 2) break
    await new Promise((r) => setTimeout(r, 120))
  }
  if (rows.length === 0) throw new Error(`LMArena config "${config}" returned no rows`)
  return rows
}

function loadRows(config: string): Promise<RawRow[]> {
  const hit = rowCache.get(config)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.rows
  const rows = fetchAllRows(config)
  rowCache.set(config, { at: Date.now(), rows })
  rows.catch(() => rowCache.delete(config))
  return rows
}

/**
 * Fetch one LMArena config (e.g. "text", "search", "agent", "image_to_video")
 * and return the entries of the requested category, sorted by rank.
 */
export async function fetchLmArenaBoard(config: string, category = 'overall'): Promise<Entry[]> {
  const rows = await loadRows(config)
  const byModel = new Map<string, Entry>()

  for (const row of rows) {
    if ((row.category ?? 'overall') !== category) continue
    const score = row.rating ?? row.score
    if (!row.model_name || typeof score !== 'number' || typeof row.rank !== 'number') continue
    const prev = byModel.get(row.model_name)
    // A model can appear once per category; keep its best rank if duplicated.
    if (prev && prev.rank <= row.rank) continue
    byModel.set(row.model_name, {
      rank: Math.round(row.rank),
      model: row.model_name,
      org: row.organization ?? '',
      score,
      votes: row.vote_count ?? row.observation_count
    })
  }

  if (byModel.size === 0) {
    throw new Error(`LMArena config "${config}" has no "${category}" category rows`)
  }
  return [...byModel.values()].sort((a, b) => a.rank - b.rank).slice(0, MAX_ENTRIES)
}
