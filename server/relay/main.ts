import { createServer, type IncomingMessage } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import { CLOSE, RELAY_LIMITS, RELAY_PATH, parseJoin } from '../../engine/net/relay-protocol.ts'
import { RelayHub, type HubSocket } from './hub.ts'

/**
 * Game relay server: forwards room messages between browsers that have no
 * direct WebRTC link. Stateless apart from live rooms (nothing on disk).
 *
 * Env:
 *   PORT              WebSocket + /healthz (default 8080). Public, behind the Cloudflare Tunnel.
 *   METRICS_PORT      Prometheus /metrics (default 9464). Keep it off the tunnel.
 *   ALLOWED_ORIGINS   Comma-separated page origins allowed to connect.
 *   ALLOW_LOCALHOST   "1": also allow http://localhost:* and 127.0.0.1 (development).
 *   CLIENT_IP_HEADER  Header with the real client address (default cf-connecting-ip). Only
 *                     trust it when the server is reachable through the tunnel alone.
 */

const PORT = Number(process.env.PORT ?? 8080)
const METRICS_PORT = Number(process.env.METRICS_PORT ?? 9464)
const ORIGINS = new Set(
  (
    process.env.ALLOWED_ORIGINS ??
    'https://haonguyen.dev,https://www.haonguyen.dev,https://duckyluckvn.github.io'
  )
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
)
const ALLOW_LOCALHOST = process.env.ALLOW_LOCALHOST === '1'
const IP_HEADER = (process.env.CLIENT_IP_HEADER ?? 'cf-connecting-ip').toLowerCase()
/** A socket this far behind on sends is too slow to keep up: its messages are dropped. */
const MAX_BUFFERED = 1024 * 1024
const HEARTBEAT_MS = 30_000

const hub = new RelayHub()
const startedAt = Date.now()
let slowDrops = 0

function originAllowed(origin: string | undefined): boolean {
  if (!origin) return false
  if (ORIGINS.has(origin)) return true
  return ALLOW_LOCALHOST && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
}

function clientAddress(req: IncomingMessage): string {
  const header = req.headers[IP_HEADER]
  const value = Array.isArray(header) ? header[0] : header
  return value?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown'
}

const http = createServer((req, res) => {
  if (req.url === '/healthz') {
    const s = hub.stats()
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    res.end(JSON.stringify({ ok: true, rooms: s.rooms, sockets: s.sockets, uptimeS: uptime() }))
    return
  }
  res.writeHead(404).end()
})

const wss = new WebSocketServer({ noServer: true, maxPayload: RELAY_LIMITS.maxMessageBytes })
const alive = new WeakMap<WebSocket, boolean>()

http.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', 'http://relay')
  if (url.pathname !== RELAY_PATH || !originAllowed(req.headers.origin)) {
    // A complete response, so proxies pass on the 403 instead of reporting a broken upstream (502).
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
    return
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    const join = parseJoin(url.searchParams)
    if (!join) {
      ws.close(CLOSE.badRequest, 'bad request')
      return
    }
    const adapter: HubSocket = {
      send(text) {
        if (ws.readyState !== ws.OPEN) return
        if (ws.bufferedAmount > MAX_BUFFERED) {
          slowDrops++
          return
        }
        ws.send(text)
      },
      close: (code, reason) => ws.close(code, reason),
    }
    const conn = hub.open(adapter, join, clientAddress(req), Date.now())
    if (!conn) return
    alive.set(ws, true)
    ws.on('pong', () => alive.set(ws, true))
    ws.on('message', (data, isBinary) => {
      if (!isBinary) conn.message(data.toString(), Date.now())
    })
    ws.on('close', () => conn.closed(Date.now()))
    ws.on('error', () => ws.terminate())
  })
})

// Drop sockets that stopped answering pings (closed laptop, lost network).
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!alive.get(ws)) {
      ws.terminate()
      continue
    }
    alive.set(ws, false)
    ws.ping()
  }
}, HEARTBEAT_MS)
const sweeper = setInterval(() => hub.sweep(Date.now()), 60_000)

const uptime = () => Math.round((Date.now() - startedAt) / 1000)

const metrics = createServer((req, res) => {
  if (req.url !== '/metrics') {
    res.writeHead(404).end()
    return
  }
  const s = hub.stats()
  const lines = [
    '# TYPE relay_rooms gauge',
    `relay_rooms ${s.rooms}`,
    '# TYPE relay_sockets gauge',
    `relay_sockets ${s.sockets}`,
    '# TYPE relay_messages_in_total counter',
    `relay_messages_in_total ${s.messagesIn}`,
    '# TYPE relay_bytes_in_total counter',
    `relay_bytes_in_total ${s.bytesIn}`,
    '# TYPE relay_messages_out_total counter',
    `relay_messages_out_total ${s.messagesOut}`,
    '# TYPE relay_dropped_total counter',
    `relay_dropped_total{reason="rate"} ${s.dropped}`,
    `relay_dropped_total{reason="slow_client"} ${slowDrops}`,
    '# TYPE relay_malformed_total counter',
    `relay_malformed_total ${s.malformed}`,
    '# TYPE relay_rejected_total counter',
    ...Object.entries(s.rejected).map(
      ([r, n]) => `relay_rejected_total{reason="${r.replace(/\W/g, '_')}"} ${n}`,
    ),
    '# TYPE relay_uptime_seconds gauge',
    `relay_uptime_seconds ${uptime()}`,
  ]
  res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' }).end(lines.join('\n') + '\n')
})

http.listen(PORT, () => console.log(`relay: ws + /healthz on :${PORT}, origins: ${[...ORIGINS].join(' ')}`))
metrics.listen(METRICS_PORT, () => console.log(`relay: /metrics on :${METRICS_PORT}`))

function shutdown() {
  clearInterval(heartbeat)
  clearInterval(sweeper)
  hub.closeAll()
  http.close()
  metrics.close()
  setTimeout(() => process.exit(0), 500).unref()
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
