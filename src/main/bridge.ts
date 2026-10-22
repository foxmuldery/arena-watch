import { createServer, type Server } from 'http'
import { BRIDGE_PORT, type DashboardPayload } from './dashboard'

/**
 * Loopback-only JSON endpoint consumed by the native WidgetKit extension.
 *
 * Widgets are sandboxed and cannot read Electron's userData folder, and App
 * Group containers would require extra provisioning profiles. A localhost
 * HTTP response keeps the bridge dependency-free; it binds to 127.0.0.1 and
 * exposes leaderboard data only (no settings, no credentials).
 */

let server: Server | null = null

export function startDashboardBridge(getPayload: () => DashboardPayload): void {
  if (server) return
  server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0]
    if (path !== '/dashboard.json') {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('not found')
      return
    }
    try {
      const body = JSON.stringify(getPayload())
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'content-length': Buffer.byteLength(body)
      })
      res.end(body)
    } catch (err) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
      res.end(err instanceof Error ? err.message : 'error')
    }
  })
  server.on('error', (err) => {
    // A port conflict must not take the tray app down; widgets simply keep
    // showing their last cached payload.
    console.error(`dashboard bridge failed on 127.0.0.1:${BRIDGE_PORT}:`, err.message)
    server = null
  })
  server.listen(BRIDGE_PORT, '127.0.0.1', () => {
    console.log(`dashboard bridge listening on http://127.0.0.1:${BRIDGE_PORT}/dashboard.json`)
  })
}

export function stopDashboardBridge(): void {
  server?.close()
  server = null
}
