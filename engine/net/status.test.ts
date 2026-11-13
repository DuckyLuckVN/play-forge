import { describe, expect, it } from 'vitest'
import { RELAY_URLS, roomConfig } from './net-config'
import {
  FAILURE_TTL_MS,
  FailureLog,
  JOIN_TIMEOUTS,
  joinFailed,
  joinStep,
  netPanelView,
  relayHost,
  startJoin,
  statusOf,
  stepJoin,
  type JoinTrack,
  type NetStatus,
  type PeerLink,
} from './status'
import { createOfflineTransport } from './transport'

const relays = (...states: ('connecting' | 'open' | 'closed')[]) =>
  states.map((state, i) => ({ url: `wss://r${i}.example`, state }))

const net = (over: Partial<NetStatus> = {}): NetStatus => ({
  kind: 'internet',
  relays: relays('open', 'open', 'connecting'),
  negotiating: 0,
  failures: 0,
  openFailures: 0,
  peers: [],
  ...over,
})

/** Feed statuses at the given times, returning the phase after each. */
function run(steps: [number, NetStatus][]): JoinTrack['phase'][] {
  let track = startJoin(0)
  return steps.map(([at, s]) => (track = stepJoin(track, s, at)).phase)
}

describe('relay config', () => {
  it('pins 6–8 distinct secure relays', () => {
    expect(RELAY_URLS.length).toBeGreaterThanOrEqual(6)
    expect(RELAY_URLS.length).toBeLessThanOrEqual(8)
    expect(new Set(RELAY_URLS).size).toBe(RELAY_URLS.length)
    for (const url of RELAY_URLS) expect(url).toMatch(/^wss:\/\/[a-z0-9.-]+(:\d+)?$/)
  })

  it('leaves out relays that failed the delivery probe', () => {
    const broken = [
      'nos.lol',
      'nostr.red5d.dev',
      'cdn.satellite.earth',
      'relay.kaleidoswap.com',
      'nostr.robosats.org',
    ]
    for (const host of broken) expect(RELAY_URLS.map(relayHost)).not.toContain(host)
  })

  it('gives every game the same pinned relays', () => {
    const a = roomConfig('play-forge/caro')
    const b = roomConfig('play-forge/snake')
    expect(a.appId).toBe('play-forge/caro')
    expect(a.relayConfig?.urls).toEqual(b.relayConfig?.urls)
    expect(a.relayConfig?.urls).toEqual([...RELAY_URLS])
  })
})

describe('statusOf', () => {
  it('reports transports without diagnostics as local, every peer connected', () => {
    const t = { ...createOfflineTransport(), peers: () => ['a', 'b'] }
    expect(statusOf(t)).toEqual({
      kind: 'local',
      relays: [],
      negotiating: 0,
      failures: 0,
      openFailures: 0,
      peers: [
        { id: 'a', state: 'connected' },
        { id: 'b', state: 'connected' },
      ],
    })
  })

  it('uses the transport diagnostics when present', () => {
    const s = net({ negotiating: 1 })
    const t = { ...createOfflineTransport(), diagnostics: { snapshot: () => s, measure: async () => {} } }
    expect(statusOf(t)).toBe(s)
  })
})

