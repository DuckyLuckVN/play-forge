// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LOCAL_PROBE_URLS } from '../net/local-access'
import type { NetStatus } from '../net/status'
import { netStatusButton, type NetPanelSource } from './net-panel'

const relayed: NetStatus = {
  kind: 'internet',
  relays: [{ url: 'wss://r0.example', state: 'open' }],
  negotiating: 0,
  failures: 0,
  openFailures: 0,
  peers: [{ id: 'p1', state: 'connected', rttMs: 230, route: 'relay' }],
  gameRelay: { state: 'open', rttMs: 110 },
}
const source: NetPanelSource = {
  room: 'ABCDE',
  isHost: true,
  status: () => relayed,
  measure: async () => {},
  linked: () => [{ name: 'Bao', peer: 'p1', connected: true }],
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

describe('Network panel: same-Wi-Fi local network access', () => {
  it('offers an Allow button that asks the browser, once a player is on the backup server', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      permissions: { query: async () => ({ state: 'prompt', onchange: null }) },
    })
    const fetch = vi.fn(() => new Promise<Response>(() => {}))
    vi.stubGlobal('fetch', fetch)
    let now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    const net = netStatusButton()
    document.body.append(net.root)
    net.attach(source)
    await new Promise((r) => setTimeout(r, 0)) // the permission query
    now = 10_000
    net.root.querySelector<HTMLButtonElement>('.pf-net-btn')!.click()
    const allow = net.root.querySelector<HTMLButtonElement>('.pf-net-allow')
    expect(allow).not.toBeNull()
    expect(net.root.querySelector('.pf-net-hint.allow-local')).not.toBeNull()
    allow!.click()
    expect(fetch).toHaveBeenCalledWith(
      LOCAL_PROBE_URLS[0],
      expect.objectContaining({ targetAddressSpace: 'local' }),
    )
    net.attach(null)
  })

  it('shows no Allow button where the browser has no such permission', async () => {
    vi.stubGlobal('navigator', { ...navigator, permissions: undefined })
    let now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    const net = netStatusButton()
    document.body.append(net.root)
    net.attach(source)
    await new Promise((r) => setTimeout(r, 0))
    now = 10_000
    net.root.querySelector<HTMLButtonElement>('.pf-net-btn')!.click()
    expect(net.root.querySelector('.pf-net-allow')).toBeNull()
    net.attach(null)
  })
})

describe('Network panel: a denied permission (Android Chrome starts there)', () => {
  it('a "How to allow" button shows the steps (Chrome never prompts for a denied permission)', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      permissions: { query: async () => ({ state: 'denied', onchange: null }) },
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    )
    let now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    const net = netStatusButton()
    document.body.append(net.root)
    net.attach(source)
    await new Promise((r) => setTimeout(r, 0))
    now = 10_000
    net.root.querySelector<HTMLButtonElement>('.pf-net-btn')!.click()
    expect(net.root.querySelector('.pf-net-steps')).toBeNull()
    net.root.querySelector<HTMLButtonElement>('.pf-net-allow')!.click()
    const steps = net.root.querySelectorAll('.pf-net-steps li')
    expect(steps.length).toBeGreaterThanOrEqual(3)
    net.attach(null)
  })

  it('still offers the Allow button, with where to change it', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      permissions: { query: async () => ({ state: 'denied', onchange: null }) },
    })
    const fetch = vi.fn(() => new Promise<Response>(() => {}))
    vi.stubGlobal('fetch', fetch)
    let now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    const net = netStatusButton()
    document.body.append(net.root)
    net.attach(source)
    await new Promise((r) => setTimeout(r, 0))
    now = 10_000
    net.root.querySelector<HTMLButtonElement>('.pf-net-btn')!.click()
    expect(net.root.querySelector('.pf-net-hint.local-denied')).not.toBeNull()
    net.root.querySelector<HTMLButtonElement>('.pf-net-allow')!.click()
    expect(fetch).toHaveBeenCalled()
    net.attach(null)
  })
})

describe('Network panel: after the player allows local network access', () => {
  it('retries the direct link at once (no reload), and says so', async () => {
    let status: { state: string; onchange: (() => void) | null } = { state: 'prompt', onchange: null }
    vi.stubGlobal('navigator', {
      ...navigator,
      permissions: { query: async () => status },
    })
    const retryDirect = vi.fn()
    const net = netStatusButton()
    document.body.append(net.root)
    net.attach({ ...source, retryDirect })
    await new Promise((r) => setTimeout(r, 0))
    expect(retryDirect).not.toHaveBeenCalled()
    status.state = 'granted'
    status.onchange?.()
    expect(retryDirect).toHaveBeenCalledTimes(1)
    // Already allowed when the room opens: nothing to retry.
    net.attach(null)
    status = { state: 'granted', onchange: null }
    const again = vi.fn()
    net.attach({ ...source, retryDirect: again })
    await new Promise((r) => setTimeout(r, 0))
    expect(again).not.toHaveBeenCalled()
    net.attach(null)
  })

  it("shows this device's local network setting, so each player can check it", async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      permissions: { query: async () => ({ state: 'granted', onchange: null }) },
    })
    const net = netStatusButton()
    document.body.append(net.root)
    net.attach(source)
    await new Promise((r) => setTimeout(r, 0))
    net.root.querySelector<HTMLButtonElement>('.pf-net-btn')!.click()
    expect(net.root.querySelector('.pf-net-lna')?.textContent).toContain('Allowed')
    net.attach(null)
  })
})

