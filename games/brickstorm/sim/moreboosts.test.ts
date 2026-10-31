import { describe, expect, it } from 'vitest'
import { modsOf, SYNERGIES } from './boosts'
import { DANGER_ROW, TICK } from './config'
import { killBrick } from './damage'
import { drainEvents, fire, step } from './run'
import { brick, empty, runVolley } from './testing'

describe('aftershock', () => {
  it('hits the four neighbours of a destroyed brick', () => {
    const s = empty()
    s.boosts = { aftershock: 1 }
    const center = brick(s, 3, 5, 1)
    const around = [brick(s, 2, 5, 5), brick(s, 4, 5, 5), brick(s, 3, 4, 5), brick(s, 3, 6, 5)]
    const corner = brick(s, 2, 4, 5)
    killBrick(s, center, 0)
    expect(around.map((b) => b.hp)).toEqual([4, 4, 4, 4])
    expect(corner.hp).toBe(5)
  })
})

describe('magnet', () => {
  it('collects pickups a cell away from the ball', () => {
    for (const magnet of [0, 1]) {
      const s = empty()
      if (magnet) s.boosts = { magnet: 1 }
      s.pickups.push({ id: s.nextId++, col: 4, row: 5, kind: 'ball' })
      fire(s, Math.PI / 2)
      runVolley(s)
      expect(s.ballCount).toBe(magnet ? 2 : 1)
    }
  })
})

describe('midas', () => {
  it('adds coins per kill', () => {
    const s = empty()
    s.boosts = { midas: 2 }
    killBrick(s, brick(s, 0, 0, 1), 0)
    expect(s.coins).toBe(3)
  })
})

describe('combo keeper', () => {
  it('lets a combo survive a longer gap', () => {
    for (const keeper of [0, 1]) {
      const s = empty()
      if (keeper) s.boosts = { keeper: 1 }
      fire(s, Math.PI / 2)
      s.combo = 5
      s.sinceHit = 2.0 - TICK
      step(s)
      expect(s.combo).toBe(keeper ? 5 : 0)
    }
  })
})

describe('brain', () => {
  it('earns 30% more xp per kill', () => {
    const s = empty()
    s.boosts = { brain: 1 }
    killBrick(s, brick(s, 0, 0, 1), 0)
    expect(s.xp).toBeCloseTo(1.3)
  })
})

describe('glass cannon', () => {
  it('doubles damage', () => {
    expect(modsOf({ glass: 1 }).damageMult).toBe(2)
    expect(modsOf({ glass: 1, damage: 2 }).damageMult).toBe(3)
  })

  it('drops bricks an extra row every 10th turn', () => {
    const s = empty()
    s.boosts = { glass: 1 }
    s.turn = 10
    const b = brick(s, 0, 5, 1e6)
    fire(s, Math.PI / 2)
    runVolley(s)
    expect(b.row).toBe(7)
  })
})

describe('second wind', () => {
  it('saves the run once', () => {
    const s = empty()
    s.boosts = { secondWind: 1 }
    brick(s, 0, DANGER_ROW - 1, 1e6)
    fire(s, Math.PI / 2)
    runVolley(s)
    expect(s.phase).toBe('aim')
    expect(s.secondWindUsed).toBe(true)
    expect(drainEvents(s).some((e) => e.type === 'secondWind')).toBe(true)
    expect(s.bricks.some((b) => b.row >= DANGER_ROW)).toBe(false)

    brick(s, 0, DANGER_ROW - 1, 1e6)
    fire(s, Math.PI / 2)
    runVolley(s)
    expect(s.phase).toBe('over')
  })
})

describe('synergies', () => {
  it('pairs both ways', () => {
    for (const [a, partners] of Object.entries(SYNERGIES)) {
      for (const b of partners ?? []) expect(SYNERGIES[b as keyof typeof SYNERGIES], `${b}→${a}`).toContain(a)
    }
  })
})
