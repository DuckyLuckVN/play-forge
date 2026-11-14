import { describe, expect, it, vi } from 'vitest'
import { Emitter } from '../core/emitter'
import { WATCHDOG } from './direct-watchdog'
import { createHybridTransport, RELAY_GRACE_MS } from './hybrid'
import type { RelayTransport } from './relay'
import type { NetStatus } from './status'
import type { MediaChannel, Transport } from './transport'

/** A transport the test controls: peers come and go, sends are recorded. */
function fake(selfId = 'me') {
  const events = new Emitter<{ join: [string]; leave: [string] }>()
  const channels = new Emitter<Record<string, [unknown, string]>>()
  const peers = new Set<string>()
  const sent: [string, unknown, string | string[] | undefined][] = []
  return {
    selfId,
    sent,
    peers: () => [...peers],
    send: (ch: string, d: unknown, to?: string) => void sent.push([ch, d, to]),
    on: (ch: string, h: (d: any, from: string) => void) => channels.on(ch, h),
    onPeerJoin: (h: (id: string) => void) => events.on('join', h),
    onPeerLeave: (h: (id: string) => void) => events.on('leave', h),
    leave: vi.fn(),
    up(id: string) {
      peers.add(id)
      events.emit('join', id)
    },
    down(id: string) {
      peers.delete(id)
      events.emit('leave', id)
    },
    deliver: (ch: string, d: unknown, from: string) => channels.emit(ch, d, from),
  }
}

function fakeDirect() {
  const t = fake()
  const media = { addStream: vi.fn(), removeStream: vi.fn(), onPeerStream: vi.fn(() => () => {}) }
  const status: NetStatus = {
    kind: 'internet',
    relays: [],
    negotiating: 0,
    failures: 1,
    openFailures: 1,
    peers: [],
  }
  return Object.assign(t, {
    media: media as MediaChannel & typeof media,
    status,
    diagnostics: { snapshot: () => status, measure: vi.fn(async () => {}) },
  })
}

function fakeRelay() {
  const t = fake()
  return Object.assign(t, {
    state: () => 'open' as const,
    serverRttMs: () => 25,
    peerRttMs: (id: string) => (id === 'bob' ? 70 : undefined),
    sendTo: (ch: string, d: unknown, to: string[]) => void (to.length && t.sent.push([ch, d, to])),
    measure: vi.fn(async () => {}),
  })
}

function setup(opts = {}) {
  const direct = fakeDirect()
  const relay = fakeRelay()
  // These tests predate the relay grace: the relay counts at once unless a test says otherwise.
  const t = createHybridTransport(direct as unknown as Transport, relay as unknown as RelayTransport, {
    relayGraceMs: 0,
    ...opts,
  })
  const joins: string[] = []
  t.onPeerJoin((id) => joins.push(`+${id}`))
  t.onPeerLeave((id) => joins.push(`-${id}`))
  return { direct, relay, t, joins }
}

