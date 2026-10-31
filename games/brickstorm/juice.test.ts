import { describe, expect, it, vi } from 'vitest'
import { playSound } from '@forge/audio/sound'
import { theme } from '@forge/ui/theme'
import { comboPitch, hitSound, hpColor, Juice } from './juice'

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

describe('hitSound', () => {
  it('layers a note with a thump an octave down', () => {
    const s = hitSound(7)
    expect(s).toHaveLength(2)
    expect(s[0].freq).toBeCloseTo(comboPitch(7))
    expect(s[0].vol).toBe(0.45)
    expect(s[1].freq).toBeCloseTo(comboPitch(7) / 2)
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

  it('rate-limits repeated sounds of the same kind', () => {
    const j = juice()
    vi.mocked(playSound).mockClear()
    for (let i = 0; i < 20; i++) {
      j.handle({ type: 'wall' })
      j.handle({ type: 'kill', x: 0, y: 0, maxHp: 1 })
      j.handle({ type: 'pickup', kind: 'coin', x: 0, y: 0 })
    }
    expect(playSound).toHaveBeenCalledTimes(3)
  })

  it('plays a launch sound when a volley fires', () => {
    const j = juice()
    vi.mocked(playSound).mockClear()
    j.handle({ type: 'fire' })
    expect(playSound).toHaveBeenCalledTimes(1)
  })
})
