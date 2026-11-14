import {
  createUserIdentity,
  getRelaySockets,
  joinRoom,
  type DataPayload,
  type MessageAction,
  type Room,
} from 'trystero'
import { Emitter } from '../core/emitter'
import { netLog } from './debug'
import { RELAY_URLS, roomConfig } from './net-config'
import { isPeerId } from './relay-protocol'
import { turnMode, turnServers } from './turn'
import {
  FailureLog,
  type LinkState,
  type NetDiagnostics,
  type NetStatus,
  type PeerLink,
  type RelayState,
} from './status'
import { randomId, type Transport } from './transport'

/** Ms after a (re)join the attempt counts as "trying" (setting up, before any connection negotiates). */
const TRYING_MS = 6000

/** Each side's own peer id, sent once over a new direct link (Trystero's own ids are async and change on a rejoin). */
const HELLO = 'pf-id'

/** Rooms still leaving, per app + room: Trystero 0.27 throws on joining a room it's still in. */
const leaving = new Map<string, Promise<void>>()

/**
 * Internet transport: WebRTC data channels between browsers. Peers find each
 * other through public Nostr relays (handled by Trystero), so no server of our
 * own is needed. Only connection setup goes through relays; game traffic is
 * direct peer to peer.
 *
 * Peers are known by our own random id (the same one the relay transport uses,
 * see hybrid.ts): a peer counts as joined once its id arrives over the new
 * link, and Trystero's ids stay inside this file.
 */
