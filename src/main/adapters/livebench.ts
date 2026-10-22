import type { Entry } from '../../shared/types'
import { fetchText } from './http'

/**
 * LiveBench adapter.
 *
 * livebench.ai is a static site; every release ships a CSV at
 * `/data/<YYYYMMDD>/table.csv` with one column per category. The site ranks
 * the "Overall" view as the mean of the category averages, so we compute the
 * same mean here. The release folder is not advertised through a stable URL,
 * so we read the current release id from the site's JS bundle and fail loudly
 * if that changes.
 */

const SITE = 'https://livebench.ai/'

function parseCsv(text: string): string[][] {
  return text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => line.split(',').map((cell) => cell.trim()))
}

async function latestRelease(): Promise<string> {
  const html = await fetchText(SITE, { Accept: 'text/html' })
  const src = /<script[^>]+src="([^"]*static\/js\/main\.[^"]+\.js)"/.exec(html)?.[1]
  if (!src) throw new Error('LiveBench: main JS bundle not found on the landing page')
  const bundle = await fetchText(new URL(src, SITE).toString())
  const labelsBlock = /_e\s*=\s*\[([^\]]*)\]/.exec(bundle)?.[1] ?? ''
  const labels = [...labelsBlock.matchAll(/"(\d{8})"/g)].map((m) => m[1])
  if (labels.length === 0) {
    throw new Error('LiveBench: release labels not found in the JS bundle — site structure may have changed')
  }
  return labels.sort().at(-1) as string
}

export async function fetchLiveBench(): Promise<Entry[]> {
  const release = await latestRelease()
  const csv = await fetchText(`${SITE}data/${release}/table.csv`, { Accept: 'text/csv' })
  const rows = parseCsv(csv)
  if (rows.length < 2) throw new Error('LiveBench: table.csv is empty')

  const header = rows[0].map((h) => h.toLowerCase())
  const nameCol = header.indexOf('model')
  if (nameCol === -1) throw new Error('LiveBench: table.csv has no "model" column')
  const scoreCols = header.map((h, i) => (i === nameCol || h === '' ? -1 : i)).filter((i) => i >= 0)
  if (scoreCols.length === 0) throw new Error('LiveBench: table.csv has no category columns')

  const entries: Entry[] = []
  for (const row of rows.slice(1)) {
    const model = row[nameCol]
    if (!model) continue
    const values = scoreCols.map((i) => Number(row[i])).filter((n) => Number.isFinite(n))
    if (values.length === 0) continue
    const overall = values.reduce((a, b) => a + b, 0) / values.length
    entries.push({ rank: 0, model, org: '', score: Math.round(overall * 100) / 100 })
  }

  entries.sort((a, b) => b.score - a.score || a.model.localeCompare(b.model))
  entries.forEach((e, i) => (e.rank = i + 1))

  if (entries.length < 10) {
    throw new Error(`LiveBench parse yielded only ${entries.length} models — table format may have changed`)
  }
  return entries
}
