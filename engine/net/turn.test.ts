import { afterEach, describe, expect, it, vi } from 'vitest'
import { roomConfig } from './net-config'
import { parseTurnLogin, prefetchTurn, resetTurnCache, turnEndpoint, turnMode, turnServers } from './turn'

const LOGIN = {
  urls: ['turn:turn.example.com:3478?transport=udp', 'https://not-turn.example', 7],
  username: '1700000000:pf',
  credential: 'abc=',
  ttl: 3600,
}

afterEach(() => resetTurnCache())

describe('turn', () => {
  it('finds /turn next to the relay', () => {
    expect(turnEndpoint('wss://relay.example.com')).toBe('https://relay.example.com/turn')
    expect(turnEndpoint('ws://localhost:8080/v1?x=1')).toBe('http://localhost:8080/turn')
    expect(turnEndpoint('')).toBeNull()
    expect(turnEndpoint('https://relay.example.com')).toBeNull()
  })

  it('reads ?turn=', () => {
    expect(turnMode('?turn=only')).toBe('only')
    expect(turnMode('?turn=off')).toBe('off')
    expect(turnMode('?turn=x')).toBe('auto')
  })

  it('keeps only turn: urls and refuses malformed logins', () => {
    expect(parseTurnLogin(LOGIN, 0)!.servers[0].urls).toEqual(['turn:turn.example.com:3478?transport=udp'])
    expect(parseTurnLogin({ ...LOGIN, urls: ['https://x'] }, 0)).toBeNull()
    expect(parseTurnLogin({ ...LOGIN, credential: 1 }, 0)).toBeNull()
    expect(parseTurnLogin('nope', 0)).toBeNull()
  })

  it('fetches once in the background, then hands the servers to new rooms until half its life is gone', async () => {
    vi.useFakeTimers({ now: 1_000_000 })
    const fetcher = vi.fn(async () => new Response(JSON.stringify(LOGIN)))
    expect(turnServers()).toEqual([])
    await Promise.all([
      prefetchTurn('wss://relay.example.com', fetcher),
      prefetchTurn('wss://relay.example.com', fetcher),
    ])
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(turnServers()).toHaveLength(1)
    vi.setSystemTime(1_000_000 + 1800 * 1000 + 1)
    expect(turnServers()).toEqual([])
    vi.useRealTimers()
  })

  it('a failed or refused fetch just means no TURN', async () => {
    await prefetchTurn(
      'wss://relay.example.com',
      vi.fn(async () => new Response('', { status: 404 })),
    )
    expect(turnServers()).toEqual([])
    await prefetchTurn(
      'wss://relay.example.com',
      vi.fn(async () => Promise.reject(new Error('offline'))),
    )
    expect(turnServers()).toEqual([])
  })

  it('room config carries TURN, and forces it only on request', () => {
    const turn = [{ urls: 'turn:t.example:3478', username: 'u', credential: 'c' }]
    expect(roomConfig('a').turnConfig).toBeUndefined()
    expect(roomConfig('a', turn).turnConfig).toEqual(turn)
    expect(roomConfig('a', turn).rtcConfig).toBeUndefined()
    expect(roomConfig('a', turn, true).rtcConfig).toEqual({ iceTransportPolicy: 'relay' })
    expect(roomConfig('a', [], true).rtcConfig).toBeUndefined()
  })
})
