import type { LocalAccess } from './local-access'
import type { Transport } from './transport'

// Network status: what the transport sees (relays, peer links), the joining
// screen's state machine, and the Network panel's view model. All pure data,
// so it can be tested without a browser; engine/ui/net-panel.ts draws it.

export type RelayState = 'connecting' | 'open' | 'closed'
export type LinkState = 'connecting' | 'connected' | 'failed'
/** How messages reach a peer: browser to browser, or through our relay server. */
export type Route = 'direct' | 'relay'
/** The socket to our game relay server ('off': not used, e.g. `?relay=off`). */
export type GameRelayState = 'off' | 'connecting' | 'open' | 'closed'

export interface PeerLink {
  id: string
  state: LinkState
  /** Round trip in milliseconds, from the last measure. */
  rttMs?: number
  /** Which way messages go once connected. Absent for transports without a relay. */
  route?: Route
  /** The WebRTC link goes through a TURN server (still WebRTC, so voice works), from the last measure. */
  turn?: boolean
  /**
   * Not linked directly (on TURN or the relay): a link attempt is under way ('trying') or not ('idle').
   * Absent for direct links and transports that can't retry. The Network panel offers Retry on it.
   */
  attempt?: LinkAttempt
}

export type LinkAttempt = 'trying' | 'idle'

export interface NetStatus {
  /** 'internet': WebRTC over public relays; 'local': same-browser tabs (`?net=local`). */
  kind: 'internet' | 'local'
  /** Matchmaking servers (Nostr relays). Empty for local. */
  relays: { url: string; state: RelayState }[]
  /** Connections with a peer that answered over the relays, not open yet. */
  negotiating: number
  /** Direct connections that failed since joining. Never goes down (the joining screen uses it). */
  failures: number
  /**
   * Failures still unresolved: the peer hasn't connected since, and it failed
   * within FAILURE_TTL_MS. The Network panel uses this, so one guest who gave
   * up doesn't mark the room as broken for the rest of the session.
   */
  openFailures: number
  peers: PeerLink[]
  /** Peers reached only through the relay, still giving WebRTC its head start (hybrid.ts RELAY_GRACE_MS). */
  waiting?: number
  /** A WebRTC attempt is under way: a retry rejoining, a fresh room setting up, or a link negotiating. */
  trying?: boolean
  /** Our game relay server (fallback path), when the transport uses one. */
  gameRelay?: { state: GameRelayState; rttMs?: number }
}

/** How long a failed connection counts against the room's health. */
export const FAILURE_TTL_MS = 30_000

/** Connection failures with timestamps; a peer's failure clears once it connects. Time is passed in (testable). */
export class FailureLog {
  /** Every failure ever logged. */
  total = 0
  private byPeer = new Map<string, number>()
  private unnamed: number[] = []

  add(now: number, peerId?: string): void {
    this.total++
    if (peerId) this.byPeer.set(peerId, now)
    else this.unnamed.push(now)
  }

  /** The peer connected after all. */
  resolve(peerId: string): void {
    this.byPeer.delete(peerId)
  }

  /** Unresolved recent failures: peer ids, and a count that includes failures without an id. */
  open(now: number, isConnected: (peerId: string) => boolean): { peers: string[]; count: number } {
    const fresh = (at: number) => now - at < FAILURE_TTL_MS
    for (const [id, at] of this.byPeer) if (!fresh(at) || isConnected(id)) this.byPeer.delete(id)
    this.unnamed = this.unnamed.filter(fresh)
    const peers = [...this.byPeer.keys()]
    return { peers, count: peers.length + this.unnamed.length }
  }
}

/** Optional transport extra: live connection details. */
export interface NetDiagnostics {
  /** Cheap, synchronous: relay sockets and peer link states. */
  snapshot(): NetStatus
  /** Refresh the round trip to each peer (WebRTC stats). Call only while someone looks. */
  measure(): Promise<void>
}

/** The transport's status, or a "local" one for transports without diagnostics. */
export function statusOf(transport: Transport): NetStatus {
  return (
    transport.diagnostics?.snapshot() ?? {
      kind: 'local',
      relays: [],
      negotiating: 0,
      failures: 0,
      openFailures: 0,
      peers: transport.peers().map((id) => ({ id, state: 'connected' })),
    }
  )
}