describe('joining state machine', () => {
  const noRelays = net({ relays: relays('connecting', 'closed') })

  it('waits for the matchmaking servers, then gives up after the timeout', () => {
    expect(
      run([
        [1000, noRelays],
        [JOIN_TIMEOUTS.servers - 1, noRelays],
        [JOIN_TIMEOUTS.servers, noRelays],
      ]),
    ).toEqual(['servers', 'servers', 'servers-failed'])
  })

  it('looks for the room once a server answers, timed from that moment', () => {
    const t1 = 3000
    expect(
      run([
        [0, noRelays],
        [t1, net()],
        [t1 + JOIN_TIMEOUTS.room - 1, net()],
        [t1 + JOIN_TIMEOUTS.room, net()],
      ]),
    ).toEqual(['servers', 'looking', 'looking', 'not-found'])
  })

  it('recovers from servers-failed when a server finally answers', () => {
    expect(
      run([
        [JOIN_TIMEOUTS.servers, noRelays],
        [JOIN_TIMEOUTS.servers + 1, net()],
      ]),
    ).toEqual(['servers-failed', 'looking'])
  })

  it('goes to connecting once the host answers, even after "not found"', () => {
    const late = JOIN_TIMEOUTS.room + 5000
    expect(
      run([
        [0, net()],
        [late, net()],
        [late + 1, net({ negotiating: 1 })],
      ]),
    ).toEqual(['looking', 'not-found', 'connecting'])
  })

  it('says the networks block a direct connection when it fails', () => {
    expect(
      run([
        [0, net()],
        [100, net({ negotiating: 1 })],
        [5000, net({ failures: 1 })],
      ]),
    ).toEqual(['looking', 'connecting', 'blocked'])
  })

  it('says blocked when connecting takes too long', () => {
    const seen = 2000
    expect(
      run([
        [seen, net({ negotiating: 1 })],
        [seen + JOIN_TIMEOUTS.connect - 1, net({ negotiating: 1 })],
        [seen + JOIN_TIMEOUTS.connect, net({ negotiating: 1 })],
      ]),
    ).toEqual(['connecting', 'connecting', 'blocked'])
  })

  it('says not found when connected to peers but no host ever sends the room', () => {
    const guest: PeerLink = { id: 'g', state: 'connected' }
    expect(
      run([
        [0, net({ peers: [guest] })],
        [JOIN_TIMEOUTS.connect, net({ peers: [guest] })],
      ]),
    ).toEqual(['connecting', 'not-found'])
  })

  it('treats a local transport as having servers', () => {
    const local = net({ kind: 'local', relays: [] })
    expect(
      run([
        [0, local],
        [JOIN_TIMEOUTS.room, local],
      ]),
    ).toEqual(['looking', 'not-found'])
  })

  it("doesn't say blocked while another link (the host's) is still connecting", () => {
    // A failed guest↔guest link while the host's connection is in progress.
    expect(
      run([
        [0, net({ negotiating: 1 })],
        [3000, net({ failures: 1, negotiating: 1 })],
        [5000, net({ failures: 1, negotiating: 0 })],
      ]),
    ).toEqual(['connecting', 'connecting', 'blocked'])
  })

  it('maps phases to steps and failures', () => {
    expect(
      ['servers', 'servers-failed', 'looking', 'not-found', 'connecting', 'blocked'].map((p) =>
        joinStep(p as never),
      ),
    ).toEqual([0, 0, 1, 1, 2, 2])
    expect(joinFailed('blocked')).toBe(true)
    expect(joinFailed('not-found')).toBe(true)
    expect(joinFailed('servers-failed')).toBe(true)
    expect(joinFailed('connecting')).toBe(false)
  })
})

