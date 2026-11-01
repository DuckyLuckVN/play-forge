import { describe, expect, it, vi } from 'vitest'
import { HeroAvatar, type AvatarContext, type Mood } from './hero-avatar'
import { HERO_IDS } from './sim/heroes'

vi.mock('@forge/fx/tween', () => ({ prefersReducedMotion: () => false }))

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

/** A canvas context that accepts every call, so drawing can be smoke-tested without a browser. */
function fakeCanvas(): CanvasRenderingContext2D {
  const target: Record<string, unknown> = {}
  const gradient = { addColorStop: () => undefined }
  return new Proxy(target, {
    get: (t, k) => (k in t ? t[k as string] : () => gradient),
    set: (t, k, v) => {
      t[k as string] = v
      return true
    },
  }) as unknown as CanvasRenderingContext2D
}

// Node has no Path2D: a stand-in that records nothing.
;(globalThis as { Path2D?: unknown }).Path2D ??= class {
  moveTo() {}
  lineTo() {}
  quadraticCurveTo() {}
  closePath() {}
}

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
