import { describe, expect, it } from 'vitest'
import { CLOSE, RELAY_LIMITS, parseClientMessage, parseJoin } from '../../engine/net/relay-protocol.ts'
import { RelayHub, TokenBucket, type HubSocket, type Limits } from './hub.ts'

class FakeSocket implements HubSocket {
  sent: any[] = []
  closed: { code: number; reason: string } | null = null
  send(text: string) {
    this.sent.push(JSON.parse(text))
  }
  close(code: number, reason: string) {
    this.closed = { code, reason }
  }
  take() {
    return this.sent.splice(0)
  }
}

const join = (id: string, over: Partial<{ room: string; key: string }> = {}) => ({
  app: 'play-forge/snake',
  room: over.room ?? 'ABCDE',
  id,
  key: over.key ?? `key-of-${id}-0123456789`,
})

function setup(limits: Partial<Limits> = {}) {
  const hub = new RelayHub({ ...RELAY_LIMITS, ...limits })
  const connect = (
    id: string,
    opts: Partial<{ room: string; key: string; address: string; at: number }> = {},
  ) => {
    const socket = new FakeSocket()
    const conn = hub.open(socket, join(id, opts), opts.address ?? `addr-${id}`, opts.at ?? 0)
    return { socket, conn }
  }
  return { hub, connect }
}

const send = (ch: string, d: unknown, to?: string[]) => JSON.stringify({ t: 'send', ch, d, to })

describe('relay hub', () => {
  it('welcomes with the peers already there and announces joins and leaves', () => {
    const { connect } = setup()
    const a = connect('alice')
    expect(a.socket.take()).toEqual([{ t: 'hi', peers: [] }])
    const b = connect('bobby')
    expect(b.socket.take()).toEqual([{ t: 'hi', peers: ['alice'] }])
    expect(a.socket.take()).toEqual([{ t: 'join', id: 'bobby' }])
    b.conn!.closed(1)
    expect(a.socket.take()).toEqual([{ t: 'leave', id: 'bobby' }])
  })

  it('forwards to everyone else or to the listed peers, stamping the sender', () => {
    const { connect } = setup()
    const a = connect('alice')
    const b = connect('bobby')
    const c = connect('carol')
    for (const p of [a, b, c]) p.socket.take()
    a.conn!.message(send('st', { x: 1 }), 1)
    expect(b.socket.take()).toEqual([{ t: 'msg', from: 'alice', ch: 'st', d: { x: 1 } }])
    expect(c.socket.take()).toHaveLength(1)
    expect(a.socket.take()).toEqual([])
    a.conn!.message(send('in', 7, ['carol', 'alice', 'ghost']), 2)
    expect(b.socket.take()).toEqual([])
    expect(c.socket.take()).toEqual([{ t: 'msg', from: 'alice', ch: 'in', d: 7 }])
  })

  it("can't be spoofed: `from` in the frame is ignored", () => {
    const { connect } = setup()
    const a = connect('alice')
    const b = connect('bobby')
    a.socket.take()
    b.conn!.message(JSON.stringify({ t: 'send', ch: 'st', d: 1, from: 'alice' }), 1)
    expect(a.socket.take()[0].from).toBe('bobby')
  })

  it('keeps rooms apart', () => {
    const { connect } = setup()
    const a = connect('alice', { room: 'ROOM1' })
    const b = connect('bobby', { room: 'ROOM2' })
    expect(b.socket.take()).toEqual([{ t: 'hi', peers: [] }])
    a.conn!.message(send('st', 1), 1)
    expect(b.socket.take()).toEqual([])
  })

  it('answers pings', () => {
    const { connect } = setup()
    const a = connect('alice')
    a.socket.take()
    a.conn!.message(JSON.stringify({ t: 'ping', n: 12.5 }), 1)
    expect(a.socket.take()).toEqual([{ t: 'pong', n: 12.5 }])
  })

  it('refuses an id held by another key, during the connection and for a while after', () => {
    const { connect } = setup({ idHoldMs: 1000 })
    const a = connect('alice')
    const thief = connect('alice', { key: 'another-key-0123456789' })
    expect(thief.conn).toBeNull()
    expect(thief.socket.closed?.code).toBe(CLOSE.idTaken)
    a.conn!.closed(100)
    expect(connect('alice', { key: 'another-key-0123456789', at: 500 }).conn).toBeNull()
    expect(connect('alice', { key: 'another-key-0123456789', at: 1100 }).conn).not.toBeNull()
  })

  it('lets the same id and key reconnect, replacing a stale socket without a leave/join', () => {
    const { connect } = setup()
    const a = connect('alice')
    const b = connect('bobby')
    a.socket.take()
    const again = connect('bobby')
    expect(b.socket.closed?.code).toBe(CLOSE.idTaken)
    expect(again.socket.take()).toEqual([{ t: 'hi', peers: ['alice'] }])
    // The old socket's close arrives late: no leave for the new one.
    b.conn!.closed(5)
    expect(a.socket.take()).toEqual([])
    // Old connection can't send any more.
    b.conn!.message(send('st', 1), 6)
    expect(a.socket.take()).toEqual([])
    again.conn!.message(send('st', 2), 7)
    expect(a.socket.take()).toEqual([{ t: 'msg', from: 'bobby', ch: 'st', d: 2 }])
  })

  it('enforces room, server and per-address limits', () => {
    const { connect, hub } = setup({ maxPeersPerRoom: 2, maxSocketsPerAddress: 3, maxSockets: 4 })
    connect('alice')
    connect('bobby')
    expect(connect('carol').socket.closed).toEqual({ code: CLOSE.limit, reason: 'room full' })
    const shared = { address: 'same' }
    connect('dave1', { ...shared, room: 'R2' })
    connect('dave2', { ...shared, room: 'R2' })
    expect(connect('dave3', { ...shared, room: 'R3' }).socket.closed?.reason).toBe('server full')
    expect(hub.stats()).toMatchObject({ sockets: 4, rejected: { 'room full': 1, 'server full': 1 } })
    const { connect: c2 } = setup({ maxSocketsPerAddress: 1 })
    c2('x1234', { address: 'one' })
    expect(c2('y1234', { address: 'one', room: 'R9' }).socket.closed?.reason).toBe('too many sockets')
  })

  it('drops messages over the rate and closes a socket that keeps flooding', () => {
    const { connect, hub } = setup({ messagesPerSecond: 10, messageBurst: 2, maxDropped: 3 })
    const a = connect('alice')
    const b = connect('bobby')
    b.socket.take()
    for (let i = 0; i < 4; i++) a.conn!.message(send('st', i), 0)
    expect(b.socket.take().map((m) => m.d)).toEqual([0, 1])
    expect(hub.stats().dropped).toBe(2)
    // Refilled after 100 ms (10/s): one more goes through.
    a.conn!.message(send('st', 'late'), 100)
    expect(b.socket.take()).toHaveLength(1)
    for (let i = 0; i < 3; i++) a.conn!.message(send('st', i), 100)
    expect(a.socket.closed?.reason).toBe('flooding')
  })

  it('ignores malformed frames and oversized ones', () => {
    const { connect, hub } = setup({ maxMessageBytes: 64 })
    const a = connect('alice')
    const b = connect('bobby')
    b.socket.take()
    a.conn!.message('not json', 1)
    a.conn!.message(JSON.stringify({ t: 'send', ch: 'bad channel!', d: 1 }), 1)
    a.conn!.message(send('st', 'x'.repeat(100)), 1)
    expect(b.socket.take()).toEqual([])
    expect(hub.stats()).toMatchObject({ malformed: 2, dropped: 1 })
  })

  it('forgets empty rooms once their ids expire', () => {
    const { connect, hub } = setup({ idHoldMs: 1000 })
    const a = connect('alice')
    a.conn!.closed(0)
    hub.sweep(500)
    expect(hub.stats().rooms).toBe(1)
    hub.sweep(1000)
    expect(hub.stats()).toMatchObject({ rooms: 0, sockets: 0 })
  })
})