export function createTrysteroTransport(appId: string, roomId: string): Transport {
  const selfId = randomId()
  const key = `${appId}\u0000${roomId}`
  const failures = new FailureLog()
  const pcs = createPcTracker(() => failures.add(performance.now()))
  const events = new Emitter<{ join: [string]; leave: [string]; stream: [MediaStream, string] }>()
  const channels = new Emitter<Record<string, [unknown, string]>>()
  const actions = new Map<string, MessageAction>()
  /** Channels someone listens on: a rejoined room opens them again. */
  const subscribed = new Set<string>()
  // Round trip and TURN use per peer (our ids), refreshed by diagnostics.measure().
  const measured = new Map<string, { rttMs?: number; turn?: boolean }>()
  /** Trystero peer id ↔ our peer id, for the links of the current room. */
  const idOf = new Map<string, string>()
  const peerOf = new Map<string, string>()
  /** Rooms being left (retryDirect, leave): their late events are ignored. */
  const retired = new WeakSet<object>()
  let room: Room | null = null
  let retrying = false
  let closed = false

  const live = (r: Room) => r === room && !retired.has(r)
  const unlink = (peerId: string) => {
    const id = idOf.get(peerId)
    if (!id) return
    idOf.delete(peerId)
    peerOf.delete(id)
    measured.delete(id)
    events.emit('leave', id)
  }

  /**
   * TURN is offered from the first attempt, on both sides (TURN offered by one side only failed to
   * link a phone on mobile data). Direct still comes first: WebRTC ranks direct pairs (host / srflx)
   * above relayed ones and switches to a direct pair whenever one works.
   */
  const withTurn = turnMode() !== 'off'
  /** When the current room started (a fresh attempt counts as trying for a few seconds). */
  let startedAt = performance.now()

  const open = (): Room => {
    const turn = withTurn ? turnServers() : []
    netLog('turn:', turn.length ? 'on' : withTurn ? 'none available' : 'not yet (direct first)')
    const r = joinRoom(
      {
        ...roomConfig(appId, turn, turnMode() === 'only'),
        // A fresh key per room (re)join: no storage, two tabs of one browser are two players, and
        // after retryDirect the others see a new peer at once instead of waiting out the old one.
        identity: () => createUserIdentity(),
        rtcPolyfill: pcs.ctor,
      },
      roomId,
    )
    r.onError((e) => {
      if (!live(r)) return
      // A peer we exchanged offers with but could not connect to.
      if (e.code === 'peer-connect-failed') failures.add(performance.now(), e.peerId)
      netLog('room error', e.code, e.message)
    })
    const hello = r.makeAction<string>(HELLO)
    r.onPeerJoin(({ peerId }) => {
      if (live(r)) void hello.send(selfId, { target: peerId }).catch(() => {})
    })
    hello.onMessage((id, { peerId }) => {
      if (!live(r) || !isPeerId(id) || id === selfId || idOf.has(peerId)) return
      // The same id on a new link: that peer rejoined (retryDirect); its old link is stale.
      const old = peerOf.get(id)
      if (old) {
        netLog('direct: peer rejoined', id)
        unlink(old)
      }
      idOf.set(peerId, id)
      peerOf.set(id, peerId)
      failures.resolve(peerId)
      events.emit('join', id)
    })
    r.onPeerLeave(({ peerId }) => {
      if (live(r)) unlink(peerId)
    })
    r.onPeerStream((stream, { peerId }) => {
      const id = live(r) ? idOf.get(peerId) : undefined
      if (id) events.emit('stream', stream, id)
    })
    return r
  }

  const start = () => {
    startedAt = performance.now()
    room = open()
    for (const channel of subscribed) action(channel)
  }
  // Rejoining a room this page is still leaving (e.g. "try again"): wait for that first.
  const pending = leaving.get(key)
  if (pending) void pending.then(() => !closed && start())
  else start()

  const leaveRoom = (r: Room) => {
    retired.add(r)
    const done = r
      .leave()
      .catch(() => {})
      .finally(() => {
        if (leaving.get(key) === done) leaving.delete(key)
      })
    leaving.set(key, done)
    return done
  }

  function action(channel: string): MessageAction | null {
    if (!room) return null
    let a = actions.get(channel)
    if (!a) {
      const r = room
      a = r.makeAction(channel)
      a.onMessage((data, { peerId }) => {
        const id = live(r) ? idOf.get(peerId) : undefined
        if (id) channels.emit(channel, data, id)
      })
      actions.set(channel, a)
    }
    return a
  }

  const diagnostics: NetDiagnostics = {
    snapshot(): NetStatus {
      const sockets = (getRelaySockets() ?? {}) as Record<string, WebSocket | undefined>
      const links = room?.getPeers() ?? {}
      const peers: PeerLink[] = []
      for (const [peerId, info] of Object.entries(links)) {
        const id = idOf.get(peerId)
        if (!id) continue
        peers.push({
          id,
          state: info.connection ? linkState(info.connection) : 'connecting',
          ...measured.get(id),
        })
      }
      const open = failures.open(
        performance.now(),
        (peerId) => links[peerId]?.connection?.connectionState === 'connected',
      )
      return {
        kind: 'internet',
        relays: RELAY_URLS.map((url) => ({ url, state: relayState(sockets[url]) })),
        negotiating: pcs.negotiating(),
        // A retry leaving / rejoining, a fresh room setting up, or a connection negotiating.
        trying: retrying || pcs.negotiating() > 0 || performance.now() - startedAt < TRYING_MS,
        failures: failures.total,
        openFailures: open.count,
        peers,
      }
    },
    async measure() {
      const r = room
      if (!r) return
      await Promise.all(
        Object.entries(r.getPeers()).map(async ([peerId, info]) => {
          const id = idOf.get(peerId)
          const pc = info.connection
          if (!id || !pc) return
          const pair = await selectedPair(pc).catch(() => ({}) as PairInfo)
          let rttMs = pair.rttMs
          if (rttMs === undefined && pc.connectionState === 'connected')
            rttMs = await r.ping(peerId).catch(() => undefined)
          measured.set(id, {
            ...(rttMs === undefined ? {} : { rttMs }),
            ...(pair.turn ? { turn: true } : {}),
          })
        }),
      )
    },
  }

  /** Trystero's target for one of our ids; null = not linked (nothing to send). */
  const targetOf = (to: string | undefined) => (to === undefined ? undefined : (peerOf.get(to) ?? null))

  return {
    selfId,
    peers: () => [...peerOf.keys()],
    send(channel, data, to) {
      // Mid-retry the old room is closing: the hybrid transport sends through the relay meanwhile.
      if (retrying) return
      const target = targetOf(to)
      if (target === null) return
      // A peer that just closed stays listed until ICE times out: its sends reject. Not fatal.
      action(channel)
        ?.send(data as DataPayload, target ? { target } : undefined)
        .catch((e) => netLog('send failed', channel, e))
    },
    on(channel, handler) {
      subscribed.add(channel)
      if (!retrying) action(channel)
      return channels.on(channel, handler)
    },
    onPeerJoin: (h) => events.on('join', h),
    onPeerLeave: (h) => events.on('leave', h),
    media: {
      addStream(stream, to) {
        const target = targetOf(to)
        // Delivery failures (peer gone mid-setup) only cost that peer's audio.
        if (target !== null) void room?.addStream(stream, target ? { target } : undefined).catch(() => {})
      },
      removeStream(stream, to) {
        const target = targetOf(to)
        if (target !== null) room?.removeStream(stream, target ? { target } : undefined)
      },
      onPeerStream: (h) => events.on('stream', h),
    },
    diagnostics,
    async retryDirect() {
      // A fresh attempt (the watchdog, Retry, allowing local network access): the old room's
      // links are gone (the relay carries those peers meanwhile), the new one negotiates again.
      const old = room
      if (retrying || !old || closed) return
      retrying = true
      for (const peerId of [...idOf.keys()]) unlink(peerId)
      actions.clear()
      measured.clear()
      // Trystero 0.27 won't join a room it's still in: leave fully, then join again.
      await leaveRoom(old)
      retrying = false
      if (closed) return
      start()
      netLog('direct: retry, rejoined the room')
    },
    leave() {
      closed = true
      events.clear()
      channels.clear()
      pcs.clear()
      if (room) void leaveRoom(room)
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
interface PairInfo {
  rttMs?: number
  /** Either end of the active candidate pair is a TURN relay candidate. */
  turn?: boolean
}

/** Round trip and TURN use of the connection's active candidate pair. */
async function selectedPair(pc: RTCPeerConnection): Promise<PairInfo> {
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
  const type = (id: unknown) => (typeof id === 'string' ? report.get(id)?.candidateType : undefined)
  return {
    ...(typeof rtt === 'number' ? { rttMs: Math.round(rtt * 1000) } : {}),
    ...(pair && (type(pair.localCandidateId) === 'relay' || type(pair.remoteCandidateId) === 'relay')
      ? { turn: true }
      : {}),
  }
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
