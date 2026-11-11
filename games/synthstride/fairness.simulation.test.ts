// Fairness: bots that see a warning 200 ms after it appears, move at most one
// tile per beat and never step into a tile that is exploding must never be
// hit: solo on every tempo, and several at once on a shared floor or on their
// own boards. If they are, the spawner made an unavoidable pattern.
import { describe, expect, it } from 'vitest'
import { neighbours, stepToward } from './grid'
import { dangerByBeat } from './patterns'
import {
  createState,
  openHoles,
  step,
  TICK_RATE,
  type Dancer,
  type Mode,
  type Strike,
  type StrideState,
  type Tempo,
} from './sim'

const REACT = 12
const players = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, slot: i, ready: true, connected: true }))

/**
 * First step of a path that survives every known strike (one tile per beat),
 * avoiding tiles that are exploding right now.
 */
function plan(s: StrideState, d: Dancer, known: Strike[]): number {
  const b = s.boards[d.board]
  const danger = dangerByBeat(known)
  const blasting = new Set(b.strikes.filter((k) => k.firedAt !== undefined).flatMap((k) => k.tiles))
  const last = Math.max(s.beat, ...danger.keys())
  if (last <= s.beat) return d.pos
  const holes = new Set(openHoles(s, b).flatMap((h) => h.tiles))
  let frontier = new Map<number, number>(
    neighbours(d.pos, b.n)
      .filter((t) => !holes.has(t))
      .map((t) => [t, t]),
  )
  for (const t of danger.get(s.beat + 1) ?? []) frontier.delete(t)
  for (let beat = s.beat + 2; beat <= last && frontier.size; beat++) {
    const next = new Map<number, number>()
    for (const [t, first] of frontier)
      for (const nb of neighbours(t, b.n)) if (!next.has(nb)) next.set(nb, first)
    for (const t of danger.get(beat) ?? []) next.delete(t)
    frontier = next
  }
  const firsts = [...new Set(frontier.values())]
  if (firsts.includes(d.pos)) return d.pos
  return firsts.find((t) => !blasting.has(t)) ?? firsts[0] ?? d.pos
}

function play(seed: number, seconds: number, tempo: Tempo, count = 1, mode: Mode = 'shared') {
  const s = createState(players(count), seed, { tempo, mode })
  const seenAt = new Map<string, number>()
  const movedBeat = new Map<string, number>()
  let hits = 0
  for (let i = 0; i < seconds * TICK_RATE && !s.over; i++) {
    const inputs = []
    for (const d of s.dancers) {
      if (d.diedAt !== null) continue
      const b = s.boards[d.board]
      const known = b.strikes.filter((k) => s.tick - (seenAt.get(`${b.id}:${k.id}`) ?? s.tick) >= REACT)
      const goal = plan(s, d, known)
      const blasting = b.strikes.filter((k) => k.firedAt !== undefined).flatMap((k) => k.tiles)
      const dir =
        movedBeat.get(d.id) !== s.beat && !blasting.includes(goal) ? stepToward(d.pos, goal, b.n) : null
      if (dir) {
        movedBeat.set(d.id, s.beat)
        inputs.push({ player: d.id, input: dir })
      }
    }
    step(s, inputs)
    for (const b of s.boards)
      for (const k of b.strikes) if (!seenAt.has(`${b.id}:${k.id}`)) seenAt.set(`${b.id}:${k.id}`, s.tick)
    hits += s.events.filter((e) => e.type === 'hit').length
  }
  return { s, hits }
}

describe('Synthstride fairness', () => {
  for (const tempo of ['chill', 'normal', 'hyper'] as const)
    it(`a careful player can dodge every strike for 4 minutes (${tempo})`, () => {
      for (let seed = 1; seed <= 20; seed++) {
        const { hits, s } = play(seed, 240, tempo)
        expect({ seed, hits }).toEqual({ seed, hits: 0 })
        expect(s.tier).toBe(9)
        expect(s.boards[0].n).toBe(5)
      }
    })

  for (const count of [2, 3, 4])
    it(`${count} careful players sharing a floor all survive 3 minutes`, () => {
      for (let seed = 1; seed <= 8; seed++) {
        const { hits } = play(seed, 180, 'normal', count, 'shared')
        expect({ count, seed, hits }).toEqual({ count, seed, hits: 0 })
      }
    })

  it('2 careful players on their own boards both survive 3 minutes', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const { hits } = play(seed, 180, 'hyper', 2, 'race')
      expect({ seed, hits }).toEqual({ seed, hits: 0 })
    }
  })

  it('keeps the board busy', () => {
    const s = createState(players(1), 5)
    let strikes = 0
    for (let i = 0; i < 120 * TICK_RATE; i++) {
      step(s, [])
      strikes += s.events.filter((e) => e.type === 'strike').length
      s.dancers[0].vitals.hearts = 3 // stand still, never die: just count
    }
    expect(strikes).toBeGreaterThan(80)
  })
})
