import type { Entry } from '../../shared/types'
import { fetchText } from './http'

/**
 * SWE-bench Verified adapter.
 *
 * The official leaderboard page embeds its full dataset as
 * `<script id="leaderboard-data">[...]</script>`; each group is a
 * leaderboard ("Verified", "Lite", "Multilingual", …) whose results are
 * one row per model + agent scaffold. We keep the best `resolved` score
 * per model, which is how the board reads as a model leaderboard.
 */

const PAGE_URL = 'https://www.swebench.com/'
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

interface SweRow {
  model_display?: string
  model_org?: string
  agent?: string
  resolved?: number
  tags?: string[]
}

export async function fetchSweBenchVerified(): Promise<Entry[]> {
  const html = await fetchText(PAGE_URL, { 'User-Agent': UA, Accept: 'text/html' })
  const match = /<script[^>]*id="leaderboard-data"[^>]*>([\s\S]*?)<\/script>/.exec(html)
  if (!match) {
    throw new Error('SWE-bench: embedded leaderboard-data block not found — page structure may have changed')
  }
  let groups: { name?: string; results?: SweRow[] }[]
  try {
    groups = JSON.parse(match[1]) as typeof groups
  } catch {
    throw new Error('SWE-bench: leaderboard-data is not valid JSON — page structure may have changed')
  }
  const group = groups.find((g) => g.name === 'Verified')
  if (!group?.results?.length) {
    throw new Error('SWE-bench: "Verified" leaderboard not found in page data')
  }

  const best = new Map<string, SweRow>()
  for (const row of group.results) {
    if (!row.model_display || row.model_display === 'Multiple') continue
    if (typeof row.resolved !== 'number' || !Number.isFinite(row.resolved)) continue
    const prev = best.get(row.model_display)
    if (!prev || (prev.resolved ?? 0) < row.resolved) best.set(row.model_display, row)
  }

  const entries: Entry[] = [...best.values()]
    .sort((a, b) => (b.resolved ?? 0) - (a.resolved ?? 0) || (a.model_display ?? '').localeCompare(b.model_display ?? ''))
    .map((row, i) => ({
      rank: i + 1,
      model: row.model_display as string,
      org: row.model_org ?? '',
      score: row.resolved as number
    }))

  if (entries.length < 20) {
    throw new Error(`SWE-bench parse yielded only ${entries.length} models — page structure may have changed`)
  }
  return entries
}
