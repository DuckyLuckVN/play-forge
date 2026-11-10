import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRelayTransport } from './relay'
import { CLOSE } from './relay-protocol'

/** Minimal WebSocket stand-in: tests drive open/messages/close. */
class FakeWS {
  static all: FakeWS[] = []
  sent: any[] = []
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: ((e: { code: number }) => void) | null = null
  onerror: (() => void) | null = null
  closedWith: number | null = null
  constructor(public url: string) {
    FakeWS.all.push(this)
  }
  send(text: string) {
    this.sent.push(JSON.parse(text))
  }
  close(code = 1000) {
    this.closedWith = code
  }
  open() {
    this.onopen?.()
  }
  recv(msg: unknown) {
    this.onmessage?.({ data: JSON.stringify(msg) })
  }
  drop(code = 1006) {
    this.onclose?.({ code })
  }
}

const join = { app: 'play-forge/snake', room: 'ABCDE', id: 'self12345' }
const make = () =>
  createRelayTransport('wss://relay.example', join, {
    WebSocket: FakeWS as any,
    backoff: [100],
    measureTimeoutMs: 50,
  })

beforeEach(() => {
  FakeWS.all = []
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

describe('relay transport', () => {
  it('connects with the room, id and a random key', () => {
    const t = make()
    const url = new URL(FakeWS.all[0].url)
    expect(url.origin + url.pathname).toBe('wss://relay.example/v1')
    expect(url.searchParams.get('room')).toBe('ABCDE')
    expect(url.searchParams.get('id')).toBe('self12345')
    expect(url.searchParams.get('key')).toMatch(/^[a-z0-9]{24}$/)
    expect(t.state()).toBe('connecting')
  })

  it('tracks peers and delivers their messages; sends to one, several or all', () => {
    const t = make()
    const ws = FakeWS.all[0]
    const joins: string[] = []
    const got: [unknown, string][] = []
    t.onPeerJoin((id) => joins.push(id))
    t.on('st', (d, from) => got.push([d, from]))
    ws.open()
    ws.recv({ t: 'hi', peers: ['hostpeer1'] })
    ws.recv({ t: 'join', id: 'guestpeer' })
    expect(joins).toEqual(['hostpeer1', 'guestpeer'])
    expect(t.peers()).toEqual(['hostpeer1', 'guestpeer'])
    ws.recv({ t: 'msg', from: 'hostpeer1', ch: 'st', d: 5 })
    ws.recv({ t: 'msg', from: 'stranger1', ch: 'st', d: 6 })
    expect(got).toEqual([[5, 'hostpeer1']])
    t.send('in', 1, 'hostpeer1')
    t.send('in', 2)
    t.sendTo('in', 3, ['hostpeer1', 'guestpeer'])
    t.sendTo('in', 4, [])
    expect(ws.sent).toEqual([
      { t: 'send', ch: 'in', d: 1, to: ['hostpeer1'] },
      { t: 'send', ch: 'in', d: 2 },
      { t: 'send', ch: 'in', d: 3, to: ['hostpeer1', 'guestpeer'] },
    ])
  })

  it('drops sends while not connected', () => {
    const t = make()
    t.send('in', 1)
    expect(FakeWS.all[0].sent).toEqual([])
  })

  it('reconnects after a drop: peers leave, then the welcome brings back who is still there', () => {
    const t = make()
    const events: string[] = []
    t.onPeerJoin((id) => events.push(`+${id}`))
    t.onPeerLeave((id) => events.push(`-${id}`))
    FakeWS.all[0].open()
    FakeWS.all[0].recv({ t: 'hi', peers: ['peeraaaa', 'peerbbbb'] })
    FakeWS.all[0].drop()
    expect(t.state()).toBe('closed')
    expect(t.peers()).toEqual([])
    vi.advanceTimersByTime(200)
    expect(FakeWS.all).toHaveLength(2)
    FakeWS.all[1].open()
    FakeWS.all[1].recv({ t: 'hi', peers: ['peeraaaa'] })
    expect(t.state()).toBe('open')
    expect(events).toEqual(['+peeraaaa', '+peerbbbb', '-peeraaaa', '-peerbbbb', '+peeraaaa'])
  })

  it("doesn't retry after a refusal (bad request, forbidden, id taken) or after leave", () => {
    const t = make()
    FakeWS.all[0].drop(CLOSE.forbidden)
    vi.advanceTimersByTime(10_000)
    expect(FakeWS.all).toHaveLength(1)
    expect(t.state()).toBe('closed')
    const u = make()
    u.leave()
    expect(FakeWS.all[1].closedWith).toBe(1000)
    FakeWS.all[1].drop(1000)
    vi.advanceTimersByTime(10_000)
    expect(FakeWS.all).toHaveLength(2)
    expect(u.state()).toBe('off')
  })

  it('measures the server and peer round trips, and answers peer pings itself', async () => {
    const t = make()
    const ws = FakeWS.all[0]
    ws.open()
    ws.recv({ t: 'hi', peers: ['peeraaaa'] })
    const handler = vi.fn()
    t.on('~po', handler)
    const done = t.measure()
    const [ping, peerPing] = ws.sent.splice(0)
    expect(ping.t).toBe('ping')
    expect(peerPing).toMatchObject({ t: 'send', ch: '~pi', to: ['peeraaaa'] })
    vi.advanceTimersByTime(30)
    ws.recv({ t: 'pong', n: ping.n })
    ws.recv({ t: 'msg', from: 'peeraaaa', ch: '~po', d: peerPing.d })
    await done
    expect(t.serverRttMs()).toBeGreaterThanOrEqual(0)
    expect(t.peerRttMs('peeraaaa')).toBeGreaterThanOrEqual(0)
    expect(handler).not.toHaveBeenCalled()
    // Someone pings us: echo back to them only.
    ws.recv({ t: 'msg', from: 'peeraaaa', ch: '~pi', d: 42 })
    expect(ws.sent).toEqual([{ t: 'send', ch: '~po', d: 42, to: ['peeraaaa'] }])
  })

  it("measure gives up after a timeout when someone doesn't answer", async () => {
    const t = make()
    FakeWS.all[0].open()
    const done = t.measure()
    vi.advanceTimersByTime(60)
    await expect(done).resolves.toBeUndefined()
  })
})
