import { describe, expect, it, vi } from 'vitest'
import { theme } from '@forge/ui/theme'
import { comboPitch, hpColor, Juice } from './juice'

vi.mock('@forge/audio/sound', () => ({ playSound: vi.fn() }))
vi.mock('@forge/fx/confetti', () => ({ celebrate: vi.fn() }))

const particles = { burst: vi.fn(), text: vi.fn() }
const shake = { add: vi.fn() }
const juice = () => new Juice(particles as never, shake as never)

describe('comboPitch', () => {
  it('climbs a pentatonic scale then wraps', () => {
    expect(comboPitch(1)).toBeCloseTo(523.25)
    expect(comboPitch(2)).toBeGreaterThan(comboPitch(1))
    expect(comboPitch(6)).toBeCloseTo(1046.5)
    expect(comboPitch(16)).toBeCloseTo(comboPitch(1))
  })
})

describe('hpColor', () => {
  it('runs from cool to hot', () => {
    expect(hpColor(0, 10)).toBe('#5ab8ff')
    expect(hpColor(999, 10)).toBe(theme.coral.toLowerCase())
  })
})

describe('Juice', () => {
  it('shows a banner and flash on a board wipe', () => {
    const j = juice()
    j.handle({ type: 'allClear', coins: 10 })
    expect(j.banner?.text).toBe('ALL CLEAR!')
    expect(j.flash).toBe(1)
  })

  it('shakes and bursts on a kill', () => {
    const j = juice()
    j.handle({ type: 'kill', x: 10, y: 20, maxHp: 5 })
    expect(particles.burst).toHaveBeenCalled()
    expect(shake.add).toHaveBeenCalledWith(0.08)
  })

  it('fades the banner and flash over time', () => {
    const j = juice()
    j.handle({ type: 'fever' })
    j.update(5)
    expect(j.banner).toBeNull()
    expect(j.flash).toBe(0)
  })
})
