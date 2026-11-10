import { describe, expect, it } from 'vitest'
import { courtDims } from './courtsize'
import {
  COVER,
  courtFor,
  flipServe,
  mateOf,
  modeOf,
  seatOf,
  serverOf,
  sideName,
  teamName,
  takerOf,
  coverSpot,
} from './doubles'
import { COURT } from './physics'

const P = (id: string, side: 0 | 1, slot: 0 | 1, x = 0, z = 0) => ({ id, side, slot, x, z })

describe('modes and seats', () => {
  it('modeOf falls back to 1v1', () => {
    expect(modeOf('2v2')).toBe('2v2')
    expect(modeOf('x')).toBe('1v1')
    expect(modeOf(undefined)).toBe('1v1')
  })
  it('seatOf alternates teams', () => {
    expect([0, 1, 2, 3].map(seatOf)).toEqual([
      { side: 0, slot: 0 },
      { side: 1, slot: 0 },
      { side: 0, slot: 1 },
      { side: 1, slot: 1 },
    ])
  })
})

describe('courtFor', () => {
  it('1v1 is the singles court', () => {
    expect(courtFor('1v1', 'large')).toEqual(courtDims('large'))
  })
  it('2v2 is wider, size multiplies on top', () => {
    expect(courtFor('2v2', 'normal').halfWidth).toBe(3.05)
    const xl = courtFor('2v2', 'xl')
    expect(xl.halfWidth).toBeCloseTo(3.965)
    expect(xl.halfLen).toBe(courtDims('xl').halfLen)
    expect(xl.netH).toBe(COURT.netH)
  })
})

describe('serve rotation', () => {
  const ps = [P('a0', 0, 0), P('b0', 1, 0), P('a1', 0, 1), P('b1', 1, 1)]
  it('mateOf', () => {
    expect(mateOf(ps, ps[0])?.id).toBe('a1')
    expect(mateOf([ps[0]], ps[0])).toBeUndefined()
  })
  it('serverOf', () => {
    expect(serverOf(ps, 1, [0, 1]).id).toBe('b1')
    expect(serverOf([ps[0], ps[1]], 0, [1, 1]).id).toBe('a0')
  })
  it('flipServe', () => {
    expect(flipServe([0, 0], 0, 1, true)).toEqual([1, 0])
    expect(flipServe([0, 0], 0, 0, true)).toEqual([0, 0])
    expect(flipServe([0, 0], 0, 1, false)).toEqual([0, 0])
  })
  it('walks the rotation', () => {
    let slots: [0 | 1, 0 | 1] = [0, 0]
    let server: 0 | 1 = 0
    const walk = (winner: 0 | 1): string => {
      slots = flipServe(slots, server, winner, true)
      server = winner
      return serverOf(ps, server, slots).id
    }
    expect([1, 0, 0, 1, 1, 0].map((w) => walk(w as 0 | 1))).toEqual(['b0', 'a1', 'a1', 'b1', 'b1', 'a0'])
  })
})

describe('takerOf', () => {
  const busyNone = () => false
  it('nearer takes', () => {
    const ps = [P('a0', 0, 0, 2, 0), P('a1', 0, 1, -1, 0)]
    expect(takerOf(ps, 0, { x: -1, z: 0 }, busyNone)?.id).toBe('a1')
  })
  it('tie goes to slot 0', () => {
    const ps = [P('a1', 0, 1, 1.01, 0), P('a0', 0, 0, -1, 0)]
    expect(takerOf(ps, 0, { x: 0, z: 0 }, busyNone)?.id).toBe('a0')
    expect(COVER.tie).toBe(0.05)
  })
  it('skips busy, null when all busy', () => {
    const ps = [P('a0', 0, 0, 0, 0), P('a1', 0, 1, 3, 0)]
    expect(takerOf(ps, 0, { x: 0, z: 0 }, (p) => p.id === 'a0')?.id).toBe('a1')
    expect(takerOf(ps, 0, { x: 0, z: 0 }, () => true)).toBeNull()
  })
  it('ignores the other side', () => {
    const ps = [P('a0', 0, 0, 3, 0), P('b0', 1, 0, 0, 0)]
    expect(takerOf(ps, 0, { x: 0, z: 0 }, busyNone)?.id).toBe('a0')
  })
})

describe('coverSpot', () => {
  const court = courtFor('2v2', 'normal')
  it('goes to the opposite half of the taker', () => {
    const s = coverSpot(court, 0, 1, 0.5, 2)
    expect(s.x).toBeCloseTo(court.halfWidth * COVER.splitX) // view x -hw/2 → side 0 world x +hw/2
    expect(s.z).toBeCloseTo(-2)
  })
  it('side 1 mirrors into world', () => {
    const s = coverSpot(court, 1, 1, 0.5, 2)
    expect(s.x).toBeCloseTo(-court.halfWidth * COVER.splitX)
    expect(s.z).toBeCloseTo(2)
  })
  it('centred taker: cover stays on own half', () => {
    const s = coverSpot(court, 0, 0.1, 0.8, 2)
    expect(s.x).toBeCloseTo(-court.halfWidth * COVER.splitX) // view +, world -
    const s2 = coverSpot(court, 0, 0.1, -0.8, 2)
    expect(s2.x).toBeCloseTo(court.halfWidth * COVER.splitX)
  })
})

describe('sideName', () => {
  it('joins names', () => {
    expect(sideName(['A'])).toBe('A')
    expect(sideName(['A', 'B'])).toBe('A & B')
  })
})

describe('teamName', () => {
  const H = { kind: 'human' as const, name: 'Ann' }
  const C = { kind: 'ai' as const, name: 'Computer' }
  const n = (p: { name: string }) => p.name
  it('one name for an all-computer team, both when a human is on it', () => {
    expect(teamName([C, C], n)).toBe('Computer')
    expect(teamName([H, C], n)).toBe('Ann & Computer')
    expect(teamName([H], n)).toBe('Ann')
  })
})
