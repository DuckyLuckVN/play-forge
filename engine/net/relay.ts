import { Emitter } from '../core/emitter'
import { netLog } from './debug'
import { FATAL_CLOSES, RELAY_LIMITS, joinUrl, parseServerMessage, type ClientMessage } from './relay-protocol'
import type { GameRelayState } from './status'
import { randomId, type Transport } from './transport'

/**
 * Client of the game relay server (server/relay): room messages go through a
 * WebSocket to our own server instead of browser to browser. Used by the
 * hybrid transport for peers whose direct WebRTC link isn't up. Reconnects by
 * itself with backoff. No media (voice stays peer to peer).
 */

export type { GameRelayState }

export interface RelayTransport extends Transport {
  /** The socket to the relay server. */
  state(): GameRelayState
  /** Last round trip to the relay server, in ms. */
  serverRttMs(): number | undefined
  /** Last round trip to a peer through the relay, in ms. */
  peerRttMs(peerId: string): number | undefined
  /** One frame for several peers (the server fans it out). */
  sendTo(channel: string, data: unknown, to: string[]): void
  /** Refresh the round trips (server and peers). */
  measure(): Promise<void>
}

export interface RelayOptions {
  /** For tests. */
  WebSocket?: new (url: string) => WebSocket
  /** Reconnect delays (ms), the last one repeats. */
  backoff?: number[]
  /** How long measure() waits for answers. */
  measureTimeoutMs?: number
}

const BACKOFF = [1000, 2000, 4000, 8000, 15000]
/** Internal ping channels, never passed to handlers ('~' is reserved). */
const PING = '~pi'
const PONG = '~po'

export function createRelayTransport(
  serverUrl: string,
  join: { app: string; room: string; id: string },
  opts: RelayOptions = {},
): RelayTransport {
  const WS = opts.WebSocket ?? WebSocket
  const backoff = opts.backoff ?? BACKOFF
  const measureTimeout = opts.measureTimeoutMs ?? 2000
  const url = joinUrl(serverUrl, { ...join, key: randomId(24) })
  const events = new Emitter<{ join: [string]; leave: [string] }>()
  const channels = new Emitter<Record<string, [unknown, string]>>()
  const peers = new Set<string>()
  const peerRtt = new Map<string, number>()
  let serverRtt: number | undefined
  let state: GameRelayState = 'connecting'
  let socket: WebSocket | null = null
  let attempt = 0
  let retry: ReturnType<typeof setTimeout> | null = null
  let left = false
  // Pending measure() answers: resolve once every expected pong is in.
  let waiting: { left: Set<string>; done: () => void } | null = null

  const write = (msg: ClientMessage) => {
    if (state !== 'open' || !socket) return
    const text = JSON.stringify(msg)
    if (text.length > RELAY_LIMITS.maxMessageBytes) {
      netLog('relay: message too large, dropped', msg.t === 'send' ? msg.ch : msg.t, text.length)
      return
    }
    socket.send(text)
  }

  const answered = (key: string) => {
    if (!waiting) return
    waiting.left.delete(key)
    if (!waiting.left.size) waiting.done()
  }

  const dropPeers = () => {
    for (const id of [...peers]) {
      peers.delete(id)
      peerRtt.delete(id)
      events.emit('leave', id)
    }
  }

  function connect() {
    state = 'connecting'
    const ws = new WS(url)
    socket = ws
    ws.onopen = () => {
      if (socket !== ws) return
      attempt = 0
      state = 'open'
      netLog('relay: open')
    }
    ws.onmessage = (e: MessageEvent) => {
      if (socket !== ws || typeof e.data !== 'string') return
      const msg = parseServerMessage(e.data)
      if (!msg) return
      switch (msg.t) {
        case 'hi': {
          // After a reconnect: say goodbye to whoever left meanwhile, hello to newcomers.
          const now = new Set(msg.peers)
          for (const id of [...peers]) if (!now.has(id)) leavePeer(id)
          for (const id of msg.peers) joinPeer(id)
          break
        }
        case 'join':
          joinPeer(msg.id)
          break
        case 'leave':
          leavePeer(msg.id)
          break
        case 'pong':
          serverRtt = Math.round(performance.now() - msg.n)
          answered('')
          break
        case 'msg':
          if (msg.ch === PING) write({ t: 'send', ch: PONG, d: msg.d, to: [msg.from] })
          else if (msg.ch === PONG) {
            if (typeof msg.d === 'number') peerRtt.set(msg.from, Math.round(performance.now() - msg.d))
            answered(msg.from)
          } else if (!msg.ch.startsWith('~') && peers.has(msg.from)) channels.emit(msg.ch, msg.d, msg.from)
          break
      }
    }
    ws.onclose = (e: CloseEvent) => {
      if (socket !== ws) return
      socket = null
      dropPeers()
      if (left) return
      if (FATAL_CLOSES.has(e.code)) {
        state = 'closed'
        netLog('relay: refused', e.code, e.reason)
        return
      }
      state = 'closed'
      const delay = backoff[Math.min(attempt++, backoff.length - 1)]!
      retry = setTimeout(connect, delay * (0.75 + Math.random() * 0.5))
    }
    // An error is always followed by close; nothing to do here.
    ws.onerror = () => {}
  }

  function joinPeer(id: string) {
    if (id === join.id || peers.has(id)) return
    peers.add(id)
    events.emit('join', id)
  }
  function leavePeer(id: string) {
    if (!peers.delete(id)) return
    peerRtt.delete(id)
    events.emit('leave', id)
  }

  connect()

  return {
    selfId: join.id,
    peers: () => [...peers],
    send(channel, data, to) {
      write(to ? { t: 'send', ch: channel, d: data, to: [to] } : { t: 'send', ch: channel, d: data })
    },
    sendTo(channel, data, to) {
      if (to.length) write({ t: 'send', ch: channel, d: data, to })
    },
    on: (channel, handler) => channels.on(channel, handler),
    onPeerJoin: (h) => events.on('join', h),
    onPeerLeave: (h) => events.on('leave', h),
    state: () => (left ? 'off' : state),
    serverRttMs: () => serverRtt,
    peerRttMs: (id) => peerRtt.get(id),
    measure() {
      if (state !== 'open') return Promise.resolve()
      waiting?.done()
      return new Promise<void>((resolve) => {
        const timer = setTimeout(() => finish(), measureTimeout)
        const finish = () => {
          clearTimeout(timer)
          if (waiting === entry) waiting = null
          resolve()
        }
        const entry = { left: new Set(['', ...peers]), done: finish }
        waiting = entry
        const n = performance.now()
        write({ t: 'ping', n })
        if (peers.size) write({ t: 'send', ch: PING, d: n, to: [...peers] })
      })
    },
    leave() {
      left = true
      if (retry) clearTimeout(retry)
      waiting?.done()
      const ws = socket
      socket = null
      peers.clear()
      events.clear()
      channels.clear()
      ws?.close(1000, 'leave')
    },
  }
}
