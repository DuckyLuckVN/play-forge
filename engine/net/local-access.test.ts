// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LOCAL_PROBE_URLS, requestLocalAccess, watchLocalAccess } from './local-access'

type Listener = () => void
function stubPermissions(states: Record<string, PermissionState | Error>) {
  const statuses: { state: PermissionState; onchange: Listener | null }[] = []
  const query = vi.fn(async ({ name }: { name: string }) => {
    const s = states[name]
    if (!s || s instanceof Error) throw s ?? new TypeError(`${name} is not a valid permission name`)
    const status = { state: s, onchange: null as Listener | null }
    statuses.push(status)
    return status
  })
  vi.stubGlobal('navigator', { ...navigator, permissions: { query } })
  return { query, statuses }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('watchLocalAccess', () => {
  it('reports the Local Network Access permission and its changes', async () => {
    const { statuses } = stubPermissions({ 'local-network': 'prompt' })
    const seen: string[] = []
    const stop = await watchLocalAccess((s) => seen.push(s))
    expect(seen).toEqual(['prompt'])
    statuses[0].state = 'granted'
    statuses[0].onchange?.()
    expect(seen).toEqual(['prompt', 'granted'])
    stop()
    statuses[0].state = 'denied'
    statuses[0].onchange?.()
    expect(seen).toEqual(['prompt', 'granted'])
  })

  it('falls back to the older permission name', async () => {
    stubPermissions({ 'local-network-access': 'denied' })
    const seen: string[] = []
    await watchLocalAccess((s) => seen.push(s))
    expect(seen).toEqual(['denied'])
  })

  it('is "unsupported" where the browser has no such permission (it does not block)', async () => {
    stubPermissions({})
    const seen: string[] = []
    await watchLocalAccess((s) => seen.push(s))
    expect(seen).toEqual(['unsupported'])
    vi.stubGlobal('navigator', { ...navigator, permissions: undefined })
    await watchLocalAccess((s) => seen.push(s))
    expect(seen).toEqual(['unsupported', 'unsupported'])
  })
})

describe('requestLocalAccess', () => {
  it('asks the usual router addresses on their web port (Chrome prompts only once one connects)', () => {
    const fetch = vi.fn(() => new Promise<Response>(() => {}))
    vi.stubGlobal('fetch', fetch)
    requestLocalAccess()
    expect(fetch).toHaveBeenCalledTimes(LOCAL_PROBE_URLS.length)
    const calls = fetch.mock.calls as unknown as [string, RequestInit & { targetAddressSpace?: string }][]
    for (const [url, init] of calls) {
      const u = new URL(url)
      expect(u.hostname).toMatch(/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/)
      // Port 80: a closed port (e.g. 9) fails at once and Chrome never prompts.
      expect(u.port).toBe('')
      expect(init).toMatchObject({ mode: 'no-cors', targetAddressSpace: 'local' })
    }
    expect(LOCAL_PROBE_URLS).toContain('http://192.168.1.1/')
  })

  it('never throws (a refused or failed request is fine)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    )
    expect(() => requestLocalAccess()).not.toThrow()
    vi.stubGlobal('fetch', () => {
      throw new TypeError('no fetch')
    })
    expect(() => requestLocalAccess()).not.toThrow()
    await Promise.resolve()
  })
})
