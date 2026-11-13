import { describe, expect, it } from 'vitest'
import { choosePlan, rankPlans, reach, scorePlacement } from './ai'
import { emptyJar, H, idx, makeCell, type Piece } from './grid'

const spawn = (a = 0, b = 0): Piece => ({ x: 3, y: 0, r: 0, a, b })

describe('computer', () => {
  it('reaches any open column and lands on the floor', () => {
    expect(reach(emptyJar(), spawn(), { x: 0, r: 1 })).toMatchObject({ x: 0, y: H - 1, r: 1 })
    expect(reach(emptyJar(), spawn(), { x: 6, r: 0 })).toMatchObject({ x: 6, y: H - 1 })
  })

  it('cannot pass a wall of blocks', () => {
    const jar = emptyJar()
    for (let y = 0; y < H; y++) jar[idx(2, y)] = makeCell(1, true)
    expect(reach(jar, spawn(), { x: 0, r: 1 })).toBeNull()
  })

  it('finishes a line of 3 gloops when it can', () => {
    const jar = emptyJar()
    for (let y = 13; y < H; y++) jar[idx(5, y)] = makeCell(2, true)
    const p = spawn(2, 1)
    const best = rankPlans(jar, p)[0].plan
    // Blue lands on top of the column: all 3 gloops pop.
    expect(scorePlacement(jar, reach(jar, p, best)!)).toBeGreaterThanOrEqual(3000)
  })

  it('does not leave holes under a capsule', () => {
    const jar = emptyJar()
    jar[idx(1, H - 2)] = makeCell(0, true)
    const flat: Piece = { x: 1, y: H - 3, r: 0, a: 0, b: 1 }
    const holey = scorePlacement(jar, flat)
    const snug = scorePlacement(jar, { x: 1, y: H - 3, r: 1, a: 0, b: 1 })
    expect(snug).toBeGreaterThan(holey)
  })

  it('never picks a spot that tops out when another exists', () => {
    const jar = emptyJar()
    for (let y = 2; y < H; y++) for (const x of [3, 4]) jar[idx(x, y)] = makeCell(y % 3, true)
    const plan = choosePlan(jar, spawn(0, 1), 'hard', { seed: 1 })
    expect(plan && [3, 4].includes(plan.x) && plan.r % 2 === 1).toBe(false)
  })
})
