import { getRelaySockets, joinRoom, selfId, type DataPayload, type MessageAction } from 'trystero'
import { Emitter } from '../core/emitter'
import { netLog } from './debug'
import { RELAY_URLS, roomConfig } from './net-config'
import { turnMode, turnServers } from './turn'
import {
  FailureLog,
  type LinkState,
  type NetDiagnostics,
  type NetStatus,
  type PeerLink,
  type RelayState,
} from './status'
import type { Transport } from './transport'

/**
 * Internet transport: WebRTC data channels between browsers. Peers find each
 * other through public Nostr relays (handled by Trystero), so no server of our
 * own is needed. Only connection setup goes through relays; game traffic is
 * direct peer to peer.
 */
export function createTrysteroTransport(appId: string, roomId: string): Transport {
  const failures = new FailureLog()
  const pcs = createPcTracker(() => failures.add(performance.now()))
  const turn = turnServers()
  netLog('turn:', turn.length ? 'on' : 'off')
  const room = joinRoom(
    { ...roomConfig(appId, turn, turnMode() === 'only'), rtcPolyfill: pcs.ctor },
    roomId,
    {
      // A peer we exchanged offers with but could not connect to.
      onJoinError({ peerId, error }) {
        failures.add(performance.now(), peerId || undefined)
        netLog('join error', peerId, error)
      },
    },
  )
  const events = new Emitter<{ join: [string]; leave: [string]; stream: [MediaStream, string] }>()
  const channels = new Emitter<Record<string, [unknown, string]>>()
  const actions = new Map<string, MessageAction>()
  // Round trip per peer, refreshed by diagnostics.measure().
  const measured = new Map<string, { rttMs?: number }>()

  room.onPeerJoin = (id) => {
    failures.resolve(id)
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
      const links = room.getPeers()
      const peers: PeerLink[] = Object.entries(links).map(([id, pc]) => ({
        id,
        state: linkState(pc),
        ...measured.get(id),
      }))
      const open = failures.open(performance.now(), (id) => links[id]?.connectionState === 'connected')
      for (const id of open.peers) if (!links[id]) peers.push({ id, state: 'failed' })
      return {
        kind: 'internet',
        relays: RELAY_URLS.map((url) => ({ url, state: relayState(sockets[url]) })),
        negotiating: pcs.negotiating(),
        failures: failures.total,
        openFailures: open.count,
        peers,
      }
    },
    async measure() {
      await Promise.all(
        Object.entries(room.getPeers()).map(async ([id, pc]) => {
          let rttMs = await roundTrip(pc).catch(() => undefined)
          if (rttMs === undefined && pc.connectionState === 'connected')
            rttMs = await room.ping(id).catch(() => undefined)
          measured.set(id, rttMs === undefined ? {} : { rttMs })
        }),
      )
    },
  }

  return {
    selfId,
    peers: () => Object.keys(room.getPeers()),
    send(channel, data, to) {
      // A peer that just closed stays listed until ICE times out: its sends reject. Not fatal.
      action(channel)
        .send(data as DataPayload, to ? { target: to } : undefined)
        .catch((e) => netLog('send failed', channel, e))
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

/** Round trip (ms) of the connection's active candidate pair, if the browser reports it. */
async function roundTrip(pc: RTCPeerConnection): Promise<number | undefined> {
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
  const rtt = pair?.currentRoundTripTime
  return typeof rtt === 'number' ? Math.round(rtt * 1000) : undefined
}

/**
 * Watches every RTCPeerConnection Trystero makes. It pre-creates offers, so a
 * connection alone means nothing; one with a remote description is a peer
 * that answered over the relays. Counts those still negotiating, and reports
 * each connection that fails (connection or ICE state 'failed', once per connection).
 */
function createPcTracker(onFailed: () => void) {
  const live = new Set<RTCPeerConnection>()
  const tracker = {
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
      let failed = false
      const check = () => {
        const isFailed = this.connectionState === 'failed' || this.iceConnectionState === 'failed'
        if (isFailed && !failed) {
          failed = true
          onFailed()
          netLog('peer connection failed', this.connectionState, this.iceConnectionState)
        }
        if (isFailed || this.connectionState === 'closed') live.delete(this)
      }
      this.addEventListener('connectionstatechange', check)
      this.addEventListener('iceconnectionstatechange', check)
    }
    override close() {
      live.delete(this)
      super.close()
    }
  }
  return tracker
}
