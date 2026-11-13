import { netLog } from './debug'

/**
 * TURN: when two browsers can't connect directly, WebRTC (game data and voice)
 * can still flow through a TURN server. Our game relay hands out short-lived
 * TURN logins at `GET <relay>/turn` (server/relay/turn.ts); the secret that
 * signs them never leaves the server.
 *
 * The login is fetched once in the background when the page loads, so joining
 * a room never waits for it. A room joined before it arrives (or with an old
 * relay that has no /turn) simply has no TURN: data still has the WebSocket
 * relay, as before.
 */
export interface TurnServer {
  urls: string | string[]
  username: string
  credential: string
}

interface Cached {
  servers: TurnServer[]
  /** Epoch ms after which the login is too old to start a room with. */
  freshUntil: number
}

/** `?turn=` in the page URL: `off` skips TURN, `only` forces every link through it (testing). */
export type TurnMode = 'auto' | 'off' | 'only'

export function turnMode(search: string = typeof location !== 'undefined' ? location.search : ''): TurnMode {
  const v = new URLSearchParams(search).get('turn')
  return v === 'off' || v === 'only' ? v : 'auto'
}

/** https://host/turn for a wss://host relay URL (ws:// → http:// for local testing). */
export function turnEndpoint(relayUrl: string): string | null {
  try {
    const u = new URL(relayUrl)
    if (u.protocol !== 'wss:' && u.protocol !== 'ws:') return null
    u.protocol = u.protocol === 'wss:' ? 'https:' : 'http:'
    u.pathname = '/turn'
    u.search = ''
    return u.toString()
  } catch {
    return null
  }
}

/** A login response we trust enough to hand to WebRTC; anything else is ignored. */
export function parseTurnLogin(data: unknown, now: number): Cached | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  const urls = Array.isArray(d.urls)
    ? d.urls.filter((u): u is string => typeof u === 'string' && /^turns?:/.test(u))
    : []
  if (!urls.length || typeof d.username !== 'string' || typeof d.credential !== 'string') return null
  const ttl = typeof d.ttl === 'number' && d.ttl > 0 ? d.ttl : 0
  // Start rooms with it only while most of its life is left: a room can last a while.
  const freshUntil = now + ttl * 1000 * 0.5
  return { servers: [{ urls, username: d.username, credential: d.credential }], freshUntil }
}

let cached: Cached | null = null
let inFlight: Promise<void> | null = null

/** Fetches a TURN login in the background (no-op if one is fresh or already coming). */
export function prefetchTurn(relayUrl: string, fetcher: typeof fetch = fetch): Promise<void> {
  const url = turnEndpoint(relayUrl)
  if (!url || turnMode() === 'off') return Promise.resolve()
  if ((cached && cached.freshUntil > Date.now()) || inFlight) return inFlight ?? Promise.resolve()
  inFlight = fetcher(url, { cache: 'no-store', credentials: 'omit' })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      const login = parseTurnLogin(data, Date.now())
      if (login) cached = login
      netLog(login ? 'turn: login ready' : 'turn: none offered')
    })
    .catch((e) => netLog('turn: fetch failed', e))
    .finally(() => (inFlight = null))
  return inFlight
}

/** TURN servers for a room starting now (empty when there's no fresh login, or TURN is off). */
export function turnServers(now = Date.now()): TurnServer[] {
  if (turnMode() === 'off' || !cached || cached.freshUntil <= now) return []
  return cached.servers
}

/** For tests. */
export function resetTurnCache(): void {
  cached = null
  inFlight = null
}
