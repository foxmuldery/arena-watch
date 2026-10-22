import { get as httpsGet } from 'https'

/**
 * Small fetch helper with a node:https fallback and retry on upstream
 * throttling.
 *
 * Some CDNs stall or reject undici's TLS fingerprint while accepting a
 * classic https request (observed with datasets-server.huggingface.co).
 * Trying the global fetch first and falling back keeps the adapters working
 * both in plain Node (smoke tests) and in Electron's main process.
 *
 * The Hugging Face datasets server rate-limits bursts with a bare 429, so
 * retryable statuses back off a few times before a board is marked failed.
 */

const RETRY_DELAYS_MS = [2_000, 5_000]

function isRetryable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /\b(429|503)\b/.test(msg)
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

function httpsFetchText(url: string, headers: Record<string, string>, redirects = 3): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = httpsGet(url, { headers }, (res) => {
      const status = res.statusCode ?? 0
      if (status >= 300 && status < 400 && res.headers.location && redirects > 0) {
        res.resume()
        resolve(httpsFetchText(new URL(res.headers.location, url).toString(), headers, redirects - 1))
        return
      }
      if (status < 200 || status >= 300) {
        res.resume()
        reject(new Error(`HTTP ${status} for ${url}`))
        return
      }
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
      res.on('error', reject)
    })
    req.setTimeout(30_000, () => req.destroy(new Error(`Timeout fetching ${url}`)))
    req.on('error', reject)
  })
}

async function fetchOnce(url: string, headers: Record<string, string>): Promise<string> {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) })
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
    return await res.text()
  } catch {
    return httpsFetchText(url, headers)
  }
}

export async function fetchText(url: string, headers: Record<string, string> = {}): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchOnce(url, headers)
    } catch (err) {
      if (!isRetryable(err) || attempt >= RETRY_DELAYS_MS.length) throw err
      await sleep(RETRY_DELAYS_MS[attempt])
    }
  }
}

export async function fetchJson<T = unknown>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const text = await fetchText(url, { Accept: 'application/json', ...headers })
  return JSON.parse(text) as T
}
