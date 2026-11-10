/**
 * Wire protocol of the game relay server (server/relay): a WebSocket hub that
 * forwards room messages between browsers whose direct WebRTC link is not up
 * (yet, or ever: strict NAT, corporate firewalls). Shared by the browser
 * client (engine/net/relay.ts) and the server, so keep it dependency-free and
 * to erasable TypeScript only (the server runs it with Node's type stripping).
 *
 * Connect: `wss://<host>/v1?app=<appId>&room=<roomId>&id=<peerId>&key=<secret>`.
 * `key` is a random per-page secret: the first socket to use a peer id in a
 * room owns it, and only the same key can take it back after a reconnect, so
 * nobody else in the room can pose as that peer (e.g. the host).
 */

export const RELAY_PROTOCOL_VERSION = 1
export const RELAY_PATH = `/v${RELAY_PROTOCOL_VERSION}`

/** Client → server. */
export type ClientMessage =
  /** Forward `d` on channel `ch` to `to` (peer ids), or to everyone else in the room. */
  | { t: 'send'; ch: string; d: unknown; to?: string[] }
  /** Round trip to the server; answered with the same `n`. */
  | { t: 'ping'; n: number }

/** Server → client. */
export type ServerMessage =
  /** Welcome: who else is in the room right now. */
  | { t: 'hi'; peers: string[] }
  | { t: 'join'; id: string }
  | { t: 'leave'; id: string }
  | { t: 'msg'; from: string; ch: string; d: unknown }
  | { t: 'pong'; n: number }

/** WebSocket close codes the server uses (4000–4999 are free for apps). */
export const CLOSE = {
  badRequest: 4400,
  forbidden: 4403,
  idTaken: 4409,
  /** Room full, server full, too many sockets from one address, or flooding. */
  limit: 4429,
  shutdown: 4503,
} as const

/** Close codes after which reconnecting with the same parameters is pointless. */
export const FATAL_CLOSES: ReadonlySet<number> = new Set([CLOSE.badRequest, CLOSE.forbidden, CLOSE.idTaken])

/** Server-side limits (the client only needs MAX_MESSAGE_BYTES, to skip what would be refused). */
export const RELAY_LIMITS = {
  /** One WebSocket frame. A full game snapshot is a few KB; 256 KB leaves plenty of room. */
  maxMessageBytes: 256 * 1024,
  /** Players plus spectators. */
  maxPeersPerRoom: 24,
  maxRooms: 1000,
  maxSockets: 4000,
  maxSocketsPerAddress: 24,
  /** Per socket, token bucket: sustained rate and burst. A 60 Hz host with chat stays far below. */
  messagesPerSecond: 300,
  messageBurst: 600,
  bytesPerSecond: 2 * 1024 * 1024,
  byteBurst: 4 * 1024 * 1024,
  /** Dropped messages (over the rate) before the socket is closed as flooding. */
  maxDropped: 2000,
  /** A peer id's key is remembered this long after its socket closes (reconnects). */
  idHoldMs: 10 * 60_000,
} as const

const APP_RE = /^play-forge\/[a-z0-9-]{1,40}$/
const ROOM_RE = /^[A-Za-z0-9_-]{1,32}$/
const ID_RE = /^[A-Za-z0-9_-]{4,64}$/
const KEY_RE = /^[A-Za-z0-9_-]{16,128}$/
const CHANNEL_RE = /^[~A-Za-z0-9_-]{1,32}$/

export const isPeerId = (v: unknown): v is string => typeof v === 'string' && ID_RE.test(v)
export const isChannel = (v: unknown): v is string => typeof v === 'string' && CHANNEL_RE.test(v)

export interface RelayJoin {
  app: string
  room: string
  id: string
  key: string
}

/** Validate the connect URL's query. Null if anything is missing or malformed. */
export function parseJoin(query: URLSearchParams): RelayJoin | null {
  const app = query.get('app') ?? ''
  const room = query.get('room') ?? ''
  const id = query.get('id') ?? ''
  const key = query.get('key') ?? ''
  if (!APP_RE.test(app) || !ROOM_RE.test(room) || !ID_RE.test(id) || !KEY_RE.test(key)) return null
  return { app, room, id, key }
}

/** Build the connect URL (client side). */
export function joinUrl(base: string, join: RelayJoin): string {
  const url = new URL(RELAY_PATH, base)
  for (const [k, v] of Object.entries(join)) url.searchParams.set(k, v)
  return url.toString()
}

/** Parse and validate one client frame. Null if malformed. */
export function parseClientMessage(text: string): ClientMessage | null {
  let m: any
  try {
    m = JSON.parse(text)
  } catch {
    return null
  }
  if (!m || typeof m !== 'object') return null
  if (m.t === 'ping') return typeof m.n === 'number' && Number.isFinite(m.n) ? { t: 'ping', n: m.n } : null
  if (m.t !== 'send' || !isChannel(m.ch) || !('d' in m)) return null
  if (m.to === undefined) return { t: 'send', ch: m.ch, d: m.d }
  if (!Array.isArray(m.to) || m.to.length > RELAY_LIMITS.maxPeersPerRoom || !m.to.every(isPeerId)) return null
  return { t: 'send', ch: m.ch, d: m.d, to: m.to }
}

/** Parse one server frame (client side). Null if malformed. */
export function parseServerMessage(text: string): ServerMessage | null {
  let m: any
  try {
    m = JSON.parse(text)
  } catch {
    return null
  }
  if (!m || typeof m !== 'object') return null
  switch (m.t) {
    case 'hi':
      return Array.isArray(m.peers) && m.peers.every(isPeerId) ? { t: 'hi', peers: m.peers } : null
    case 'join':
    case 'leave':
      return isPeerId(m.id) ? { t: m.t, id: m.id } : null
    case 'msg':
      return isPeerId(m.from) && isChannel(m.ch) ? { t: 'msg', from: m.from, ch: m.ch, d: m.d } : null
    case 'pong':
      return typeof m.n === 'number' ? { t: 'pong', n: m.n } : null
    default:
      return null
  }
}
