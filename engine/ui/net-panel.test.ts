// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LOCAL_PROBE_URL } from '../net/local-access'
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
      LOCAL_PROBE_URL,
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
