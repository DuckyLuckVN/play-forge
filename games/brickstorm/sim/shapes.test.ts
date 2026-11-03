import { describe, expect, it } from 'vitest'
import { circlePoly, deepestContact } from './physics'
import { brickShape, hitShapes, SHAPE_HP, shapeChance, spawnRow } from './rows'
import { createRun, fire } from './run'
import { brick, empty, runVolley } from './testing'

describe('shaped bricks', () => {
  it('a triangle collides on its slanted side with a diagonal normal', () => {
    // Right angle at bottom-left: the hypotenuse runs from top-left to bottom-right.
    const tri: Array<[number, number]> = [
      [0, 0],
      [0, 100],
      [100, 100],
    ]
    const c = circlePoly(60, 48, 10, tri)!
    expect(c).not.toBeNull()
    expect(c.nx).toBeCloseTo(Math.SQRT1_2, 3)
    expect(c.ny).toBeCloseTo(-Math.SQRT1_2, 3)
    // The empty half of the cell is empty.
    expect(circlePoly(80, 15, 5, tri)).toBeNull()
  })

  it('pushes a ball whose centre is inside a triangle back out', () => {
    const c = circlePoly(10, 90, 5, [
      [0, 0],
      [0, 100],
      [100, 100],
    ])!
    expect(c.depth).toBeGreaterThan(5)
  })

  it('an orb collides like a circle', () => {
    const s = empty()
    const b = brick(s, 3, 3, 10)
    b.shape = 'orb'
    const shape = brickShape(b)
    expect('circle' in shape).toBe(true)
    const contacts = deepestContact(-1000, -1000, hitShapes([b]), 7)
    expect(contacts).toBeNull()
  })

  it('appear from turn 8, more as the run goes on, with less health than a square', () => {
    expect(shapeChance(7)).toBe(0)
    expect(shapeChance(8)).toBeGreaterThan(0)
    expect(shapeChance(200)).toBeGreaterThan(shapeChance(20))
    for (const k of Object.values(SHAPE_HP)) expect(k).toBeLessThan(1)
    let shaped = 0
    for (let seed = 1; seed <= 200; seed++) {
      const s = createRun(seed)
      s.bricks = []
      s.turn = 40
      s.ballCount = 99
      spawnRow(s)
      shaped += s.bricks.filter((b) => b.shape).length
    }
    expect(shaped).toBeGreaterThan(0)
  })

  it('a ball deflects sideways off a triangle’s slant instead of straight back', () => {
    const s = empty()
    s.launchX = 3.5 * 56
    // Right angle top-left: the slant faces down-right, so a ball going straight up is sent right.
    const b = brick(s, 3, 6, 1e6)
    b.shape = 'tri-tl'
    fire(s, Math.PI / 2)
    let turned = false
    runVolley(s, (st) => {
      if (st.balls.some((x) => x.status === 'flying' && x.vx > 100)) turned = true
    })
    expect(turned).toBe(true)
  })
})
