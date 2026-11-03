import { beforeEach, describe, expect, it, vi } from 'vitest'
import { playSound } from '@forge/audio/sound'
import { BOSS_DROP, BOSS_SETTLE } from './boss-entrance'
import { ARENA_LAND, Juice } from './juice'

vi.mock('@forge/audio/sound', () => ({ playSound: vi.fn() }))
vi.mock('@forge/fx/confetti', () => ({ celebrate: vi.fn() }))

const particles = { burst: vi.fn(), text: vi.fn() }
const shake = { add: vi.fn() }
const juice = () => new Juice(particles as never, shake as never)

beforeEach(() => vi.clearAllMocks())

describe('boss entrance', () => {
  it('is arriving until the boss has landed and the dust settled, then lets the card open', () => {
    const j = juice()
    j.handle({ type: 'arena', grow: true, cols: 1 })
    j.handle({ type: 'boss', noun: 'x', traits: [] } as never)
    expect(j.bossArriving).toBe(true)
    for (let t = 0; t < ARENA_LAND + BOSS_DROP + BOSS_SETTLE + 1; t += 0.05) j.update(0.05)
    expect(j.bossArriving).toBe(false)
  })

  it('rumbles while the arena opens, and hits hardest when the boss lands', () => {
    const j = juice()
    j.handle({ type: 'arena', grow: true, cols: 1 })
    shake.add.mockClear()
    j.handle({ type: 'boss', noun: 'x', traits: [] } as never)
    const announce = Math.max(...shake.add.mock.calls.map((c) => c[0] as number))
    expect(announce).toBeLessThan(0.5)
    for (let t = 0; t < ARENA_LAND + BOSS_DROP + 0.1; t += 0.05) j.update(0.05)
    expect(shake.add).toHaveBeenCalledWith(1)
  })
})

describe('arena shrink after a boss', () => {
  it('waits, silent, until released; then plays and runs', () => {
    const j = juice()
    j.handle({ type: 'arena', grow: false, cols: 1 })
    expect(playSound).not.toHaveBeenCalled()
    j.update(1)
    expect(j.arenaFx?.age).toBe(0)
    j.releaseArena()
    expect(playSound).toHaveBeenCalled()
    j.update(0.1)
    expect(j.arenaFx!.age).toBeGreaterThan(0)
  })
})
