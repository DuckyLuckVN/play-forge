import { describe, expect, it } from 'vitest'
import type { InputEvent, PlayerInfo } from '@forge/net/session'
import { setupBots, shuttlePopGame as game, toWorld, type SpInput, type SpState } from './sim'

const flip = (side: 0 | 1): 0 | 1 => (side === 0 ? 1 : 0)
const neg = (v: { x: number; z: number }) => {
  v.x = -v.x
  v.z = -v.z
}

/** The same match seen from the other end: world rotated 180°, seats swapped. */
function mirror(s: SpState): SpState {
  const m: SpState = structuredClone(s)
  m.players = [m.players[1], m.players[0]]
  for (const p of m.players) {
    p.side = flip(p.side)
    neg(p)
    const v = { x: p.vx, z: p.vz }
    neg(v)
    p.vx = v.x
    p.vz = v.z
    if (p.bot) neg(p.bot.target)
  }
  neg(m.shuttle.pos)
  neg(m.shuttle.vel)
  if (m.shuttle.lastHitter !== -1) m.shuttle.lastHitter = flip(m.shuttle.lastHitter)
  if (m.shuttle.pending) m.shuttle.pending.side = flip(m.shuttle.pending.side)
  m.score = [m.score[1], m.score[0]]
  m.stats.perfect = [m.stats.perfect[1], m.stats.perfect[0]]
  m.server = flip(m.server)
  if (m.winner !== -1) m.winner = flip(m.winner)
  for (const h of m.history) {
    neg(h.pos)
    neg(h.vel)
  }
  for (const e of m.events) {
    if ('side' in e) e.side = flip(e.side)
    if (e.k === 'land') neg(e)
  }
  return m
}

/** Same-tick events in a canonical order without ids (two whiffs on one tick are emitted side 0 first). */
function canon(s: SpState): SpState {
  const c = structuredClone(s)
  const key = (e: SpState['events'][number]) => `${e.tick}|${e.k}|${'side' in e ? e.side : ''}`
  c.events = c.events
    .map((e) => ({ ...e, id: 0 }))
    .sort((x, y) => (key(x) < key(y) ? -1 : key(x) > key(y) ? 1 : 0))
  return c
}

/** Deep equality with float tolerance (and +0 == −0). */
function close(a: unknown, b: unknown, path = '$'): string | null {
  if (typeof a === 'number' && typeof b === 'number')
    return Math.abs(a - b) <= 1e-9 ? null : `${path}: ${a} vs ${b}`
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null)
    return a === b ? null : `${path}: ${String(a)} vs ${String(b)}`
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) {
    const r = close((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`)
    if (r) return r
  }
  return null
}

const players = (n: number): PlayerInfo[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, slot: i, ready: true, connected: true }))

/** A side-agnostic scripted player: chase the shuttle, swing when it is close. */
function script(s: SpState): InputEvent<SpInput>[] {
  const out: InputEvent<SpInput>[] = []
  for (const p of s.players) {
    const v = toWorld(p.side, s.shuttle.pos.x - p.x, s.shuttle.pos.z - p.z)
    out.push({ player: p.id, input: { t: 'move', x: v.x, z: v.z } })
    const d = Math.hypot(s.shuttle.pos.x - p.x, s.shuttle.pos.z - p.z)
    const serving = s.phase === 'serve' && s.server === p.side && s.phaseT === 20
    if (serving || (s.phase === 'rally' && d < 0.9 && s.shuttle.pos.y < 2.5))
      out.push({ player: p.id, input: { t: 'swing', x: 0.4, z: s.tick % 3 === 0 ? -1 : 0, tick: s.tick } })
  }
  return out
}

/** Long sim runs; generous so a busy machine does not flake. */
const SLOW = 30_000

describe('mirror invariance', () => {
  it(
    'scripted players: the match from the other end is the exact mirror',
    () => {
      for (const seed of [1, 2, 3, 4]) {
        const a = game.setup(players(2), seed, {})
        const b = mirror(a)
        for (let i = 0; i < 3000 && a.phase !== 'over'; i++) {
          game.tick(a, script(a))
          game.tick(b, script(b))
          if (a.tick % 5 !== 0) continue
          const diff = close(canon(mirror(a)), canon(b))
          if (diff) throw new Error(`seed ${seed} tick ${a.tick}: ${diff}`)
        }
        expect(a.events.length + a.score[0] + a.score[1]).toBeGreaterThan(0)
      }
    },
    SLOW,
  )

  it(
    'bot vs bot: the match from the other end is the exact mirror (no seat-order coupling)',
    () => {
      for (const seed of [11, 12]) {
        const a = setupBots('hard', 'normal', seed)
        const b = mirror(a)
        while (a.phase !== 'over' && a.tick < 20000) {
          game.tick(a, [])
          game.tick(b, [])
          if (a.tick % 10 === 0 || game.isFinished(a)) {
            const diff = close(canon(mirror(a)), canon(b))
            if (diff) throw new Error(`seed ${seed} tick ${a.tick}: ${diff}`)
          }
        }
        expect(a.phase).toBe('over')
        expect(b.winner).toBe(flip(a.winner as 0 | 1))
      }
    },
    SLOW,
  )
})
