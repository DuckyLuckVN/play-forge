import { describe, expect, it } from 'vitest'
import { columnOrder, PATTERN_BLOCK, patternAt, patternLimit, type Pattern } from './patterns'
import { BALL_PICKUP_CHANCE, hpScale, spawnRow } from './rows'
import { empty } from './testing'

describe('row patterns', () => {
  it('starts with plain scattered rows', () => {
    for (let seed = 1; seed <= 50; seed++) {
      for (let turn = 1; turn <= 8; turn++) expect(patternAt(seed, turn)).toBe('scatter')
    }
  })

  it('mixes in shaped patterns later, held for a few turns each', () => {
    const seen = new Set<Pattern>()
    for (let turn = 9; turn <= 300; turn++) seen.add(patternAt(7, turn))
    expect(seen.size).toBeGreaterThanOrEqual(5)
    const block = Math.ceil(40 / PATTERN_BLOCK) * PATTERN_BLOCK
    for (let t = block; t < block + PATTERN_BLOCK; t++) expect(patternAt(7, t)).toBe(patternAt(7, block))
  })

  it('is the same for the same seed and turn', () => {
    expect(patternAt(3, 77)).toBe(patternAt(3, 77))
  })

  it('orders every column exactly once', () => {
    for (const p of ['scatter', 'pillars', 'stairs', 'vee', 'walls', 'core'] as Pattern[]) {
      for (const cols of [7, 10, 12]) {
        for (let turn = 1; turn <= 12; turn++) {
          const order = columnOrder(p, cols, turn, () => 0.5)
          expect(
            [...order].sort((a, b) => a - b),
            `${p} ${cols}`,
          ).toEqual([...Array(cols).keys()])
        }
      }
    }
  })

  it('draws a diagonal with stairs and lanes with pillars', () => {
    const first = (turn: number) => columnOrder('stairs', 7, turn, () => 0.5)[0]
    expect(Math.abs(first(11) - first(10)) % 6).toBe(1)
    const pillars = columnOrder('pillars', 7, 10, () => 0.5).slice(0, 4)
    expect(pillars.every((c) => c % 2 === pillars[0] % 2)).toBe(true)
  })

  it('opens the sides with core and the middle with walls', () => {
    expect(columnOrder('core', 7, 10, () => 0.5)[0]).toBe(3)
    expect([0, 6]).toContain(columnOrder('walls', 7, 10, () => 0.5)[0])
  })

  it('leaves real gaps so the shapes show', () => {
    expect(patternLimit('scatter', 7)).toBe(6)
    expect(patternLimit('pillars', 7)).toBe(4)
    expect(patternLimit('stairs', 7)).toBe(3)
    expect(patternLimit('vee', 7)).toBe(2)
    expect(patternLimit('walls', 7)).toBe(4)
    expect(patternLimit('core', 7)).toBe(3)
    expect(patternLimit('core', 12)).toBe(6)
  })

  it('makes trimmed rows tougher so the row is just as hard', () => {
    let trimmed = 0
    for (let seed = 1; seed <= 300; seed++) {
      const s = empty(seed)
      s.turn = 45
      s.ballCount = 999
      if (patternAt(seed, 45) !== 'vee') continue
      spawnRow(s)
      trimmed++
      expect(s.bricks.length).toBeLessThanOrEqual(2)
      for (const b of s.bricks) expect(b.hp).toBeGreaterThan(hpScale(45) * 1.2)
    }
    expect(trimmed).toBeGreaterThan(10)
  })

  it('keeps a free column in shaped rows, so an offered ball always fits', () => {
    let balls = 0
    for (let seed = 1; seed <= 200; seed++) {
      const s = empty(seed)
      s.turn = 41
      s.ballCount = 999
      spawnRow(s)
      expect(s.bricks.length).toBeLessThan(s.cols)
      if (s.pickups.some((p) => p.kind === 'ball')) balls++
    }
    expect(balls / 200).toBeGreaterThan(BALL_PICKUP_CHANCE - 0.1)
  })
})
