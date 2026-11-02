import { describe, expect, it, vi } from 'vitest'
import { BODIES } from './creature/bodies'
import { solveHands } from './creature/hands'
import { CREATURE_LOOKS } from './creature/looks'
import type { Frame } from './creature/types'
import { HeroAvatar, type AvatarContext, type Mood } from './hero-avatar'
import { HERO_IDS } from './sim/heroes'
import { fakeCanvas, installPath2D } from './test-canvas'

const motion = vi.hoisted(() => ({ reduced: false }))
vi.mock('@forge/fx/tween', () => ({ prefersReducedMotion: () => motion.reduced }))

const ctx = (patch: Partial<AvatarContext> = {}): AvatarContext => ({
  homeX: 100,
  boardW: 392,
  floorY: 760,
  aim: null,
  watch: null,
  throwing: false,
  danger: false,
  lowHealth: false,
  combo: 0,
  ...patch,
})

installPath2D()

const run = (a: HeroAvatar, seconds: number, c = ctx()) => {
  for (let t = 0; t < seconds; t += 1 / 60) a.update(1 / 60, c)
}

describe('hero avatar', () => {
  it('throws on launch, flinches when hurt, and settles back', () => {
    const a = new HeroAvatar('rookie')
    run(a, 0.5)
    a.handle({ type: 'fire' })
    expect(a.mood).toBe('throw')
    run(a, 1)
    expect(a.mood).toBe('idle')
    a.handle({ type: 'breach', damage: 10, at: [], boss: false })
    expect(a.mood).toBe('hurt')
  })

  it('a small cheer does not cut off a flinch, but a big one waits its turn', () => {
    const a = new HeroAvatar('rookie')
    a.handle({ type: 'breach', damage: 10, at: [], boss: false })
    a.handle({ type: 'kill', id: 1, x: 0, y: 0, maxHp: 1, kind: 'gold', coins: 1 })
    expect(a.mood).toBe('hurt')
    run(a, 1.5)
    a.handle({ type: 'levelUp' })
    expect(a.mood).toBe('cheer')
  })

  it('stays knocked out until revived', () => {
    const a = new HeroAvatar('rookie')
    a.handle({ type: 'over' })
    run(a, 3)
    a.handle({ type: 'levelUp' })
    expect(a.mood).toBe('ko')
    a.handle({ type: 'revive' })
    expect(a.mood).toBe('revive')
  })

  it('aims while aiming, watches the volley, worries when bricks are close', () => {
    const a = new HeroAvatar('rookie')
    run(a, 0.2, ctx({ aim: 1 }))
    expect(a.mood).toBe('aim')
    run(a, 0.2, ctx({ watch: { x: 200, y: 300 } }))
    expect(a.mood).toBe('watch')
    run(a, 0.2, ctx({ danger: true }))
    expect(a.mood).toBe('worried')
  })

  it('stands just behind the ball, facing the middle, so its hand can hold it', () => {
    const a = new HeroAvatar('rookie')
    run(a, 0.1, ctx({ homeX: 100 }))
    expect(a.facing).toBe(1)
    expect(a.x).toBeCloseTo(88, 0)
    run(a, 2, ctx({ homeX: 300 }))
    expect(a.facing).toBe(-1)
    expect(a.x).toBeCloseTo(312, 0) // right of centre: stands further right, facing in
  })

  it('draws every hero in every mood without errors', () => {
    const c = fakeCanvas()
    const moods: Mood[] = [
      'idle',
      'aim',
      'throw',
      'watch',
      'cheer',
      'pump',
      'wow',
      'scared',
      'worried',
      'hurt',
      'heal',
      'cast',
      'ko',
      'revive',
      'sad',
    ]
    for (const id of HERO_IDS) {
      const a = new HeroAvatar(id)
      for (const m of moods) {
        a.setMood(m, 'alert')
        run(a, 0.3, ctx({ aim: m === 'aim' ? 1.2 : null, hold: { x: 100, y: 734, r: 7 } }))
        expect(() => a.draw(c, 760, 1.15)).not.toThrow()
      }
    }
  })
})

describe('hero aura moods', () => {
  it('sighs after a volley that broke nothing, not after one that did', () => {
    const a = new HeroAvatar('rookie')
    a.handle({ type: 'fire' })
    run(a, 1)
    a.handle({ type: 'turn', turn: 2 })
    expect(a.mood).toBe('sad')
    const b = new HeroAvatar('rookie')
    b.handle({ type: 'fire' })
    b.handle({ type: 'kill', id: 1, x: 0, y: 0, maxHp: 1, kind: 'normal', coins: 0 })
    run(b, 1)
    b.handle({ type: 'turn', turn: 2 })
    expect(b.mood).not.toBe('sad')
  })

  it('draws its aura at any combo, when hit and when sad', () => {
    const c = fakeCanvas()
    const a = new HeroAvatar('rookie')
    for (const combo of [0, 30, 120]) {
      run(a, 0.2, ctx({ combo }))
      expect(() => a.draw(c, 760)).not.toThrow()
    }
    a.handle({ type: 'breach', damage: 5, at: [], boss: false })
    expect(() => a.draw(c, 760)).not.toThrow()
  })
})