describe('Network panel: route names', () => {
  it('a player on the WebSocket relay shows "Via relay"', async () => {
    vi.stubGlobal('navigator', { ...navigator, permissions: undefined })
    const net = netStatusButton()
    document.body.append(net.root)
    net.attach(source)
    await new Promise((r) => setTimeout(r, 0))
    net.root.querySelector<HTMLButtonElement>('.pf-net-btn')!.click()
    expect(net.root.querySelector('.pf-net-state.relay')?.textContent).toBe('Via relay')
    net.attach(null)
  })
})

describe('Network panel layout', () => {
  const open = async (src: NetPanelSource = source) => {
    vi.stubGlobal('navigator', { ...navigator, permissions: undefined })
    const net = netStatusButton()
    document.body.append(net.root)
    net.attach(src)
    await new Promise((r) => setTimeout(r, 0))
    net.root.querySelector<HTMLButtonElement>('.pf-net-btn')!.click()
    return net
  }

  it('players come first, then their hints, then the connection details', async () => {
    const net = await open()
    const body = net.root.querySelector('.pf-net-body')!
    const order = [...body.children].map((el) => el.className.split(' ')[0])
    const at = (c: string) => order.indexOf(c)
    expect(at('pf-net-players')).toBeGreaterThanOrEqual(0)
    expect(at('pf-net-players')).toBeLessThan(at('pf-net-hint'))
    expect(at('pf-net-hint')).toBeLessThan(at('pf-net-details'))
    net.attach(null)
  })

  it('the backup server says "In use" while a player goes through it, "Available" otherwise', async () => {
    let net = await open()
    expect(net.root.querySelector('.pf-net-backup strong')?.textContent).toBe('In use · 110 ms')
    net.attach(null)
    document.body.replaceChildren()
    const direct: NetStatus = {
      ...relayed,
      peers: [{ id: 'p1', state: 'connected', rttMs: 9, route: 'direct' }],
    }
    net = await open({ ...source, status: () => direct })
    expect(net.root.querySelector('.pf-net-backup strong')?.textContent).toBe('Available · 110 ms')
    net.attach(null)
  })

  it('colours each ping by how it plays (good / ok / high)', async () => {
    const pings = (ms: number) => ({
      ...relayed,
      peers: [{ id: 'p1', state: 'connected' as const, rttMs: ms, route: 'direct' as const }],
    })
    for (const [ms, cls] of [
      [30, 'good'],
      [150, 'ok'],
      [320, 'bad'],
    ] as const) {
      const net = await open({ ...source, status: () => pings(ms) })
      expect(net.root.querySelector('.pf-net-ping')?.classList.contains(cls)).toBe(true)
      net.attach(null)
      document.body.replaceChildren()
    }
  })

  it('folds the matchmaking server list, and keeps it open across refreshes', async () => {
    const net = await open()
    const details = () => net.root.querySelector<HTMLDetailsElement>('details.pf-net-servers')!
    const first = details()
    expect(first.open).toBe(false)
    first.open = true
    first.dispatchEvent(new Event('toggle'))
    // The panel redraws every second: a new element, still open.
    await new Promise((r) => setTimeout(r, 1300))
    expect(details()).not.toBe(first)
    expect(details().open).toBe(true)
    net.attach(null)
  })
})

describe('Network panel: Retry', () => {
  const row = (attempt: 'trying' | 'idle', route: 'relay' | 'direct' = 'relay', turn = false): NetStatus => ({
    ...relayed,
    peers: [{ id: 'p1', state: 'connected', rttMs: 230, route, ...(turn ? { turn } : {}), attempt }],
  })
  const open = async (status: () => NetStatus, retryDirect = vi.fn()) => {
    vi.stubGlobal('navigator', { ...navigator, permissions: undefined })
    const net = netStatusButton()
    document.body.append(net.root)
    net.attach({ ...source, status, retryDirect })
    await new Promise((r) => setTimeout(r, 0))
    net.root.querySelector<HTMLButtonElement>('.pf-net-btn')!.click()
    return net
  }

  it('one Retry for a player on the relay or on TURN; "Connecting…" while trying', async () => {
    for (const status of [row('idle'), row('idle', 'direct', true)]) {
      const net = await open(() => status)
      expect(net.root.querySelector('.pf-net-retry')?.textContent).toBe('Retry')
      expect(net.root.querySelector('.pf-net-attempt')).toBeNull()
      net.attach(null)
      document.body.replaceChildren()
    }
    const net = await open(() => row('trying'))
    expect(net.root.querySelector('.pf-net-attempt')?.textContent).toBe('Connecting…')
    expect(net.root.querySelector<HTMLButtonElement>('.pf-net-retry')!.disabled).toBe(true)
    net.attach(null)
  })

  it('a click starts a fresh attempt and the row shows it at once', async () => {
    let trying = false
    const retryDirect = vi.fn(() => {
      trying = true
    })
    const net = await open(() => row(trying ? 'trying' : 'idle'), retryDirect)
    net.root.querySelector<HTMLButtonElement>('.pf-net-retry')!.click()
    expect(retryDirect).toHaveBeenCalledTimes(1)
    expect(net.root.querySelector('.pf-net-attempt')?.textContent).toBe('Connecting…')
    net.attach(null)
  })

  it('a player linked directly has no Retry', async () => {
    const direct: NetStatus = {
      ...relayed,
      peers: [{ id: 'p1', state: 'connected', rttMs: 9, route: 'direct' }],
    }
    const net = await open(() => direct)
    expect(net.root.querySelector('.pf-net-retry')).toBeNull()
    net.attach(null)
  })
})
