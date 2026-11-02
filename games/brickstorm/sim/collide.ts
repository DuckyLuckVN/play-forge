// Broad phase for ball-vs-brick collisions. The collision shape of every brick
// is built once while the board stays the same (same bricks, same cells), and
// a ball only tests the bricks in the cells around it. The answers are exactly
// those of testing every brick: far bricks can never touch a ball.
import { CELL, TOP } from './config'
import { type Contact, circleShape, type HitShape } from './physics'
import { hitShapes } from './rows'
import type { Brick } from './types'

interface Index {
  bricks: Brick[]
  sig: number
  shapes: HitShape[]
  /** Brick indexes by cell (col, row). */
  cells: Map<number, number[]>
}

let index: Index | null = null

const cellKey = (col: number, row: number) => (col + 64) * 4096 + (row + 64)

/** Cheap fingerprint of where every brick is: changes when one is added, removed or moved. */
function signature(bricks: readonly Brick[]): number {
  let h = bricks.length
  for (const b of bricks) h = (Math.imul(h, 31) + b.id * 7 + b.col * 131 + b.row * 7919) | 0
  return h
}

function indexOf(bricks: Brick[]): Index {
  const sig = signature(bricks)
  if (index && index.bricks === bricks && index.sig === sig) return index
  const cells = new Map<number, number[]>()
  bricks.forEach((b, i) => {
    const k = cellKey(b.col, b.row)
    const list = cells.get(k)
    if (list) list.push(i)
    else cells.set(k, [i])
  })
  index = { bricks, sig, shapes: hitShapes(bricks), cells }
  return index
}

/** Bricks (by index into `bricks`, ascending) whose cells a circle at (x, y) of radius r can reach. */
function nearby(ix: Index, x: number, y: number, r: number): number[] {
  const c0 = Math.floor((x - r) / CELL) - 1
  const c1 = Math.floor((x + r) / CELL) + 1
  const r0 = Math.floor((y - r - TOP) / CELL) - 1
  const r1 = Math.floor((y + r - TOP) / CELL) + 1
  const out: number[] = []
  for (let c = c0; c <= c1; c++)
    for (let row = r0; row <= r1; row++) {
      const list = ix.cells.get(cellKey(c, row))
      if (list) out.push(...list)
    }
  return out.sort((a, b) => a - b)
}

/**
 * The deepest contact between a circle and the bricks that pass `keep`, as
 * `deepestContact(x, y, hitShapes(bricks.filter(keep)), r)` would find it
 * (same brick, same tie-break: the first in board order).
 */
export function deepestBrickContact(
  bricks: Brick[],
  x: number,
  y: number,
  r: number,
  keep: (b: Brick) => boolean,
): (Contact & { brick: Brick }) | null {
  const ix = indexOf(bricks)
  let best: (Contact & { brick: Brick }) | null = null
  for (const i of nearby(ix, x, y, r)) {
    const b = bricks[i]
    if (!keep(b)) continue
    const c = circleShape(x, y, r, ix.shapes[i])
    if (c && (!best || c.depth > best.depth)) best = { ...c, brick: b }
  }
  return best
}

/** Every brick that passes `keep` and overlaps a circle at (x, y), in board order. */
export function bricksTouching(
  bricks: Brick[],
  x: number,
  y: number,
  r: number,
  keep: (b: Brick) => boolean,
): Brick[] {
  const ix = indexOf(bricks)
  return nearby(ix, x, y, r)
    .filter((i) => keep(bricks[i]) && circleShape(x, y, r, ix.shapes[i]))
    .map((i) => bricks[i])
}