describe('token bucket', () => {
  it('allows a burst, then the sustained rate', () => {
    const b = new TokenBucket(2, 3, 0)
    expect([b.take(1, 0), b.take(1, 0), b.take(1, 0), b.take(1, 0)]).toEqual([true, true, true, false])
    expect(b.take(1, 500)).toBe(true)
    expect(b.take(1, 500)).toBe(false)
  })
})

describe('relay protocol', () => {
  it('validates the connect query', () => {
    const q = (o: Record<string, string>) => new URLSearchParams(o)
    const ok = { app: 'play-forge/snake', room: 'AB2CD', id: 'Ab3dEf9h0J', key: 'k'.repeat(24) }
    expect(parseJoin(q(ok))).toEqual(ok)
    expect(parseJoin(q({ ...ok, app: 'other/snake' }))).toBeNull()
    expect(parseJoin(q({ ...ok, room: 'a b' }))).toBeNull()
    expect(parseJoin(q({ ...ok, key: 'short' }))).toBeNull()
    expect(parseJoin(q({ ...ok, id: '' }))).toBeNull()
  })

  it('validates client frames', () => {
    expect(parseClientMessage(send('st', 1))).toEqual({ t: 'send', ch: 'st', d: 1 })
    expect(parseClientMessage(send('st', 1, ['peer1']))).toEqual({ t: 'send', ch: 'st', d: 1, to: ['peer1'] })
    expect(parseClientMessage(send('st', 1, ['bad id!']))).toBeNull()
    expect(parseClientMessage(JSON.stringify({ t: 'send', ch: 'st' }))).toBeNull()
    expect(parseClientMessage(JSON.stringify({ t: 'ping', n: 'x' }))).toBeNull()
    expect(parseClientMessage('[1]')).toBeNull()
  })
})
