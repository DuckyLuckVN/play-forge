import { afterEach, describe, expect, it, vi } from 'vitest'

type Handler = (...a: any[]) => void
interface FakeAction {
  sent: { data: unknown; target?: string }[]
  handlers: Handler[]
}
interface FakeRoom {
  roomId: string
  actions: Map<string, FakeAction>
  peers: Record<string, { userId: string; connection: null }>
  on: Record<string, Handler[]>
  left: boolean
  finishLeave?: () => void
}
const rooms: FakeRoom[] = []
let sendResult: () => Promise<void> = () => Promise.resolve()
/** Leaving resolves at once unless a test holds it. */
let holdLeave = false

vi.mock('trystero', () => ({
  createUserIdentity: async () => ({}),
  getRelaySockets: () => ({}),
  joinRoom: (_config: unknown, roomId: string) => {
    const r: FakeRoom = { roomId, actions: new Map(), peers: {}, on: {}, left: false }
    rooms.push(r)
    const listen = (name: string) => (h: Handler) => {
      ;(r.on[name] ??= []).push(h)
      return () => {}
    }
    return {
      getPeers: () => r.peers,
      makeAction: (name: string) => {
        const a: FakeAction = { sent: [], handlers: [] }
        r.actions.set(name, a)
        return {
          send: (data: unknown, opts?: { target?: string }) => {
            a.sent.push({ data, target: opts?.target })
            return sendResult()
          },
          onMessage: (h: Handler) => {
            a.handlers.push(h)
            return () => {}
          },
        }
      },
      onError: listen('error'),
      onPeerJoin: listen('join'),
      onPeerLeave: listen('leave'),
      onPeerStream: listen('stream'),
      addStream: async () => {},
      removeStream: () => {},
      ping: async () => 5,
      leave: () =>
        new Promise<void>((resolve) => {
          r.left = true
          if (holdLeave) r.finishLeave = resolve
          else resolve()
        }),
    }
  },
}))

import { createTrysteroTransport } from './trystero'

/** Trystero says peer `peerId` linked, and its hello carries our-style id `id`. */
function link(r: FakeRoom, peerId: string, id: string) {
  r.peers[peerId] = { userId: `u-${peerId}`, connection: null }
  r.on.join?.forEach((h) => h({ peerId, userId: `u-${peerId}`, roles: [] }))
  r.actions.get('pf-id')!.handlers.forEach((h) => h(id, { peerId, userId: `u-${peerId}`, roles: [] }))
}
const deliver = (r: FakeRoom, channel: string, data: unknown, peerId: string) =>
  r.actions.get(channel)!.handlers.forEach((h) => h(data, { peerId, userId: `u-${peerId}`, roles: [] }))