describe('creature hands', () => {
  const hold = { x: 100, y: 740, r: 5 }
  const near = (p: { x: number; y: number } | null | undefined, q: { x: number; y: number }) => {
    expect(p).toBeTruthy()
    expect(Math.abs(p!.x - q.x)).toBeLessThan(0.01)
    expect(Math.abs(p!.y - q.y)).toBeLessThan(0.01)
  }

  it('creature hand holds the ball', () => {
    const a = new HeroAvatar('rookie')
    run(a, 0.5, ctx({ hold }))
    expect(a.mood).toBe('idle')
    a.draw(fakeCanvas(), 760)
    near(a.lastHands?.front, hold)
  })

  it('draws the held ball at the hold point, then the grip over it', () => {
    const a = new HeroAvatar('rookie')
    const balls: Array<[number, number, number]> = []
    a.drawBall = (_c, x, y, r) => balls.push([x, y, r])
    run(a, 0.5, ctx({ hold }))
    a.draw(fakeCanvas(), 760)
    expect(balls).toHaveLength(1)
    expect(balls[0][0]).toBeCloseTo(100, 6)
    expect(balls[0][1]).toBeCloseTo(740, 6)
    expect(balls[0][2]).toBe(5)
  })

  it('mirrored creature still holds the ball', () => {
    const a = new HeroAvatar('rookie')
    const h = { x: 300, y: 740, r: 5 }
    run(a, 0.5, ctx({ homeX: 300, hold: h }))
    expect(a.facing).toBe(-1)
    a.draw(fakeCanvas(), 760)
    near(a.lastHands?.front, h)
    expect(a.lastHands!.back.x).toBeGreaterThan(a.x) // the back hand is behind (facing left)
  })

  it('holds at a bigger size and while worried or aiming', () => {
    for (const patch of [{ danger: true }, { aim: 1.2 }, { watch: { x: 200, y: 300 } }]) {
      const a = new HeroAvatar('rookie')
      a.size = 1.35
      run(a, 0.6, ctx({ hold, ...patch }))
      a.draw(fakeCanvas(), 760)
      near(a.lastHands?.front, hold)
    }
  })

  it('baron (the slime) holds the ball in its floating front hand, mirrored and bigger too', () => {
    for (const [homeX, size] of [
      [100, 1],
      [300, 1],
      [100, 1.35],
    ]) {
      const a = new HeroAvatar('baron')
      a.size = size
      const h = { x: homeX, y: 740, r: 5 }
      run(a, 0.5, ctx({ homeX, hold: h }))
      expect(a.mood).toBe('idle')
      a.draw(fakeCanvas(), 760)
      near(a.lastHands?.front, h)
    }
  })

  /** The rookie's solved back-hand target in board units (size 1, no knock or tremble). */
  const backTarget = (a: HeroAvatar, floorY = 760) => {
    const f = (a as unknown as { buildFrame(): Frame }).buildFrame()
    const look = CREATURE_LOOKS.rookie!
    const body = BODIES.robot!
    const m = body.metrics(look, f)
    const { back } = solveHands(m, body.pose!(look, f), null, false)
    return { x: a.x + back.x * a.facing, y: floorY + f.hop + back.y }
  }

  it('setHero snaps hands', () => {
    // A legacy (no-look) hero, made by hiding one look for this test only, so it holds as heroes get converted.
    const legacy = 'flash'
    const saved = CREATURE_LOOKS[legacy]
    const a = new HeroAvatar('rookie')
    run(a, 0.5, ctx({ hold }))
    a.draw(fakeCanvas(), 760)
    delete CREATURE_LOOKS[legacy]
    try {
      a.setHero(legacy)
      a.draw(fakeCanvas(), 760)
      expect(a.lastHands).toBeNull() // legacy drawing
    } finally {
      CREATURE_LOOKS[legacy] = saved
    }
    a.setHero('rookie') // cheer: not a hold mood, the hands are free
    a.update(1 / 60, ctx({ hold }))
    a.draw(fakeCanvas(), 760)
    // Without the snap the back hand would still be near its old idle spot.
    near(a.lastHands?.back, backTarget(a))
    const first = a.lastHands
    a.draw(fakeCanvas(), 760)
    expect(a.lastHands).toEqual(first)
  })

  it('a free hand sits on its target at once under reduced motion', () => {
    const a = new HeroAvatar('rookie')
    run(a, 0.5, ctx({ hold }))
    a.draw(fakeCanvas(), 760)
    motion.reduced = true
    try {
      a.handle({ type: 'levelUp' })
      a.update(1 / 60, ctx({ hold }))
      a.draw(fakeCanvas(), 760)
      near(a.lastHands?.back, backTarget(a))
    } finally {
      motion.reduced = false
    }
  })

  it('a body shift moves forward with the facing', () => {
    const robot = BODIES.robot!
    robot.offsetX = () => 3
    try {
      for (const homeX of [100, 300]) {
        const a = new HeroAvatar('rookie')
        const h = { x: homeX, y: 740, r: 5 }
        run(a, 0.5, ctx({ homeX, hold: h }))
        a.draw(fakeCanvas(), 760)
        const plain = backTarget(a)
        expect(a.lastHands!.back.x - plain.x).toBeCloseTo(3 * a.facing, 1)
      }
    } finally {
      delete robot.offsetX
    }
  })

  it('a free hand lags its target, then settles on it', () => {
    const a = new HeroAvatar('rookie')
    run(a, 0.5, ctx({ hold }))
    a.draw(fakeCanvas(), 760)
    a.handle({ type: 'levelUp' }) // cheer: hands fly up
    a.update(1 / 60, ctx({ hold }))
    a.draw(fakeCanvas(), 760)
    const lag = a.lastHands!.back
    run(a, 0.4, ctx({ hold }))
    a.draw(fakeCanvas(), 760)
    expect(a.lastHands!.back.y).toBeLessThan(lag.y) // still travelling up after one frame
  })
})
