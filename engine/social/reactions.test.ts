import { afterEach, describe, expect, it } from 'vitest'
import { createBroadcastTransport } from '../net/broadcast'
import type { Transport } from '../net/transport'
import { VI } from './i18n'
import { reactionSvg } from './reaction-art'
import {
  RateLimiter,
  REACTIONS,
  REACTION_IDS,
  ReactionHub,
  RECEIVE_LIMIT,
  SEND_LIMIT,
  TRAY_REACTIONS,
  WHEEL_REACTIONS,
  reactionDef,
} from './reactions'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('RateLimiter', () => {
  it('allows a burst, then blocks until the window slides', () => {
    let t = 0
    const limit = new RateLimiter(3, 1000, () => t)
    expect([limit.take(), limit.take(), limit.take(), limit.take()]).toEqual([true, true, true, false])
    t = 999
    expect(limit.take()).toBe(false)
    t = 1000
    expect(limit.take()).toBe(true)
  })
})

describe('reactions', () => {
  it('has at least 9 distinct reactions, each drawn and translated', () => {
    expect(REACTIONS.length).toBeGreaterThanOrEqual(9)
    expect(new Set(REACTION_IDS).size).toBe(REACTIONS.length)
    const drawings = REACTION_IDS.map(reactionSvg)
    for (const svg of drawings) expect(svg).toMatch(/^<svg viewBox="0 0 64 64".*<\/svg>$/s)
    expect(new Set(drawings).size).toBe(drawings.length)
    for (const r of REACTIONS) expect(VI[r.name], r.name).toBeTruthy()
  })
})

describe('ReactionHub', () => {
  const hubs: ReactionHub[] = []
  const transports: Transport[] = []
  afterEach(() => {
    hubs.splice(0).forEach((h) => h.dispose())
    transports.splice(0).forEach((t) => t.leave())
  })

  const pair = async (opts: { now?: () => number; known?: string[] } = {}) => {
    const room = Math.random().toString(36).slice(2)
    const ta = createBroadcastTransport('rx-test', room)
    const tb = createBroadcastTransport('rx-test', room)
    transports.push(ta, tb)
    const known = opts.known ?? ['alice', 'bob']
    const make = (t: Transport, id: string) => {
      const hub = new ReactionHub(t, id, { isKnown: (p) => known.includes(p), now: opts.now })
      hubs.push(hub)
      return hub
    }
    const a = make(ta, 'alice')
    const b = make(tb, 'bob')
    const start = Date.now()
    while (ta.peers().length === 0 || tb.peers().length === 0) {
      if (Date.now() - start > 2000) throw new Error('peers never met')
      await wait(5)
    }
    return { a, b, ta }
  }

  it('shows a reaction locally and on the other peer', async () => {
    const { a, b } = await pair()
    const seenA: string[] = []
    const seenB: string[] = []
    a.on((p, r) => seenA.push(`${p}:${r}`))
    b.on((p, r) => seenB.push(`${p}:${r}`))
    expect(a.send('fire')).toBe(true)
    await wait(30)
    expect(seenA).toEqual(['alice:fire'])
    expect(seenB).toEqual(['alice:fire'])
  })

  it('limits how fast you can send', async () => {
    const t = 0
    const { a } = await pair({ now: () => t })
    const sent = Array.from({ length: SEND_LIMIT.max + 2 }, () => a.send('heart'))
    expect(sent.filter(Boolean).length).toBe(SEND_LIMIT.max)
    expect(a.send('not-a-reaction')).toBe(false)
  })

  it('drops floods, unknown senders, spoofed self and junk', async () => {
    const t = 0
    const { b, ta } = await pair({ now: () => t })
    const seen: string[] = []
    b.on((p, r) => seen.push(`${p}:${r}`))
    // A modified client ignoring its own send limit.
    for (let i = 0; i < RECEIVE_LIMIT.max + 5; i++) ta.send('rx', { p: 'alice', r: 'boom' })
    ta.send('rx', { p: 'mallory', r: 'boom' })
    ta.send('rx', { p: 'bob', r: 'boom' })
    ta.send('rx', { p: 'alice', r: '<script>' })
    ta.send('rx', null)
    await wait(30)
    expect(seen).toEqual(Array(RECEIVE_LIMIT.max).fill('alice:boom'))
  })
})

describe('WHEEL_REACTIONS', () => {
  it('wheel set: 8 known, distinct reactions, no mic helpers', () => {
    expect(WHEEL_REACTIONS).toHaveLength(8)
    expect(new Set(WHEEL_REACTIONS).size).toBe(8)
    for (const id of WHEEL_REACTIONS) expect(REACTION_IDS).toContain(id)
    expect(
      WHEEL_REACTIONS.some((id) => id.startsWith('mic') || id.includes('hear-') || id.includes('-hear')),
    ).toBe(false)
  })
})

describe('TRAY_REACTIONS', () => {
  it('lists the visible reactions: thumbs and love first, faces next, voice helpers last', () => {
    expect(TRAY_REACTIONS).toEqual([
      'like',
      'dislike',
      'heart',
      'fire',
      'laugh',
      'haha',
      'thinking',
      'gg',
      'rage',
      'cry',
      'skull',
      'eyes',
      'sweat',
      'mic-on',
      'hear-me',
      'cant-hear',
    ])
  })

  it('hides retired reactions from the tray but still accepts them from older clients', () => {
    for (const id of ['boom', 'crown', 'clap', 'mic-off']) {
      expect(REACTION_IDS).toContain(id)
      expect(reactionDef(id)?.hidden, id).toBe(true)
      expect(TRAY_REACTIONS).not.toContain(id)
    }
    for (const id of TRAY_REACTIONS) expect(reactionDef(id)?.hidden, id).toBeFalsy()
  })

  it('wheel = the first 8 tray reactions', () => {
    expect(WHEEL_REACTIONS).toEqual(['like', 'dislike', 'heart', 'fire', 'laugh', 'haha', 'thinking', 'gg'])
  })
})
