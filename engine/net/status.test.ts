import { describe, expect, it } from 'vitest'
import { RELAY_URLS, roomConfig, TURN_SERVERS } from './net-config'
import {
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

  it('gives every game the same relays and no TURN until one is configured', () => {
    const a = roomConfig('play-forge/caro')
    const b = roomConfig('play-forge/snake')
    expect(a.appId).toBe('play-forge/caro')
    expect(a.relayConfig?.urls).toEqual(b.relayConfig?.urls)
    expect(a.relayConfig?.urls).toEqual([...RELAY_URLS])
    expect(TURN_SERVERS).toEqual([])
    expect(a).not.toHaveProperty('turnConfig')
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
      peers: [
        { id: 'a', state: 'connected', route: 'local' },
        { id: 'b', state: 'connected', route: 'local' },
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

  it('is healthy with servers up and a direct, quick link', () => {
    const v = netPanelView(net({ peers: [{ id: 'p1', state: 'connected', route: 'direct', rttMs: 42 }] }), [
      host,
    ])
    expect(v.health).toBe('good')
    expect(v.hints).toEqual([])
    expect(v.relaysOk).toBe(2)
    expect(v.relays).toEqual([
      { host: 'r0.example', ok: true },
      { host: 'r1.example', ok: true },
      { host: 'r2.example', ok: false },
    ])
    expect(v.rows).toEqual([{ name: 'Ann', state: 'connected', route: 'direct', rttMs: 42 }])
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
      rows: [{ name: 'Ann', state: 'connecting', route: null, rttMs: null }],
    })
  })

  it('shows a dropped player as connecting even if a stale link says connected', () => {
    const v = netPanelView(net({ peers: [{ id: 'p1', state: 'connected' }] }), [
      { ...host, connected: false },
    ])
    expect(v.rows[0].state).toBe('connecting')
  })

  it('warns when someone failed to connect, and is bad when a player link failed', () => {
    expect(netPanelView(net({ failures: 1 }), [])).toMatchObject({ health: 'warn', hints: ['blocked'] })
    expect(netPanelView(net({ peers: [{ id: 'p1', state: 'failed' }] }), [host]).health).toBe('bad')
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
    const v = netPanelView(
      net({ kind: 'local', relays: [], peers: [{ id: 'p1', state: 'connected', route: 'local' }] }),
      [host],
    )
    expect(v).toMatchObject({ health: 'local', local: true, hints: ['local'], relays: [] })
    expect(v.rows[0].route).toBe('local')
  })

  it('shortens relay urls', () => {
    expect(relayHost('wss://relay.example.com/')).toBe('relay.example.com')
    expect(relayHost('wss://host:8443')).toBe('host:8443')
  })
})
