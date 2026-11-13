import { describe, expect, it } from 'vitest'
import {
  colorOf,
  emptyJar,
  findMatches,
  fits,
  gravityStep,
  H,
  idx,
  inDanger,
  isGloop,
  landing,
  Link,
  linkOf,
  lockPiece,
  makeCell,
  partnerOf,
  pieceCells,
  removeCells,
  tryRotate,
  W,
  type Piece,
} from './grid'

const piece = (x: number, y: number, r = 0, a = 0, b = 1): Piece => ({ x, y, r, a, b })

describe('cells', () => {
  it('pack colour, gloop and link into one number', () => {
    const v = makeCell(2, true, Link.Up)
    expect([colorOf(v), isGloop(v), linkOf(v)]).toEqual([2, true, Link.Up])
    expect(makeCell(0)).not.toBe(0)
  })

  it('find a half’s partner', () => {
    expect(partnerOf(idx(2, 5), makeCell(0, false, Link.Right))).toBe(idx(3, 5))
    expect(partnerOf(idx(2, 5), makeCell(0, false, Link.Up))).toBe(idx(2, 4))
    expect(partnerOf(idx(2, 5), makeCell(0))).toBe(-1)
  })
})

describe('capsule', () => {
  it('turns through its four poses around the bottom-left cell', () => {
    const at = (r: number) => pieceCells(piece(3, 5, r)).map((c) => [c.x, c.y, c.color])
    expect(at(0)).toEqual([
      [3, 5, 0],
      [4, 5, 1],
    ])
    expect(at(1)).toEqual([
      [3, 5, 0],
      [3, 4, 1],
    ])
    expect(at(2)).toEqual([
      [3, 5, 1],
      [4, 5, 0],
    ])
    expect(at(3)).toEqual([
      [3, 5, 1],
      [3, 4, 0],
    ])
  })

  it('can turn upright in the top row (the row above the jar is free)', () => {
    expect(tryRotate(emptyJar(), piece(3, 0), 1)).toMatchObject({ r: 1, x: 3 })
  })

  it('nudges left when lying down against the right wall', () => {
    expect(tryRotate(emptyJar(), piece(W - 1, 5, 1), 1)).toMatchObject({ r: 2, x: W - 2 })
  })

  it('stops at walls and blocks', () => {
    const jar = emptyJar()
    expect(fits(jar, piece(-1, 3))).toBe(false)
    expect(fits(jar, piece(W - 1, 3))).toBe(false)
    jar[idx(4, 3)] = makeCell(1, true)
    expect(fits(jar, piece(3, 3))).toBe(false)
  })

  it('lands on the floor or on what is below', () => {
    const jar = emptyJar()
    expect(landing(jar, piece(0, 0)).y).toBe(H - 1)
    jar[idx(1, 10)] = makeCell(0, true)
    expect(landing(jar, piece(0, 0)).y).toBe(9)
  })

  it('locks linked halves, and tops out when part is above the jar', () => {
    const jar = emptyJar()
    expect(lockPiece(jar, piece(2, 8))).toBe(true)
    expect(linkOf(jar[idx(2, 8)])).toBe(Link.Right)
    expect(linkOf(jar[idx(3, 8)])).toBe(Link.Left)
    const top = emptyJar()
    expect(lockPiece(top, piece(2, 0, 1))).toBe(false)
    expect(linkOf(top[idx(2, 0)])).toBe(Link.None)
  })
})

describe('matches', () => {
  it('pops 4 in a row across or down, not 3', () => {
    const jar = emptyJar()
    const bottom = H - 1
    for (let x = 0; x < 3; x++) jar[idx(x, bottom)] = makeCell(1)
    expect(findMatches(jar).cells).toEqual([])
    jar[idx(3, bottom)] = makeCell(1, true)
    expect(findMatches(jar)).toEqual({ cells: [0, 1, 2, 3].map((x) => idx(x, bottom)), lines: 1 })
    for (let y = 9; y < 14; y++) jar[idx(6, y)] = makeCell(2)
    expect(findMatches(jar).lines).toBe(2)
    expect(findMatches(jar).cells).toHaveLength(9)
  })

  it('counts a cross as two lines but each cell once', () => {
    const jar = emptyJar()
    for (let k = 0; k < 4; k++) {
      jar[idx(k + 1, 10)] = makeCell(0)
      jar[idx(2, 8 + k)] = makeCell(0)
    }
    const m = findMatches(jar)
    expect(m.lines).toBe(2)
    expect(m.cells).toHaveLength(7)
  })

  it('removing a half frees its partner, and counts gloops by colour', () => {
    const jar = emptyJar()
    lockPiece(jar, piece(0, 5))
    jar[idx(5, 5)] = makeCell(2, true)
    expect(removeCells(jar, [idx(0, 5), idx(5, 5)])).toEqual([0, 0, 1])
    expect(linkOf(jar[idx(1, 5)])).toBe(Link.None)
    expect(jar[idx(5, 5)]).toBe(0)
  })
})

describe('gravity', () => {
  it('drops loose halves but never gloops', () => {
    const jar = emptyJar()
    jar[idx(0, 3)] = makeCell(0)
    jar[idx(1, 3)] = makeCell(0, true)
    expect(gravityStep(jar)).toBe(true)
    expect(jar[idx(0, 4)]).toBe(makeCell(0))
    expect(jar[idx(1, 3)]).toBe(makeCell(0, true))
  })

  it('a side-by-side capsule falls only when both halves can', () => {
    const jar = emptyJar()
    lockPiece(jar, piece(2, 5))
    jar[idx(3, 6)] = makeCell(1, true)
    expect(gravityStep(jar)).toBe(false)
    jar[idx(3, 6)] = 0
    expect(gravityStep(jar)).toBe(true)
    expect(linkOf(jar[idx(2, 6)])).toBe(Link.Right)
  })

  it('an upright capsule falls together', () => {
    const jar = emptyJar()
    lockPiece(jar, piece(2, 5, 1))
    while (gravityStep(jar));
    expect(linkOf(jar[idx(2, H - 1)])).toBe(Link.Up)
    expect(linkOf(jar[idx(2, H - 2)])).toBe(Link.Down)
  })
})

describe('danger', () => {
  it('only near where capsules appear', () => {
    const jar = emptyJar()
    jar[idx(0, 1)] = makeCell(0)
    expect(inDanger(jar)).toBe(false)
    jar[idx(4, 2)] = makeCell(0)
    expect(inDanger(jar)).toBe(true)
  })
})
