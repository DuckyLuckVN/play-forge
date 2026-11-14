// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LOCAL_PROBE_URL, requestLocalAccess, watchLocalAccess } from './local-access'

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
    const { statuses } = stubPermissions({ 'local-network-access': 'prompt' })
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
    stubPermissions({ 'local-network': 'denied' })
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
  it('makes a local-network request so the browser shows its prompt (no data needed back)', () => {
    const fetch = vi.fn(() => new Promise<Response>(() => {}))
    vi.stubGlobal('fetch', fetch)
    requestLocalAccess()
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0] as unknown as [
      string,
      RequestInit & { targetAddressSpace?: string },
    ]
    expect(url).toBe(LOCAL_PROBE_URL)
    expect(new URL(url).hostname).toMatch(/^(10|192\.168)\./)
    expect(init).toMatchObject({ mode: 'no-cors', targetAddressSpace: 'local' })
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
