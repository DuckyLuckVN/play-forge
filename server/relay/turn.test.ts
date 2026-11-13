import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { DEFAULT_TURN_TTL, TURN_RATE, TurnLimiter, turnLogin, turnSettings } from './turn.ts'

const SECRET = 'x'.repeat(32)
const URLS = 'turn:turn.example.com:3478?transport=udp,turn:turn.example.com:3478?transport=tcp'

describe('turnSettings', () => {
  it('is off without a long enough secret or any url', () => {
    expect(turnSettings({})).toBeNull()
    expect(turnSettings({ TURN_SECRET: 'short', TURN_URLS: URLS })).toBeNull()
    expect(turnSettings({ TURN_SECRET: SECRET })).toBeNull()
  })

  it('keeps only well-formed turn urls and reads the ttl', () => {
    const s = turnSettings({
      TURN_SECRET: SECRET,
      TURN_URLS: `${URLS}, https://evil.example, turn:bad host`,
    })!
    expect(s.urls).toEqual(URLS.split(','))
    expect(s.ttl).toBe(DEFAULT_TURN_TTL)
    expect(turnSettings({ TURN_SECRET: SECRET, TURN_URLS: URLS, TURN_TTL_S: '600' })!.ttl).toBe(600)
    expect(turnSettings({ TURN_SECRET: SECRET, TURN_URLS: URLS, TURN_TTL_S: '5' })).toBeNull()
  })
})

describe('turnLogin', () => {
  it('signs "<expiry>:tag" with the secret, as coturn use-auth-secret expects', () => {
    const s = turnSettings({ TURN_SECRET: SECRET, TURN_URLS: URLS, TURN_TTL_S: '3600' })!
    const login = turnLogin(s, 1_000_000_000_000)
    expect(login.username).toBe(`${1_000_000_000 + 3600}:pf`)
    expect(login.credential).toBe(createHmac('sha1', SECRET).update(login.username).digest('base64'))
    expect(login.ttl).toBe(3600)
    expect(login.urls).toEqual(s.urls)
  })

  it('never contains the secret', () => {
    const s = turnSettings({ TURN_SECRET: SECRET, TURN_URLS: URLS })!
    expect(JSON.stringify(turnLogin(s, Date.now()))).not.toContain(SECRET)
  })
})

describe('TurnLimiter', () => {
  it('allows a burst per address, then one per refill period', () => {
    const l = new TurnLimiter()
    for (let i = 0; i < TURN_RATE.burst; i++) expect(l.allow('a', 0)).toBe(true)
    expect(l.allow('a', 0)).toBe(false)
    expect(l.allow('b', 0)).toBe(true)
    expect(l.allow('a', 1000 / TURN_RATE.perSecond)).toBe(true)
  })

  it('forgets idle addresses', () => {
    const l = new TurnLimiter()
    l.allow('a', 0)
    l.sweep(10 * 60 * 60 * 1000)
    // A fresh bucket: the full burst again.
    for (let i = 0; i < TURN_RATE.burst; i++) expect(l.allow('a', 10 * 60 * 60 * 1000)).toBe(true)
  })
})
