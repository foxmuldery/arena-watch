import type { Entry } from '../../shared/types'
import { fetchText } from './http'

/**
 * Artificial Analysis adapter (unofficial).
 *
 * Artificial Analysis does not offer a free public API for these boards, so
 * this adapter reads the public leaderboard pages and extracts the model
 * records embedded in the page payload. It is best-effort: if the page
 * structure changes, parsing fails loudly instead of returning wrong data
 * (validated against the expected #1 model shape in scripts/smoke.ts).
 */

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

async function fetchHtml(url: string): Promise<string> {
  return fetchText(url, { 'User-Agent': UA, Accept: 'text/html' })
}

/** The page payload escapes quotes as \" — normalize once for regex parsing. */
function unescapePayload(html: string): string {
  return html.replace(/\\"/g, '"')
}

function toEntries(raw: { model: string; org: string; score: number }[]): Entry[] {
  const best = new Map<string, { model: string; org: string; score: number }>()
  for (const item of raw) {
    const prev = best.get(item.model)
    if (!prev || item.score > prev.score) best.set(item.model, item)
  }
  return [...best.values()]
    .sort((a, b) => b.score - a.score)
    .map((item, i) => ({ rank: i + 1, model: item.model, org: item.org, score: item.score }))
}

/** LLM leaderboard ranked by Intelligence Index. */
export async function fetchAaIntelligence(): Promise<Entry[]> {
  const html = unescapePayload(await fetchHtml('https://artificialanalysis.ai/leaderboards/models'))
  const raw: { model: string; org: string; score: number }[] = []
  const nameRe = /"shortName":"([^"]+)"/g
  let m: RegExpExecArray | null
  while ((m = nameRe.exec(html)) !== null) {
    const windowEnd = html.indexOf('"slug":', m.index + 1)
    const slice = html.slice(m.index, windowEnd === -1 ? m.index + 4000 : windowEnd)
    const score = /"intelligenceIndex":([\d.]+)/.exec(slice)
    if (!score) continue
    const org = /"modelCreatorName":"([^"]*)"/.exec(slice)
    raw.push({ model: m[1], org: org?.[1] ?? '', score: parseFloat(score[1]) })
  }
  const entries = toEntries(raw)
  if (entries.length < 10) {
    throw new Error(`AA Intelligence parse yielded only ${entries.length} entries — page structure may have changed`)
  }
  return entries
}

/** Image-to-video leaderboard (AA-Video-I2V) ranked by Elo. */
export async function fetchAaImageToVideo(): Promise<Entry[]> {
  const html = unescapePayload(
    await fetchHtml('https://artificialanalysis.ai/video/leaderboard/image-to-video')
  )
  // The page embeds each table row as a record:
  //   "formatted":{"rank":1,...},"values":{"id":"...","name":"MiniMax H3 (768p)",
  //   "url":...,"rank":0,"elo":1139.5,...,"creator":{...,"name":"MiniMax"}}
  // The page carries more than one board (the with-audio board first, then
  // the silent board). Rank restarting at 1 marks the next board — stop there.
  const entries: Entry[] = []
  const recRe = /"formatted":\{"rank":(\d+),/g
  let m: RegExpExecArray | null
  while ((m = recRe.exec(html)) !== null) {
    const rank = parseInt(m[1], 10)
    if (rank === 1 && entries.length > 0) break
    const slice = html.slice(m.index, m.index + 1200)
    const name = /"values":\{"id":"[^"]+","name":"([^"]+)"/.exec(slice)
    const elo = /"elo":([\d.]+)/.exec(slice)
    if (!name || !elo) continue
    const creator = /"creator":\{"id":"[^"]+","name":"([^"]*)"/.exec(slice)
    entries.push({ rank, model: name[1], org: creator?.[1] ?? '', score: parseFloat(elo[1]) })
  }
  if (entries.length < 5) {
    throw new Error(`AA I2V parse yielded only ${entries.length} entries — page structure may have changed`)
  }
  return entries.sort((a, b) => a.rank - b.rank)
}