describe('hybrid transport', () => {
  it('needs the same peer id on both paths', () => {
    expect(() =>
      createHybridTransport(fake('a') as unknown as Transport, fake('b') as unknown as RelayTransport),
    ).toThrow()
  })

  it('joins once on the first path and leaves when the last one drops', () => {
    const { direct, relay, t, joins } = setup()
    relay.up('bob')
    direct.up('bob')
    expect(t.peers()).toEqual(['bob'])
    direct.down('bob')
    expect(joins).toEqual(['+bob'])
    relay.down('bob')
    expect(joins).toEqual(['+bob', '-bob'])
  })

  it('sends to a peer directly when that link is up, otherwise through the relay', () => {
    const { direct, relay, t } = setup()
    relay.up('bob')
    t.send('in', 1, 'bob')
    direct.up('bob')
    t.send('in', 2, 'bob')
    direct.down('bob')
    t.send('in', 3, 'bob')
    t.send('in', 4, 'nobody')
    expect(direct.sent).toEqual([['in', 2, 'bob']])
    expect(relay.sent).toEqual([
      ['in', 1, 'bob'],
      ['in', 3, 'bob'],
    ])
  })

  it('broadcasts once over WebRTC and once through the relay for peers without a direct link', () => {
    const { direct, relay, t } = setup()
    direct.up('ann')
    relay.up('ann')
    relay.up('bob')
    t.send('st', 9)
    expect(direct.sent).toEqual([['st', 9, undefined]])
    expect(relay.sent).toEqual([['st', 9, ['bob']]])
  })

  it('hears messages from both paths', () => {
    const { direct, relay, t } = setup()
    const got: unknown[] = []
    const off = t.on('st', (d, from) => got.push(`${from}:${d}`))
    direct.deliver('st', 1, 'ann')
    relay.deliver('st', 2, 'bob')
    off()
    relay.deliver('st', 3, 'bob')
    expect(got).toEqual(['ann:1', 'bob:2'])
  })

  it('relay-only mode (debug) ignores the direct link for game data', () => {
    const { direct, relay, t } = setup({ relayOnly: true })
    const got: unknown[] = []
    t.on('st', (d) => got.push(d))
    direct.up('bob')
    relay.up('bob')
    t.send('st', 1)
    t.send('in', 2, 'bob')
    direct.deliver('st', 'direct', 'bob')
    relay.deliver('st', 'relay', 'bob')
    expect(direct.sent).toEqual([])
    expect(relay.sent).toEqual([
      ['st', 1, ['bob']],
      ['in', 2, 'bob'],
    ])
    expect(got).toEqual(['relay'])
  })

  it('reports relayed peers as connected with the relay ping, and the backup server', () => {
    const { direct, relay, t } = setup()
    direct.status.peers = [
      { id: 'ann', state: 'connected', rttMs: 20 },
      { id: 'bob', state: 'failed' },
    ]
    direct.up('ann')
    relay.up('bob')
    const s = t.diagnostics!.snapshot()
    expect(s.peers).toEqual([
      { id: 'ann', state: 'connected', rttMs: 20, route: 'direct' },
      { id: 'bob', state: 'connected', rttMs: 70, route: 'relay' },
    ])
    // Bob's failed direct link no longer counts: everyone is reachable.
    expect(s.openFailures).toBe(0)
    expect(s.gameRelay).toEqual({ state: 'open', rttMs: 25 })
  })

  it('keeps open failures while someone is unreachable', () => {
    const { direct, t } = setup()
    direct.status.peers = [{ id: 'bob', state: 'failed' }]
    expect(t.diagnostics!.snapshot().openFailures).toBe(1)
  })

  it('measures both paths and leaves both', async () => {
    const { direct, relay, t } = setup()
    await t.diagnostics!.measure()
    expect(direct.diagnostics.measure).toHaveBeenCalled()
    expect(relay.measure).toHaveBeenCalled()
    t.leave()
    expect(direct.leave).toHaveBeenCalled()
    expect(relay.leave).toHaveBeenCalled()
  })

  describe('voice (direct only)', () => {
    const stream = { id: 'mic' } as unknown as MediaStream

    it("sends a stream meant for a relayed peer once its direct link opens, and doesn't double up", () => {
      const { direct, relay, t } = setup()
      relay.up('bob')
      t.media!.addStream(stream, 'bob')
      expect(direct.media.addStream).not.toHaveBeenCalled()
      direct.up('bob')
      expect(direct.media.addStream).toHaveBeenCalledTimes(1)
      expect(direct.media.addStream).toHaveBeenLastCalledWith(stream, 'bob')
    })

    it('sends streams for everyone to late direct links, also after a link drops and comes back', () => {
      const { direct, relay, t } = setup()
      direct.up('ann')
      t.media!.addStream(stream)
      expect(direct.media.addStream).toHaveBeenCalledWith(stream)
      direct.up('ann')
      // Ann had it already.
      expect(direct.media.addStream).toHaveBeenCalledTimes(1)
      relay.up('bob')
      direct.up('bob')
      expect(direct.media.addStream).toHaveBeenLastCalledWith(stream, 'bob')
      direct.down('bob')
      direct.up('bob')
      expect(direct.media.addStream).toHaveBeenCalledTimes(3)
    })

    it('voice adding its stream on join (direct first) is not repeated', () => {
      const { direct, t } = setup()
      t.media!.addStream(stream)
      t.onPeerJoin((id) => t.media!.addStream(stream, id))
      direct.up('ann')
      expect(direct.media.addStream.mock.calls).toEqual([[stream], [stream, 'ann']])
    })

    it('removing a stream stops it reaching late links', () => {
      const { direct, relay, t } = setup()
      t.media!.addStream(stream)
      t.media!.removeStream(stream)
      relay.up('bob')
      t.media!.removeStream(stream, 'bob')
      direct.up('bob')
      expect(direct.media.addStream).toHaveBeenCalledTimes(1)
      expect(direct.media.removeStream).toHaveBeenCalledTimes(1)
    })
  })
})

