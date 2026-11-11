import { describe, expect, it } from 'vitest'
import type { InputEvent, PlayerInfo } from '@forge/net/session'
import { blastTarget, chooseDir } from './ai'
import { valueOf, type Dir } from './board'
import { boardOf, createState, step, type FuseInput } from './sim'

const players = (n: number): PlayerInfo[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, slot: i, ready: true, connected: true }))
const mv = (player: string, dir: Dir): InputEvent<FuseInput> => ({ player, input: { t: 'move', dir } })

/** Plays a whole solo game with the greedy bot; returns moves made and best tile. */
function playOut(seed: number, options: Record<string, string>) {
  const s = createState(players(1), seed, options)
  const b = boardOf(s, 'p0')!
  b.undos = 0
  for (let i = 0; i < 4000 && !s.over; i++) {
    const d = chooseDir(b.cells, s.size, { seed: seed * 31 + i })
    step(s, [d ? mv('p0', d) : { player: 'p0', input: { t: 'blast', cell: blastTarget(b.cells, s.size) } }])
  }
  return { moves: b.moves, best: valueOf(b.best) }
}

describe('balance', () => {
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
  const runs = (options: Record<string, string>) =>
    Array.from({ length: 8 }, (_, i) => playOut(i + 1, options))

  it('5×5 with rocks: a steady player gets big tiles, but the run does end', () => {
    const r = runs({})
    // Milestones keep coming (256+), the ramp ends things (well under 4000 moves).
    expect(median(r.map((x) => x.best))).toBeGreaterThanOrEqual(256)
    expect(median(r.map((x) => x.moves))).toBeGreaterThan(300)
    expect(median(r.map((x) => x.moves))).toBeLessThan(2000)
  })

  it('rocks make it harder; 4×4 is the hard mode', () => {
    const off = median(runs({ rocks: 'off' }).map((x) => x.moves))
    const on = median(runs({}).map((x) => x.moves))
    const small = median(runs({ size: '4' }).map((x) => x.moves))
    expect(on).toBeLessThan(off)
    expect(small).toBeLessThan(on)
  })
})
