// Fairness and pacing checks. A careful bot that reacts 200 ms after a faller
// starts warning (rows are visible from far away) must never be hit: if it is,
// the spawner made an unfair pattern.
import { describe, expect, it } from 'vitest'
import { covers, createState, step, TICK_RATE, type DriftInput, type DriftState } from './sim'

const me = [{ id: 'p0', name: 'P0', slot: 0, ready: true, connected: true }]
const REACT = 12 // ticks

function blockedByRow(o: DriftState['objects'][number], lanes: number): number[] {
  if (o.kind === 'sweeper') {
    const lo = Math.min(o.from!, o.to!)
    return Array.from({ length: Math.abs(o.to! - o.from!) + 1 }, (_, i) => lo + i)
  }
  return covers(o, lanes)
}

function bot(s: DriftState): DriftInput | null {
  const p = s.player
  const all = Array.from({ length: s.lanes }, (_, l) => l)
  const falling = s.fallers.filter((f) => s.tick - (f.slamAt - f.tele) >= REACT).map((f) => f.lane)
  const ahead = s.objects.filter((o) => o.kind !== 'wisp' && !o.done && o.z > -5)
  const nextRow = ahead.length ? ahead.reduce((a, b) => (b.z < a.z ? b : a)).row : null
  const blocked = new Set(ahead.filter((o) => o.row === nextRow).flatMap((o) => blockedByRow(o, s.lanes)))
  const rowFree = all.filter((l) => !blocked.has(l))
  const near = (lanes: number[]) =>
    lanes.reduce((a, b) => {
      const d = Math.abs(b - p.target) - Math.abs(a - p.target)
      return d < 0 || (d === 0 && rowFree.includes(b) && !rowFree.includes(a)) ? b : a
    })
  // A faller is coming: step aside to the nearest lane (never across it), then carry on.
  const goal = falling.length ? near(all.filter((l) => !falling.includes(l))) : near(rowFree)
  return goal < p.target ? 'left' : goal > p.target ? 'right' : null
}

function play(seed: number, seconds: number) {
  const s = createState(me, seed)
  let hits = 0
  const wisps = new Set<number>()
  for (let i = 0; i < seconds * TICK_RATE && !s.over; i++) {
    const input = bot(s)
    step(s, input ? [{ player: 'p0', input }] : [])
    hits += s.events.filter((e) => e.type === 'hit').length
    if (s.tick <= 25 * TICK_RATE) for (const o of s.objects) if (o.kind === 'wisp') wisps.add(o.id)
  }
  return { s, hits, wispsBy25s: wisps.size }
}

describe('Phantom Drift fairness', () => {
  it('a careful player can always dodge everything for 5 minutes', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { hits, s } = play(seed, 300)
      expect({ seed, hits }).toEqual({ seed, hits: 0 })
      expect(s.lanes).toBe(5)
    }
  })

  it('offers enough wisps for a first Phantom around 25 s', () => {
    let total = 0
    for (let seed = 1; seed <= 40; seed++) total += play(seed, 26).wispsBy25s
    expect(total / 40).toBeGreaterThanOrEqual(16)
  })
})