export const relaysOpen = (s: NetStatus): number => s.relays.filter((r) => r.state === 'open').length
const gameRelayOpen = (s: NetStatus): boolean => s.gameRelay?.state === 'open'

// ---------- Joining a room ----------

/**
 * servers → looking → connecting, each with its own failure:
 * - servers-failed: no matchmaking server reachable,
 * - not-found: servers fine but the host never answered,
 * - blocked: the host answered but no direct connection could be made.
 */
export type JoinPhase = 'servers' | 'servers-failed' | 'looking' | 'not-found' | 'connecting' | 'blocked'

/** How long each step may take before the joining screen says what went wrong. */
/** `connect` outlasts the relay grace (hybrid.ts RELAY_GRACE_MS, 14 s): a relayed join isn't "blocked". */
export const JOIN_TIMEOUTS = { servers: 10_000, room: 20_000, connect: 20_000 } as const

export interface JoinTrack {
  startedAt: number
  /** When a matchmaking server first answered. */
  relaysAt: number | null
  /** When a peer first answered (signalling done). */
  seenAt: number | null
  phase: JoinPhase
}

export function startJoin(now: number): JoinTrack {
  return { startedAt: now, relaysAt: null, seenAt: null, phase: 'servers' }
}

/** Advance the joining state with the latest status. Pure; returns a new track. */
export function stepJoin(track: JoinTrack, status: NetStatus, now: number): JoinTrack {
  // Either way of finding the room will do: the matchmaking servers or our relay.
  const relaysOk = status.kind === 'local' || relaysOpen(status) > 0 || gameRelayOpen(status)
  const seen = status.negotiating > 0 || status.peers.length > 0 || status.failures > 0
  // A relay fallback still pending (hybrid.ts RELAY_GRACE_MS): not blocked, just slower.
  const waiting = (status.waiting ?? 0) > 0
  const relaysAt = track.relaysAt ?? (relaysOk || seen ? now : null)
  const seenAt = track.seenAt ?? (seen ? now : null)
  let phase: JoinPhase
  if (seenAt !== null) {
    const connected = status.peers.some((p) => p.state === 'connected')
    // A failure only means blocked once nothing else is still connecting: the
    // failed link may be with another guest while the host's is in progress.
    if (status.failures > 0 && !connected && status.negotiating === 0 && !waiting) phase = 'blocked'
    // Connected to someone who never sent the room (another guest, no host): the room's host is missing.
    else if (now - seenAt >= JOIN_TIMEOUTS.connect) phase = connected ? 'not-found' : 'blocked'
    else phase = 'connecting'
  } else if (relaysAt !== null) {
    phase = now - relaysAt >= JOIN_TIMEOUTS.room ? 'not-found' : 'looking'
  } else {
    phase = now - track.startedAt >= JOIN_TIMEOUTS.servers ? 'servers-failed' : 'servers'
  }
  return { startedAt: track.startedAt, relaysAt, seenAt, phase }
}

export const joinFailed = (phase: JoinPhase): boolean =>
  phase === 'servers-failed' || phase === 'not-found' || phase === 'blocked'

/** Which of the three steps (servers, room, host) the phase is on. */
export const joinStep = (phase: JoinPhase): 0 | 1 | 2 =>
  phase === 'servers' || phase === 'servers-failed' ? 0 : phase === 'looking' || phase === 'not-found' ? 1 : 2

// ---------- Network panel ----------

/** Above this round trip, play starts to feel laggy. */
export const LAG_MS = 200

export type Health = 'good' | 'warn' | 'bad' | 'local'
export type NetHint =
  | 'no-servers'
  | 'blocked'
  | 'relayed'
  | 'connecting'
  | 'lag'
  | 'local'
  /** The browser hasn't been allowed to reach the local network (local-access.ts): offer to ask. */
  | 'allow-local'
  /** Refused, or Android's default: say where to change it (and still offer to ask). */
  | 'local-denied'

/** Ms in a room before offering local network access (a direct link usually opens by then). */
export const LOCAL_ASK_AFTER_MS = 5000

/** Someone we have a direct link with: for the host every guest, for a guest the host. */
export interface LinkedPlayer {
  name: string
  /** Their transport peer id, if known. */
  peer?: string
  /** False while the room shows them as dropped. */
  connected: boolean
}

