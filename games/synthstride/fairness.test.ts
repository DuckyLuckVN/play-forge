// Fairness: a bot that sees a warning 200 ms after it appears and moves at
// most one tile per beat must never be hit. If it is, the spawner made an
// unavoidable pattern.
import { describe, expect, it } from 'vitest'
import {
  colOf,
  createState,
  neighbours,
  rowOf,
  step,
  TICK_RATE,
  type Strike,
  type StrideInput,
  type StrideState,
} from './sim'

const me = [{ id: 'p0', name: 'P0', slot: 0, ready: true, connected: true }]
const REACT = 12

/** First step of a path that survives every known strike (one tile per beat). */
function plan(s: StrideState, known: Strike[]): number {
  const pending = known.filter((k) => k.firedAt === undefined)
  if (!pending.length) return s.pos
  const last = Math.max(...pending.map((k) => k.beat))
  const danger = (b: number) => new Set(pending.filter((k) => k.beat === b).flatMap((k) => k.tiles))
  // BFS over (beat, tile), remembering the first step taken.
  let frontier = new Map<number, number>(neighbours(s.pos).map((t) => [t, t]))
  for (const t of danger(s.beat + 1)) frontier.delete(t)
  for (let b = s.beat + 2; b <= last && frontier.size; b++) {
    const next = new Map<number, number>()
    for (const [t, first] of frontier) for (const n of neighbours(t)) if (!next.has(n)) next.set(n, first)
    for (const t of danger(b)) next.delete(t)
    frontier = next
  }
  // Prefer staying put when that works.
  const firsts = [...frontier.values()]
  return firsts.includes(s.pos) ? s.pos : (firsts[0] ?? s.pos)
}

function towards(from: number, to: number): StrideInput | null {
  if (colOf(to) < colOf(from)) return 'left'
  if (colOf(to) > colOf(from)) return 'right'
  if (rowOf(to) < rowOf(from)) return 'up'
  if (rowOf(to) > rowOf(from)) return 'down'
  return null
}

function play(seed: number, seconds: number) {
  const s = createState(me, seed)
  const seenAt = new Map<number, number>()
  let hits = 0
  let movedBeat = -99
  for (let i = 0; i < seconds * TICK_RATE && !s.over; i++) {
    const known = s.strikes.filter((k) => s.tick - (seenAt.get(k.id) ?? s.tick) >= REACT)
    const goal = plan(s, known)
    // Never step into a tile that is exploding right now.
    const blasting = s.strikes.filter((k) => k.firedAt !== undefined).flatMap((k) => k.tiles)
    const input = movedBeat !== s.beat && !blasting.includes(goal) ? towards(s.pos, goal) : null
    if (input) movedBeat = s.beat
    step(s, input ? [{ player: 'p0', input }] : [])
    for (const k of s.strikes) if (!seenAt.has(k.id)) seenAt.set(k.id, s.tick)
    hits += s.events.filter((e) => e.type === 'hit').length
  }
  return { s, hits }
}

describe('Synthstride fairness', () => {
  it('a careful player can dodge every strike for 4 minutes', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { hits, s } = play(seed, 240)
      expect({ seed, hits }).toEqual({ seed, hits: 0 })
      expect(s.tier).toBe(9)
    }
  }, 30_000)

  it('keeps the board busy', () => {
    const s = createState(me, 5)
    let strikes = 0
    for (let i = 0; i < 120 * TICK_RATE; i++) {
      step(s, [])
      strikes += s.events.filter((e) => e.type === 'strike').length
      s.vitals.hearts = 3 // stand still, never die: just count
    }
    // ≈ 220 beats in 2 minutes: a strike on well over a third of them.
    expect(strikes).toBeGreaterThan(80)
  })
})