describe('hybrid transport: stuck direct links', () => {
  it('retries the direct links while a peer stays on the relay, and stops on leave', () => {
    vi.useFakeTimers()
    const direct = fakeDirect()
    const retryDirect = vi.fn(async () => {})
    const t = createHybridTransport(
      Object.assign(direct, { retryDirect }) as unknown as Transport,
      fakeRelay() as unknown as RelayTransport,
    )
    vi.advanceTimersByTime(60_000)
    expect(retryDirect).not.toHaveBeenCalled() // nobody here yet
    t.leave()
    vi.useRealTimers()
  })

  it('a peer reached only through the relay gets a fresh direct attempt after WATCHDOG.firstMs', () => {
    vi.useFakeTimers()
    const direct = fakeDirect()
    const relayT = fakeRelay()
    const retryDirect = vi.fn(async () => {})
    const t = createHybridTransport(
      Object.assign(direct, { retryDirect }) as unknown as Transport,
      relayT as unknown as RelayTransport,
    )
    relayT.up('bob')
    vi.advanceTimersByTime(WATCHDOG.firstMs + WATCHDOG.jitterMs + 1000)
    expect(retryDirect).toHaveBeenCalledTimes(1)
    direct.up('bob') // the fresh attempt linked
    vi.advanceTimersByTime(120_000)
    expect(retryDirect).toHaveBeenCalledTimes(1)
    t.leave()
    vi.advanceTimersByTime(120_000)
    expect(retryDirect).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('never retries in relay-only debug mode', () => {
    vi.useFakeTimers()
    const direct = fakeDirect()
    const relayT = fakeRelay()
    const retryDirect = vi.fn(async () => {})
    const t = createHybridTransport(
      Object.assign(direct, { retryDirect }) as unknown as Transport,
      relayT as unknown as RelayTransport,
      { relayOnly: true },
    )
    relayT.up('bob')
    vi.advanceTimersByTime(120_000)
    expect(retryDirect).not.toHaveBeenCalled()
    t.leave()
    vi.useRealTimers()
  })
})

describe('hybrid transport: direct first, then TURN, then the relay', () => {
  const make = () => {
    const direct = fakeDirect()
    const relay = fakeRelay()
    const t = createHybridTransport(direct as unknown as Transport, relay as unknown as RelayTransport)
    const events: string[] = []
    t.onPeerJoin((id) => events.push(`+${id}`))
    t.onPeerLeave((id) => events.push(`-${id}`))
    return { direct, relay, t, events }
  }

  it('a new peer reached only by the relay joins through it after RELAY_GRACE_MS, not before', () => {
    vi.useFakeTimers()
    const { relay, t, events } = make()
    relay.up('bob')
    vi.advanceTimersByTime(RELAY_GRACE_MS - 100)
    expect(events).toEqual([])
    t.send('state', 1, 'bob')
    expect(relay.sent).toEqual([]) // not through the relay yet
    vi.advanceTimersByTime(200)
    expect(events).toEqual(['+bob'])
    t.send('state', 2, 'bob')
    expect(relay.sent.at(-1)).toEqual(['state', 2, 'bob'])
    t.leave()
    vi.useRealTimers()
  })

  it('a direct link (or TURN) within the grace wins: the relay is never used', () => {
    vi.useFakeTimers()
    const { direct, relay, t, events } = make()
    relay.up('bob')
    vi.advanceTimersByTime(3000)
    direct.up('bob')
    vi.advanceTimersByTime(RELAY_GRACE_MS * 2)
    expect(events).toEqual(['+bob'])
    t.send('state', 1, 'bob')
    expect(direct.sent.at(-1)).toEqual(['state', 1, 'bob'])
    expect(relay.sent).toEqual([])
    t.leave()
    vi.useRealTimers()
  })

  it('the other side already on the relay (its grace ran out, an older page): follow it at once', () => {
    vi.useFakeTimers()
    const { relay, t, events } = make()
    const got: unknown[] = []
    t.on('lobby', (d) => got.push(d))
    relay.up('bob')
    relay.deliver('lobby', { hi: 1 }, 'bob')
    expect(events).toEqual(['+bob'])
    expect(got).toEqual([{ hi: 1 }])
    t.leave()
    vi.useRealTimers()
  })

  it('once linked, a direct link dropping falls back to the relay at once (no grace mid-game)', () => {
    vi.useFakeTimers()
    const { direct, relay, t, events } = make()
    relay.up('bob')
    direct.up('bob')
    direct.down('bob')
    expect(events).toEqual(['+bob'])
    t.send('state', 1, 'bob')
    expect(relay.sent.at(-1)).toEqual(['state', 1, 'bob'])
    t.leave()
    vi.useRealTimers()
  })

  it('while a relay fallback is pending, the status says so (the join screen waits, not "blocked")', () => {
    vi.useFakeTimers()
    const { relay, t } = make()
    relay.up('bob')
    expect(t.diagnostics!.snapshot().waiting).toBe(1)
    vi.advanceTimersByTime(RELAY_GRACE_MS + 100)
    expect(t.diagnostics!.snapshot().waiting).toBe(0)
    t.leave()
    vi.useRealTimers()
  })
})