/** What the panel shows for a connected player: a Route, or 'turn' (WebRTC through our TURN server). */
export type PanelRoute = Route | 'turn'

export interface PanelRow {
  name: string
  state: LinkState
  rttMs: number | null
  /** Set once connected, when the transport reports it. */
  route: PanelRoute | null
  /** Not linked by WebRTC (yet): where getting a link stands. */
  attempt?: LinkAttempt
}

export interface NetPanelView {
  health: Health
  local: boolean
  relays: { host: string; ok: boolean }[]
  relaysOk: number
  /** Our backup (relay) server; null when off. `inUse`: some player is reached through it now. */
  gameRelay: { ok: boolean; rttMs: number | null; inUse: boolean } | null
  rows: PanelRow[]
  hints: NetHint[]
}

/** A WebRTC link through TURN shows as 'turn'; the WebSocket relay stays 'relay'. */
function panelRoute(link: PeerLink | undefined): PanelRoute | null {
  if (!link) return null
  if (link.turn && link.route !== 'relay') return 'turn'
  return link.route ?? null
}

/** "wss://relay.example.com" → "relay.example.com". */
export const relayHost = (url: string): string => url.replace(/^wss?:\/\//, '').replace(/\/$/, '')

/**
 * What the Network panel shows. `onlineForMs`: time since the room opened; the
 * servers get JOIN_TIMEOUTS.servers to answer before "none reachable" counts
 * as broken (until then it is just starting up). `localAccess`: the browser's
 * Local Network Access permission (local-access.ts; omitted = not blocking).
 */
export function netPanelView(
  status: NetStatus,
  players: LinkedPlayer[],
  onlineForMs = Infinity,
  localAccess: LocalAccess = 'unsupported',
): NetPanelView {
  const local = status.kind === 'local'
  const rows: PanelRow[] = players.map((p) => {
    const link = p.peer ? status.peers.find((l) => l.id === p.peer) : undefined
    const state = link && p.connected ? link.state : 'connecting'
    return {
      name: p.name,
      state,
      rttMs: link?.rttMs ?? null,
      route: state === 'connected' ? panelRoute(link) : null,
      ...(link?.attempt ? { attempt: link.attempt } : {}),
    }
  })
  const relaysOk = relaysOpen(status)
  const relayUp = gameRelayOpen(status)
  const reachable = relaysOk > 0 || relayUp
  const starting = !local && !reachable && onlineForMs < JOIN_TIMEOUTS.servers
  const noServers = !local && !reachable && !starting
  const failed = rows.some((r) => r.state === 'failed')
  const connecting = rows.some((r) => r.state === 'connecting') || status.negotiating > 0
  const slow = (r: PanelRow) => r.rttMs !== null && r.rttMs > LAG_MS
  // Relayed links are slower by design: their own hint says so, the "get a better connection" one would mislead.
  const lag = rows.some((r) => slow(r) && r.route !== 'relay')
  const relayLag = rows.some((r) => slow(r) && r.route === 'relay')

  const hints: NetHint[] = []
  if (local) hints.push('local')
  if (noServers) hints.push('no-servers')
  if (failed || status.openFailures > 0) hints.push('blocked')
  if (rows.some((r) => r.route === 'relay')) hints.push('relayed')
  if (connecting) hints.push('connecting')
  if (lag) hints.push('lag')
  // Not linked directly (yet) while the browser may be the one blocking it: same-Wi-Fi players need it.
  const notDirect = rows.some((r) => r.route === 'relay') || connecting
  if (!local && notDirect && onlineForMs >= LOCAL_ASK_AFTER_MS) {
    if (localAccess === 'prompt') hints.push('allow-local')
    else if (localAccess === 'denied') hints.push('local-denied')
  }

  const health: Health = local
    ? 'local'
    : noServers || failed
      ? 'bad'
      : starting || connecting || lag || relayLag || status.openFailures > 0
        ? 'warn'
        : 'good'
  return {
    health,
    local,
    relays: status.relays.map((r) => ({ host: relayHost(r.url), ok: r.state === 'open' })),
    relaysOk,
    gameRelay:
      status.gameRelay && status.gameRelay.state !== 'off'
        ? {
            ok: relayUp,
            rttMs: status.gameRelay.rttMs ?? null,
            inUse: rows.some((r) => r.route === 'relay'),
          }
        : null,
    rows,
    hints,
  }
}
