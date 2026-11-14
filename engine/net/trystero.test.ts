import { afterEach, describe, expect, it, vi } from 'vitest'

const sends: Array<(...a: unknown[]) => Promise<void>> = []
interface FakeRoom {
  peers: Record<string, unknown>
  actions: string[]
  left: boolean
  onPeerJoin?: (id: string) => void
  onPeerLeave?: (id: string) => void
}
const rooms: FakeRoom[] = []
vi.mock('trystero', () => ({
  selfId: 'me',
  getRelaySockets: () => ({}),
  joinRoom: () => {
    const r: FakeRoom = { peers: {}, actions: [], left: false }
    rooms.push(r)
    return Object.assign(r, {
      getPeers: () => r.peers,
      makeAction: (name: string) => {
        r.actions.push(name)
        return { send: (...a: unknown[]) => sends[0](...a) }
      },
      leave: async () => {
        r.left = true
      },
    })
  },
}))

import { createTrysteroTransport } from './trystero'

describe('trystero transport', () => {
  const unhandled = vi.fn()
  afterEach(() => {
    process.off('unhandledRejection', unhandled)
    rooms.length = 0
  })

  it('a send that rejects (peer gone, channel stopped) is swallowed, not unhandled', async () => {
    process.on('unhandledRejection', unhandled)
    sends[0] = () => Promise.reject(new Error('data channel stopped draining'))
    const transport = createTrysteroTransport('app', 'room')
    expect(() => transport.send('state', { a: 1 }, 'gone')).not.toThrow()
    await new Promise((r) => setTimeout(r, 20))
    expect(unhandled).not.toHaveBeenCalled()
  })

  it('retryDirect: leaves and rejoins the room, keeping handlers and channels (a fresh connection attempt)', async () => {
    sends[0] = () => Promise.resolve()
    const transport = createTrysteroTransport('app', 'room')
    const got: unknown[] = []
    const left: string[] = []
    const joined: string[] = []
    transport.on('state', (d) => got.push(d))
    transport.onPeerLeave((id) => left.push(id))
    transport.onPeerJoin((id) => joined.push(id))
    rooms[0].onPeerJoin?.('p1')
    rooms[0].peers = { p1: {} }
    await transport.retryDirect!()
    expect(rooms).toHaveLength(2)
    expect(rooms[0].left).toBe(true)
    // Peers linked through the old room are gone from it (the relay still carries them).
    expect(left).toEqual(['p1'])
    // The subscribed channel is opened on the new room, and its peers arrive as before.
    expect(rooms[1].actions).toContain('state')
    rooms[1].onPeerJoin?.('p1')
    expect(joined).toEqual(['p1', 'p1'])
    // The old room's late events are ignored.
    rooms[0].onPeerJoin?.('ghost')
    expect(joined).toEqual(['p1', 'p1'])
  })
})
