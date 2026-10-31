import { Emitter } from '../core/emitter'
import { randomId, type Transport } from './transport'

type Packet =
  | { k: 'hello' | 'here' | 'bye'; from: string; to?: string }
  | { k: 'msg'; from: string; to?: string; ch: string; data: unknown }

/**
 * Development transport: connects tabs of the same browser via
 * BroadcastChannel. Open the game in two tabs with `?net=local` to test
 * multiplayer without any network. (Needs http://, e.g. `npm run dev`.)
 */
export function createBroadcastTransport(appId: string, roomId: string): Transport {
  const selfId = randomId()
  const bc = new BroadcastChannel(`play-forge:${appId}:${roomId}`)
  const peers = new Set<string>()
  const events = new Emitter<{ join: [string]; leave: [string] }>()
  const channels = new Emitter<Record<string, [unknown, string]>>()
  let closed = false
  const post = (p: Packet) => {
    if (!closed) bc.postMessage(p)
  }

  const addPeer = (id: string) => {
    if (peers.has(id)) return
    peers.add(id)
    events.emit('join', id)
  }

  bc.onmessage = (e: MessageEvent<Packet>) => {
    const p = e.data
    if (p.from === selfId || (p.to && p.to !== selfId)) return
    switch (p.k) {
      case 'hello':
        // Announce ourselves before handlers run, so anything they send
        // arrives after the newcomer knows who we are.
        post({ k: 'here', from: selfId, to: p.from })
        addPeer(p.from)
        break
      case 'here':
        addPeer(p.from)
        break
      case 'bye':
        if (peers.delete(p.from)) events.emit('leave', p.from)
        break
      case 'msg':
        if (peers.has(p.from)) channels.emit(p.ch, p.data, p.from)
        break
    }
  }

  const leave = () => {
    if (closed) return
    post({ k: 'bye', from: selfId })
    closed = true
    bc.close()
    events.clear()
    channels.clear()
    globalThis.removeEventListener?.('pagehide', leave)
  }
  globalThis.addEventListener?.('pagehide', leave)

  // Announce after the caller has had a chance to subscribe to events.
  queueMicrotask(() => post({ k: 'hello', from: selfId }))

  return {
    selfId,
    peers: () => [...peers],
    send: (ch, data, to) => post({ k: 'msg', from: selfId, to, ch, data }),
    on: (ch, handler) => channels.on(ch, handler),
    onPeerJoin: (h) => events.on('join', h),
    onPeerLeave: (h) => events.on('leave', h),
    leave,
  }
}
