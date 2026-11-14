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