describe('network panel view', () => {
  const host = { name: 'Ann', peer: 'p1', connected: true }

  it('is healthy with servers up and a quick link', () => {
    const v = netPanelView(net({ peers: [{ id: 'p1', state: 'connected', rttMs: 42 }] }), [host])
    expect(v.health).toBe('good')
    expect(v.hints).toEqual([])
    expect(v.relaysOk).toBe(2)
    expect(v.relays).toEqual([
      { host: 'r0.example', ok: true },
      { host: 'r1.example', ok: true },
      { host: 'r2.example', ok: false },
    ])
    expect(v.rows).toEqual([{ name: 'Ann', state: 'connected', rttMs: 42, route: null }])
    expect(v.gameRelay).toBeNull()
  })

  it('is healthy for a host alone in the room', () => {
    expect(netPanelView(net(), []).health).toBe('good')
  })

  it('warns on high ping and on a link still connecting', () => {
    expect(
      netPanelView(net({ peers: [{ id: 'p1', state: 'connected', rttMs: 350 }] }), [host]),
    ).toMatchObject({
      health: 'warn',
      hints: ['lag'],
    })
    expect(netPanelView(net(), [host])).toMatchObject({
      health: 'warn',
      hints: ['connecting'],
      rows: [{ name: 'Ann', state: 'connecting', rttMs: null, route: null }],
    })
  })

  it('shows a dropped player as connecting even if a stale link says connected', () => {
    const v = netPanelView(net({ peers: [{ id: 'p1', state: 'connected' }] }), [
      { ...host, connected: false },
    ])
    expect(v.rows[0].state).toBe('connecting')
  })

  it('warns when someone failed to connect, and is bad when a player link failed', () => {
    expect(netPanelView(net({ failures: 1, openFailures: 1 }), [])).toMatchObject({
      health: 'warn',
      hints: ['blocked'],
    })
    expect(netPanelView(net({ peers: [{ id: 'p1', state: 'failed' }] }), [host]).health).toBe('bad')
  })

  it('ignores past failures that are resolved', () => {
    const v = netPanelView(
      net({ failures: 3, openFailures: 0, peers: [{ id: 'p1', state: 'connected', rttMs: 20 }] }),
      [host],
    )
    expect(v).toMatchObject({ health: 'good', hints: [] })
  })

  it('is bad with no matchmaking server', () => {
    const v = netPanelView(net({ relays: relays('closed', 'connecting') }), [])
    expect(v).toMatchObject({ health: 'bad', hints: ['no-servers'], relaysOk: 0 })
  })

  it('gives the servers a moment after the room opens before calling it broken', () => {
    const down = net({ relays: relays('connecting', 'connecting') })
    expect(netPanelView(down, [], 0)).toMatchObject({ health: 'warn', hints: [] })
    expect(netPanelView(down, [], JOIN_TIMEOUTS.servers - 1).health).toBe('warn')
    expect(netPanelView(down, [], JOIN_TIMEOUTS.servers)).toMatchObject({
      health: 'bad',
      hints: ['no-servers'],
    })
  })

  it('labels the same-browser transport as local', () => {
    const v = netPanelView(net({ kind: 'local', relays: [], peers: [{ id: 'p1', state: 'connected' }] }), [
      host,
    ])
    expect(v).toMatchObject({ health: 'local', local: true, hints: ['local'], relays: [] })
    expect(v.rows[0]).toEqual({ name: 'Ann', state: 'connected', rttMs: null, route: null })
  })

  it('shortens relay urls', () => {
    expect(relayHost('wss://relay.example.com/')).toBe('relay.example.com')
    expect(relayHost('wss://host:8443')).toBe('host:8443')
  })
})

describe('failure log', () => {
  const none = () => false

  it('clears a peer once it connects', () => {
    const log = new FailureLog()
    log.add(0, 'g1')
    expect(log.open(10, none)).toEqual({ peers: ['g1'], count: 1 })
    log.resolve('g1')
    expect(log.open(20, none)).toEqual({ peers: [], count: 0 })
    expect(log.total).toBe(1)
  })

  it('clears a peer that is connected now, even without a resolve', () => {
    const log = new FailureLog()
    log.add(0, 'g1')
    expect(log.open(10, (id) => id === 'g1').count).toBe(0)
  })

  it('forgets failures after the TTL, with or without a peer id', () => {
    const log = new FailureLog()
    log.add(0, 'g1')
    log.add(5000)
    expect(log.open(FAILURE_TTL_MS - 1, none).count).toBe(2)
    expect(log.open(FAILURE_TTL_MS, none).count).toBe(1)
    expect(log.open(FAILURE_TTL_MS + 5000, none)).toEqual({ peers: [], count: 0 })
    expect(log.total).toBe(2)
  })

  it('keeps the host healthy once the guest that failed connects', () => {
    const log = new FailureLog()
    log.add(0, 'g1')
    log.resolve('g1')
    const open = log.open(1000, none)
    const status = net({
      failures: log.total,
      openFailures: open.count,
      peers: [{ id: 'g1', state: 'connected', rttMs: 30 }],
    })
    expect(netPanelView(status, [{ name: 'Bao', peer: 'g1', connected: true }])).toMatchObject({
      health: 'good',
      hints: [],
    })
  })
})

