import type { Entry } from '../../shared/types'
import { fetchJson } from './http'

/**
 * LMArena adapter.
 *
 * Data source: the official LMArena leaderboard dataset on Hugging Face
 * (`lmarena-ai/leaderboard-dataset`, CC BY 4.0), read through the
 * datasets-server rows API. Rows carry a `category` column; the public
 * leaderboards correspond to the `overall` category of each config.
 */

const ROWS_ENDPOINT = 'https://datasets-server.huggingface.co/rows'
const DATASET = 'lmarena-ai/leaderboard-dataset'
const PAGE_SIZE = 100
const MAX_PAGES = 40
const MAX_ENTRIES = 600

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

async function fetchPage(config: string, offset: number): Promise<RawRow[]> {
  const url =
    `${ROWS_ENDPOINT}?dataset=${encodeURIComponent(DATASET)}` +
    `&config=${encodeURIComponent(config)}&split=latest&offset=${offset}&length=${PAGE_SIZE}`
  const json = await fetchJson<{ rows?: { row: RawRow }[] }>(url, {
    'User-Agent': 'ArenaWatch/0.1 (+https://github.com/foxmuldery/arena-watch)'
  })
  return (json.rows ?? []).map((r) => r.row)
}

/**
 * Fetch one LMArena config (e.g. "text", "search", "agent", "image_to_video")
 * and return the entries of the requested category, sorted by rank.
 */
export async function fetchLmArenaBoard(config: string, category = 'overall'): Promise<Entry[]> {
  const byModel = new Map<string, Entry>()
  let offset = 0
  let sawTarget = false

  for (let page = 0; page < MAX_PAGES; page++) {
    const rows = await fetchPage(config, offset)
    if (rows.length === 0) break
    offset += rows.length

    let addedThisPage = 0
    for (const row of rows) {
      if ((row.category ?? 'overall') !== category) continue
      const score = row.rating ?? row.score
      if (!row.model_name || typeof score !== 'number' || typeof row.rank !== 'number') continue
      byModel.set(row.model_name, {
        rank: Math.round(row.rank),
        model: row.model_name,
        org: row.organization ?? '',
        score,
        votes: row.vote_count ?? row.observation_count
      })
      addedThisPage++
    }
    if (addedThisPage > 0) sawTarget = true
    // Rows are grouped by category; once we have seen the target category and
    // a full page adds none of it, we have walked past its block.
    if (sawTarget && addedThisPage === 0) break
    if (byModel.size >= MAX_ENTRIES) break
  }

  if (!sawTarget) {
    throw new Error(`LMArena config "${config}" has no "${category}" category rows`)
  }
  return [...byModel.values()].sort((a, b) => a.rank - b.rank).slice(0, MAX_ENTRIES)
}
