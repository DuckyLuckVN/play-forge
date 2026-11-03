// The broad phase must give exactly the answers of testing every brick.
import { describe, expect, it } from 'vitest'
import { spawnBoss } from './boss'
import { bricksTouching, deepestBrickContact } from './collide'
import { BALL_R, CELL, TOP } from './config'
import { circleShape, deepestContact } from './physics'
import { brickShape, hitShapes } from './rows'
import { empty } from './testing'
import type { Brick, BrickShape, RunState } from './types'

function board(seed: number): RunState {
  const s = empty(seed)
  s.turn = 30
  spawnBoss(s, [], 'brute')
  const shapes: Array<BrickShape | undefined> = [undefined, 'tri-tl', 'tri-tr', 'tri-bl', 'tri-br', 'orb']
  let n = seed
  const rnd = () => (n = (n * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
  for (let row = 3; row < 10; row++)
    for (let col = 0; col < s.cols; col++)
      if (rnd() < 0.6)
        s.bricks.push({
          id: s.nextId++,
          col,
          row,
          hp: 5,
          maxHp: 5,
          kind: 'normal',
          split: false,
          shape: shapes[Math.floor(rnd() * 6)],
        })
  return s
}

describe('broad-phase collisions', () => {
  it('finds the same deepest contact as testing every brick', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const s = board(seed)
      // As the game uses it: everything, the boss alone (fire balls), or all but a pierced brick (never a boss part).
      const pierced = s.bricks.find((b) => b.kind !== 'boss')!.id
      const keeps: Array<(b: Brick) => boolean> = [
        () => true,
        (b) => b.kind === 'boss',
        (b) => b.id !== pierced,
      ]
      for (let i = 0; i < 2000; i++) {
        const x = (i * 37.3) % (s.cols * CELL)
        const y = TOP + ((i * 53.7) % (11 * CELL))
        const keep = keeps[i % keeps.length]
        const solid = s.bricks.filter(keep)
        const slow = deepestContact(x, y, hitShapes(solid), BALL_R)
        const fast = deepestBrickContact(s.bricks, x, y, BALL_R, keep)
        expect(fast?.brick.id).toBe(slow ? solid[slow.index].id : undefined)
        if (slow) expect(fast!.depth).toBeCloseTo(slow.depth, 9)
      }
    }
  })

  it('lists the same touched bricks as testing every brick', () => {
    const s = board(3)
    const keep = (b: Brick) => b.kind !== 'boss'
    for (let i = 0; i < 1500; i++) {
      const x = (i * 29.1) % (s.cols * CELL)
      const y = TOP + ((i * 41.9) % (11 * CELL))
      const slow = s.bricks
        .filter((b) => keep(b) && circleShape(x, y, BALL_R, brickShape(b)))
        .map((b) => b.id)
      expect(bricksTouching(s.bricks, x, y, BALL_R, keep).map((b) => b.id)).toEqual(slow)
    }
  })

  it('sees a brick that moved or was removed (no stale shapes)', () => {
    const s = board(2)
    const b = s.bricks.find((b) => b.kind === 'normal')!
    const c = brickShape(b)
    const at =
      'x' in c ? { x: c.x + c.w / 2, y: c.y + c.h / 2 } : { x: b.col * CELL + 28, y: TOP + b.row * CELL + 28 }
    expect(deepestBrickContact(s.bricks, at.x, at.y, BALL_R, () => true)).not.toBeNull()
    b.row = 20 // moved away
    expect(deepestBrickContact(s.bricks, at.x, at.y, BALL_R, (x) => x.id === b.id)).toBeNull()
    s.bricks = s.bricks.filter((x) => x !== b)
    expect(bricksTouching(s.bricks, at.x, at.y, BALL_R, (x) => x.id === b.id)).toEqual([])
  })
})
