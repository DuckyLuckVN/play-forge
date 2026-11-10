import type { Transport } from './transport'

// Network status: what the transport sees (relays, peer links), the joining
// screen's state machine, and the Network panel's view model. All pure data,
// so it can be tested without a browser; engine/ui/net-panel.ts draws it.

export type RelayState = 'connecting' | 'open' | 'closed'
export type LinkState = 'connecting' | 'connected' | 'failed'
/** How data reaches a peer: straight between browsers, through a TURN server, or a same-browser test tab. */
export type Route = 'direct' | 'relay' | 'local'

export interface PeerLink {
  id: string
  state: LinkState
  /** Known once the connection has picked a path (see NetDiagnostics.measure). */
  route?: Route
  /** Round trip in milliseconds, from the last measure. */
  rttMs?: number
}

export interface NetStatus {
  /** 'internet': WebRTC over public relays; 'local': same-browser tabs (`?net=local`). */
  kind: 'internet' | 'local'
  /** Matchmaking servers (Nostr relays). Empty for local. */
  relays: { url: string; state: RelayState }[]
  /** Connections with a peer that answered over the relays, not open yet. */
  negotiating: number
  /** Direct connections that failed since joining. Never goes down. */
  failures: number
  peers: PeerLink[]
}

/** Optional transport extra: live connection details. */
export interface NetDiagnostics {
  /** Cheap, synchronous: relay sockets and peer link states. */
  snapshot(): NetStatus
  /** Refresh route and round trip for each peer (WebRTC stats). Call only while someone looks. */
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
      peers: transport.peers().map((id) => ({ id, state: 'connected', route: 'local' })),
    }
  )
}

export const relaysOpen = (s: NetStatus): number => s.relays.filter((r) => r.state === 'open').length

// ---------- Joining a room ----------

/**
 * servers → looking → connecting, each with its own failure:
 * - servers-failed: no matchmaking server reachable,
 * - not-found: servers fine but the host never answered,
 * - blocked: the host answered but no direct connection could be made.
 */
export type JoinPhase = 'servers' | 'servers-failed' | 'looking' | 'not-found' | 'connecting' | 'blocked'

/** How long each step may take before the joining screen says what went wrong. */
export const JOIN_TIMEOUTS = { servers: 10_000, room: 20_000, connect: 15_000 } as const

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
  const relaysOk = status.kind === 'local' || relaysOpen(status) > 0
  const seen = status.negotiating > 0 || status.peers.length > 0 || status.failures > 0
  const relaysAt = track.relaysAt ?? (relaysOk || seen ? now : null)
  const seenAt = track.seenAt ?? (seen ? now : null)
  let phase: JoinPhase
  if (seenAt !== null) {
    const connected = status.peers.some((p) => p.state === 'connected')
    if (status.failures > 0 && !connected) phase = 'blocked'
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
export type NetHint = 'no-servers' | 'blocked' | 'connecting' | 'lag' | 'local'

/** Someone we have a direct link with: for the host every guest, for a guest the host. */
export interface LinkedPlayer {
  name: string
  /** Their transport peer id, if known. */
  peer?: string
  /** False while the room shows them as dropped. */
  connected: boolean
}

export interface PanelRow {
  name: string
  state: LinkState
  route: Route | null
  rttMs: number | null
}

export interface NetPanelView {
  health: Health
  local: boolean
  relays: { host: string; ok: boolean }[]
  relaysOk: number
  rows: PanelRow[]
  hints: NetHint[]
}

/** "wss://relay.example.com" → "relay.example.com". */
export const relayHost = (url: string): string => url.replace(/^wss?:\/\//, '').replace(/\/$/, '')

/**
 * What the Network panel shows. `onlineForMs`: time since the room opened; the
 * servers get JOIN_TIMEOUTS.servers to answer before "none reachable" counts
 * as broken (until then it is just starting up).
 */
export function netPanelView(
  status: NetStatus,
  players: LinkedPlayer[],
  onlineForMs = Infinity,
): NetPanelView {
  const local = status.kind === 'local'
  const rows: PanelRow[] = players.map((p) => {
    const link = p.peer ? status.peers.find((l) => l.id === p.peer) : undefined
    return {
      name: p.name,
      state: link && p.connected ? link.state : 'connecting',
      route: link?.route ?? null,
      rttMs: link?.rttMs ?? null,
    }
  })
  const relaysOk = relaysOpen(status)
  const starting = !local && relaysOk === 0 && onlineForMs < JOIN_TIMEOUTS.servers
  const noServers = !local && relaysOk === 0 && !starting
  const failed = rows.some((r) => r.state === 'failed')
  const connecting = rows.some((r) => r.state === 'connecting') || status.negotiating > 0
  const lag = rows.some((r) => r.rttMs !== null && r.rttMs > LAG_MS)

  const hints: NetHint[] = []
  if (local) hints.push('local')
  if (noServers) hints.push('no-servers')
  if (failed || status.failures > 0) hints.push('blocked')
  if (connecting) hints.push('connecting')
  if (lag) hints.push('lag')

  const health: Health = local
    ? 'local'
    : noServers || failed
      ? 'bad'
      : starting || connecting || lag || status.failures > 0
        ? 'warn'
        : 'good'
  return {
    health,
    local,
    relays: status.relays.map((r) => ({ host: relayHost(r.url), ok: r.state === 'open' })),
    relaysOk,
    rows,
    hints,
  }
}
