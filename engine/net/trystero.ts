import { getRelaySockets, joinRoom, selfId, type DataPayload, type MessageAction } from 'trystero'
import { Emitter } from '../core/emitter'
import { netLog } from './debug'
import { RELAY_URLS, roomConfig } from './net-config'
import type { LinkState, NetDiagnostics, NetStatus, PeerLink, RelayState, Route } from './status'
import type { Transport } from './transport'

/**
 * Internet transport: WebRTC data channels between browsers. Peers find each
 * other through public Nostr relays (handled by Trystero), so no server of our
 * own is needed. Only connection setup goes through relays; game traffic is
 * direct peer to peer.
 */
export function createTrysteroTransport(appId: string, roomId: string): Transport {
  const pcs = createPcTracker()
  let joinErrors = 0
  const failedPeers = new Set<string>()
  const room = joinRoom({ ...roomConfig(appId), rtcPolyfill: pcs.ctor }, roomId, {
    // A peer we exchanged offers with but could not connect to.
    onJoinError({ peerId, error }) {
      joinErrors++
      if (peerId) failedPeers.add(peerId)
      netLog('join error', peerId, error)
    },
  })
  const events = new Emitter<{ join: [string]; leave: [string]; stream: [MediaStream, string] }>()
  const channels = new Emitter<Record<string, [unknown, string]>>()
  const actions = new Map<string, MessageAction>()
  // Route and round trip per peer, refreshed by diagnostics.measure().
  const measured = new Map<string, { route?: Route; rttMs?: number }>()

  room.onPeerJoin = (id) => {
    failedPeers.delete(id)
    events.emit('join', id)
  }
  room.onPeerLeave = (id) => {
    measured.delete(id)
    events.emit('leave', id)
  }
  room.onPeerStream = (stream, id) => events.emit('stream', stream, id)

  const action = (channel: string) => {
    let a = actions.get(channel)
    if (!a) {
      a = room.makeAction(channel)
      a.onMessage = (data, { peerId }) => channels.emit(channel, data, peerId)
      actions.set(channel, a)
    }
    return a
  }

  const diagnostics: NetDiagnostics = {
    snapshot(): NetStatus {
      const sockets = (getRelaySockets() ?? {}) as Record<string, WebSocket | undefined>
      const peers: PeerLink[] = Object.entries(room.getPeers()).map(([id, pc]) => ({
        id,
        state: linkState(pc),
        ...measured.get(id),
      }))
      for (const id of failedPeers) if (!peers.some((p) => p.id === id)) peers.push({ id, state: 'failed' })
      return {
        kind: 'internet',
        relays: RELAY_URLS.map((url) => ({ url, state: relayState(sockets[url]) })),
        negotiating: pcs.negotiating(),
        failures: joinErrors + pcs.failures,
        peers,
      }
    },
    async measure() {
      await Promise.all(
        Object.entries(room.getPeers()).map(async ([id, pc]) => {
          const stats = await linkStats(pc).catch((): LinkStats => ({}))
          if (stats.rttMs === undefined && pc.connectionState === 'connected')
            stats.rttMs = await room.ping(id).catch(() => undefined)
          measured.set(id, stats)
        }),
      )
    },
  }

  return {
    selfId,
    peers: () => Object.keys(room.getPeers()),
    send(channel, data, to) {
      void action(channel).send(data as DataPayload, to ? { target: to } : undefined)
    },
    on(channel, handler) {
      action(channel)
      return channels.on(channel, handler)
    },
    onPeerJoin: (h) => events.on('join', h),
    onPeerLeave: (h) => events.on('leave', h),
    media: {
      addStream(stream, to) {
        // Delivery failures (peer gone mid-setup) only cost that peer's audio.
        for (const p of room.addStream(stream, to ? { target: to } : undefined)) p.catch(() => {})
      },
      removeStream: (stream, to) => room.removeStream(stream, to ? { target: to } : undefined),
      onPeerStream: (h) => events.on('stream', h),
    },
    diagnostics,
    leave() {
      events.clear()
      channels.clear()
      pcs.clear()
      void room.leave()
    },
  }
}

function relayState(socket: WebSocket | undefined): RelayState {
  if (!socket || socket.readyState === WebSocket.CONNECTING) return 'connecting'
  return socket.readyState === WebSocket.OPEN ? 'open' : 'closed'
}

function linkState(pc: RTCPeerConnection): LinkState {
  switch (pc.connectionState) {
    case 'connected':
      return 'connected'
    case 'failed':
    case 'closed':
      return 'failed'
    default:
      return 'connecting'
  }
}

interface LinkStats {
  route?: Route
  rttMs?: number
}

/** Route (direct or through TURN) and round trip of the connection's active candidate pair. */
async function linkStats(pc: RTCPeerConnection): Promise<LinkStats> {
  const report = await pc.getStats()
  let pair: any
  report.forEach((s: any) => {
    if (s.type === 'transport' && s.selectedCandidatePairId) pair = report.get(s.selectedCandidatePairId)
  })
  // Firefox has no transport stats: use the nominated pair that succeeded.
  if (!pair)
    report.forEach((s: any) => {
      if (s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded') pair ??= s
    })
  if (!pair) return {}
  const local = report.get(pair.localCandidateId)
  const remote = report.get(pair.remoteCandidateId)
  const viaTurn = local?.candidateType === 'relay' || remote?.candidateType === 'relay'
  const rtt = pair.currentRoundTripTime
  return {
    route: viaTurn ? 'relay' : 'direct',
    ...(typeof rtt === 'number' ? { rttMs: Math.round(rtt * 1000) } : {}),
  }
}

/**
 * Watches every RTCPeerConnection Trystero makes. It pre-creates offers, so a
 * connection alone means nothing; one with a remote description is a peer
 * that answered over the relays. Counts those still negotiating, and failures.
 */
function createPcTracker() {
  const live = new Set<RTCPeerConnection>()
  const tracker = {
    failures: 0,
    ctor: undefined as typeof RTCPeerConnection | undefined,
    negotiating() {
      let n = 0
      for (const pc of live)
        if (pc.remoteDescription && (pc.connectionState === 'new' || pc.connectionState === 'connecting')) n++
      return n
    },
    clear: () => live.clear(),
  }
  if (typeof RTCPeerConnection === 'undefined') return tracker
  tracker.ctor = class TrackedPeerConnection extends RTCPeerConnection {
    constructor(config?: RTCConfiguration) {
      super(config)
      live.add(this)
      this.addEventListener('connectionstatechange', () => {
        if (this.connectionState === 'failed') {
          tracker.failures++
          netLog('peer connection failed')
        }
        if (this.connectionState === 'failed' || this.connectionState === 'closed') live.delete(this)
      })
    }
    override close() {
      live.delete(this)
      super.close()
    }
  }
  return tracker
}
