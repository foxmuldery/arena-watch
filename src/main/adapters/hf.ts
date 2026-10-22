import type { Entry } from '../../shared/types'
import { fetchJson } from './http'

/**
 * Hugging Face Open LLM Leaderboard adapter.
 *
 * The public Space exposes the leaderboard data as JSON at
 * `/api/leaderboard/formatted` (fastapi backend, ~0.9 MB gzipped). Each
 * record is one evaluation run; the leaderboard shows one row per model,
 * so we keep the best `model.average_score` per model name.
 *
 * The leaderboard is archived (last evaluation 2025-03); it stays useful as
 * a historical open-weights reference. Fetch is capped to the top 500 to
 * keep the snapshot store small.
 */

const API = 'https://open-llm-leaderboard-open-llm-leaderboard.hf.space/api/leaderboard/formatted'
const UA = 'ArenaWatch/0.1 (+https://github.com/foxmuldery/arena-watch)'
const MAX_ENTRIES = 500

interface HfRecord {
  model?: {
    name?: string
    average_score?: number
    has_chat_template?: boolean
  }
  features?: {
    is_flagged?: boolean
    is_not_available_on_hub?: boolean
  }
}

export async function fetchHfOpenLlm(): Promise<Entry[]> {
  const data = await fetchJson<HfRecord[]>(API, { 'User-Agent': UA })
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('HF Open LLM: API returned no records')
  }

  const best = new Map<string, number>()
  for (const item of data) {
    const name = item.model?.name
    const score = item.model?.average_score
    if (!name || typeof score !== 'number' || !Number.isFinite(score) || score <= 0) continue
    if (item.features?.is_flagged) continue
    const prev = best.get(name)
    if (prev === undefined || score > prev) best.set(name, score)
  }

  const entries: Entry[] = [...best.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_ENTRIES)
    .map(([model, score], i) => ({
      rank: i + 1,
      model,
      org: model.includes('/') ? model.slice(0, model.indexOf('/')) : '',
      score: Math.round(score * 100) / 100
    }))

  if (entries.length < 50) {
    throw new Error(`HF Open LLM parse yielded only ${entries.length} models — API shape may have changed`)
  }
  return entries
}