describe('with the game relay (backup server)', () => {
  const host = { name: 'Ann', peer: 'p1', connected: true }
  const relayUp = { state: 'open' as const, rttMs: 30 }

  it('counts the relay as a way to find the room when no matchmaking server answers', () => {
    const noNostr = { relays: relays('closed', 'closed') }
    expect(run([[1, net({ ...noNostr, gameRelay: relayUp })]])).toEqual(['looking'])
    expect(run([[JOIN_TIMEOUTS.servers, net({ ...noNostr, gameRelay: { state: 'closed' } })]])).toEqual([
      'servers-failed',
    ])
  })

  it("isn't blocked when the host is reached through the relay after a direct failure", () => {
    const relayed: PeerLink = { id: 'p1', state: 'connected', route: 'relay' }
    expect(run([[1, net({ failures: 1, peers: [relayed], gameRelay: relayUp })]])).toEqual(['connecting'])
  })

  it('shows the route per player and the backup server', () => {
    const v = netPanelView(
      net({ peers: [{ id: 'p1', state: 'connected', rttMs: 80, route: 'relay' }], gameRelay: relayUp }),
      [host],
    )
    expect(v.rows).toEqual([{ name: 'Ann', state: 'connected', rttMs: 80, route: 'relay' }])
    expect(v.gameRelay).toEqual({ ok: true, rttMs: 30 })
    expect(v).toMatchObject({ health: 'good', hints: ['relayed'] })
  })

  it('a slow relayed link warns without the "better connection" hint', () => {
    const v = netPanelView(
      net({ peers: [{ id: 'p1', state: 'connected', rttMs: 230, route: 'relay' }], gameRelay: relayUp }),
      [host],
    )
    expect(v).toMatchObject({ health: 'warn', hints: ['relayed'] })
  })

  it('a WebRTC link through TURN shows as TURN (with or without the relay transport)', () => {
    const viaTurn = (route?: 'direct' | 'relay') =>
      netPanelView(net({ peers: [{ id: 'p1', state: 'connected', rttMs: 90, turn: true, route }] }), [host])
        .rows[0].route
    expect(viaTurn('direct')).toBe('turn')
    expect(viaTurn()).toBe('turn')
    // Messages actually going over the WebSocket relay are still shown as that.
    expect(viaTurn('relay')).toBe('relay')
    const stillConnecting = netPanelView(net({ peers: [{ id: 'p1', state: 'connecting', turn: true }] }), [
      host,
    ])
    expect(stillConnecting.rows[0].route).toBeNull()
  })

  it('shows direct links without the relayed hint', () => {
    const v = netPanelView(
      net({ peers: [{ id: 'p1', state: 'connected', rttMs: 20, route: 'direct' }], gameRelay: relayUp }),
      [host],
    )
    expect(v.rows[0].route).toBe('direct')
    expect(v.hints).toEqual([])
  })

  it('has no route while still connecting', () => {
    const v = netPanelView(net({ peers: [{ id: 'p1', state: 'connecting', route: 'relay' }] }), [host])
    expect(v.rows[0].route).toBeNull()
  })

  it("isn't 'no servers' while the relay is up, and hides an unused relay", () => {
    const v = netPanelView(net({ relays: relays('closed'), gameRelay: relayUp }), [])
    expect(v.hints).not.toContain('no-servers')
    expect(v.health).toBe('good')
    expect(netPanelView(net({ gameRelay: { state: 'off' } }), []).gameRelay).toBeNull()
    expect(netPanelView(net({ gameRelay: { state: 'closed' } }), []).gameRelay).toEqual({
      ok: false,
      rttMs: null,
    })
  })
})