describe('trystero transport', () => {
  const unhandled = vi.fn()
  afterEach(() => {
    process.off('unhandledRejection', unhandled)
    rooms.length = 0
    sendResult = () => Promise.resolve()
    holdLeave = false
  })

  it('a send that rejects (peer gone, channel stopped) is swallowed, not unhandled', async () => {
    process.on('unhandledRejection', unhandled)
    sendResult = () => Promise.reject(new Error('data channel stopped draining'))
    const transport = createTrysteroTransport('app', 'room')
    expect(() => transport.send('state', { a: 1 })).not.toThrow()
    await new Promise((r) => setTimeout(r, 20))
    expect(unhandled).not.toHaveBeenCalled()
    transport.leave()
  })

  it('peers are known by our own ids: hello on link, join on its answer, messages and sends mapped', () => {
    const t = createTrysteroTransport('app', 'room')
    expect(t.selfId).toMatch(/^[a-z0-9]{12}$/)
    const joined: string[] = []
    const got: [unknown, string][] = []
    t.onPeerJoin((id) => joined.push(id))
    t.on('state', (d, from) => got.push([d, from]))
    const r = rooms[0]
    link(r, 'tp1', 'bob123456789')
    // We introduced ourselves to the new link.
    expect(r.actions.get('pf-id')!.sent).toEqual([{ data: t.selfId, target: 'tp1' }])
    expect(joined).toEqual(['bob123456789'])
    expect(t.peers()).toEqual(['bob123456789'])
    deliver(r, 'state', { n: 1 }, 'tp1')
    expect(got).toEqual([[{ n: 1 }, 'bob123456789']])
    t.send('state', { n: 2 }, 'bob123456789')
    expect(r.actions.get('state')!.sent.at(-1)).toEqual({ data: { n: 2 }, target: 'tp1' })
    // Not linked: nothing goes out (the relay carries it).
    t.send('state', { n: 3 }, 'stranger1234')
    expect(r.actions.get('state')!.sent).toHaveLength(1)
    t.leave()
  })

  it('ignores messages before a hello and bad ids', () => {
    const t = createTrysteroTransport('app', 'room')
    const joined: string[] = []
    const got: unknown[] = []
    t.onPeerJoin((id) => joined.push(id))
    t.on('state', (d) => got.push(d))
    const r = rooms[0]
    deliver(r, 'state', 'early', 'tp1')
    link(r, 'tp1', 'x') // too short for a peer id
    expect(joined).toEqual([])
    expect(got).toEqual([])
    t.leave()
  })

  it('the same id on a new link replaces the old one (that peer rejoined after a retry)', () => {
    const t = createTrysteroTransport('app', 'room')
    const events: string[] = []
    const got: [unknown, string][] = []
    t.onPeerJoin((id) => events.push(`+${id}`))
    t.onPeerLeave((id) => events.push(`-${id}`))
    t.on('state', (d, from) => got.push([d, from]))
    const r = rooms[0]
    link(r, 'tp1', 'bob123456789')
    link(r, 'tp2', 'bob123456789')
    expect(events).toEqual(['+bob123456789', '-bob123456789', '+bob123456789'])
    t.send('state', 'x', 'bob123456789')
    expect(r.actions.get('state')!.sent.at(-1)!.target).toBe('tp2')
    // The old link's late messages no longer count.
    deliver(r, 'state', 'stale', 'tp1')
    deliver(r, 'state', 'fresh', 'tp2')
    expect(got).toEqual([['fresh', 'bob123456789']])
    t.leave()
  })

  it('a link closing is that peer leaving', () => {
    const t = createTrysteroTransport('app', 'room')
    const left: string[] = []
    t.onPeerLeave((id) => left.push(id))
    const r = rooms[0]
    link(r, 'tp1', 'bob123456789')
    r.on.leave!.forEach((h) => h({ peerId: 'tp1', userId: 'u-tp1' }))
    expect(left).toEqual(['bob123456789'])
    expect(t.peers()).toEqual([])
    t.leave()
  })

  it('retryDirect: leaves fully, then rejoins with the same handlers and channels; old events ignored', async () => {
    const t = createTrysteroTransport('app', 'room')
    const got: unknown[] = []
    const left: string[] = []
    const joined: string[] = []
    t.on('state', (d) => got.push(d))
    t.onPeerLeave((id) => left.push(id))
    t.onPeerJoin((id) => joined.push(id))
    link(rooms[0], 'tp1', 'bob123456789')
    holdLeave = true
    const retry = t.retryDirect!()
    // The old link is gone at once; no new room until the old one has left.
    expect(left).toEqual(['bob123456789'])
    expect(rooms).toHaveLength(1)
    rooms[0].finishLeave!()
    await retry
    expect(rooms).toHaveLength(2)
    expect(rooms[1].actions.has('state')).toBe(true)
    link(rooms[1], 'tp9', 'bob123456789')
    deliver(rooms[1], 'state', 'fresh', 'tp9')
    // The old room's late events are ignored.
    link(rooms[0], 'tp1', 'ghost1234567')
    deliver(rooms[0], 'state', 'stale', 'tp1')
    expect(joined).toEqual(['bob123456789', 'bob123456789'])
    expect(got).toEqual(['fresh'])
    holdLeave = false
    t.leave()
  })

  it('opening the same room again while it is still leaving waits for the leave (Trystero would throw)', async () => {
    holdLeave = true
    const a = createTrysteroTransport('app', 'room')
    a.leave()
    const b = createTrysteroTransport('app', 'room')
    b.on('state', () => {})
    expect(rooms).toHaveLength(1)
    rooms[0].finishLeave!()
    await new Promise((r) => setTimeout(r, 0))
    expect(rooms).toHaveLength(2)
    expect(rooms[1].actions.has('state')).toBe(true)
    holdLeave = false
    b.leave()
  })
})
