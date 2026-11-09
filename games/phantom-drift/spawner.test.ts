import { describe, expect, it } from 'vitest'
import { blockedLanes, freeLanes, pickRow, placeHeart } from './spawner'

describe('pickRow', () => {
  it('always leaves a free lane, and wisps only sit in free lanes', () => {
    for (let seed = 0; seed < 300; seed++) {
      const rng = { seed }
      for (let tier = 0; tier <= 12; tier++) {
        for (const lanes of [3, 4, 5]) {
          const row = pickRow(rng, tier, lanes)
          const free = freeLanes(row, lanes)
          expect(free.length).toBeGreaterThan(0)
          for (const w of row.wisps) expect(free).toContain(w)
          for (const l of blockedLanes(row)) {
            expect(l).toBeGreaterThanOrEqual(0)
            expect(l).toBeLessThan(lanes)
          }
          if (row.drop) expect(row.drop).toBeLessThan(lanes)
        }
      }
    }
  })

  it('is deterministic per seed', () => {
    const a = { seed: 5 }
    const b = { seed: 5 }
    for (let i = 0; i < 50; i++) expect(pickRow(a, 6, 5)).toEqual(pickRow(b, 6, 5))
  })

  it('unlocks harder patterns with tiers', () => {
    const kinds = (tier: number) => {
      const rng = { seed: 1 }
      const seen = new Set<string>()
      for (let i = 0; i < 500; i++) seen.add(pickRow(rng, tier, 5).kind)
      return seen
    }
    expect([...kinds(0)].sort()).toEqual(['shard', 'wisps'])
    expect(kinds(9)).toEqual(new Set(['shard', 'wisps', 'pair', 'wall', 'drop', 'sweep']))
  })
})

describe('placeHeart', () => {
  it('only in a free lane, never on a wisp or an avoided lane, never on faller rows', () => {
    let placed = 0
    for (let seed = 0; seed < 300; seed++) {
      const rng = { seed }
      for (let tier = 0; tier <= 12; tier++) {
        for (const lanes of [3, 4, 5]) {
          const row = pickRow(rng, tier, lanes)
          const avoid = [seed % lanes]
          const lane = placeHeart(rng, row, lanes, avoid, 1)
          if (lane === undefined) continue
          placed++
          expect(row.heart).toBe(lane)
          expect(freeLanes(row, lanes)).toContain(lane)
          expect(avoid).not.toContain(lane)
          expect(row.wisps).not.toContain(lane)
          expect(row.drop).toBeUndefined()
        }
      }
    }
    expect(placed).toBeGreaterThan(1000)
  })

  it('respects the chance', () => {
    const rng = { seed: 9 }
    const row = () => ({ kind: 'wisps' as const, hazards: [], wisps: [] })
    expect(placeHeart(rng, row(), 5, [2], 0)).toBeUndefined()
    let n = 0
    for (let i = 0; i < 2000; i++) if (placeHeart(rng, row(), 5, [2], 0.1) !== undefined) n++
    expect(n).toBeGreaterThan(150)
    expect(n).toBeLessThan(250)
  })

  it('is deterministic per seed', () => {
    const a = { seed: 4 }
    const b = { seed: 4 }
    const row = () => ({ kind: 'wisps' as const, hazards: [], wisps: [] })
    for (let i = 0; i < 50; i++)
      expect(placeHeart(a, row(), 5, [0], 0.5)).toBe(placeHeart(b, row(), 5, [0], 0.5))
  })
})
