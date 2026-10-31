import { describe, expect, it, vi } from 'vitest'
import { playSound } from '@forge/audio/sound'
import { theme } from '@forge/ui/theme'
import { comboPitch, hitSound, hpColor, Juice, pitched } from './juice'

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

describe('pitched', () => {
  it('scales every tone, including slides', () => {
    expect(
      pitched(
        [
          { freq: 100, to: 50, dur: 1 },
          { freq: 200, dur: 1 },
        ],
        1.5,
      ),
    ).toEqual([
      { freq: 150, to: 75, dur: 1 },
      { freq: 300, to: undefined, dur: 1 },
    ])
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
    j.handle({ type: 'kill', id: 1, x: 10, y: 20, maxHp: 5, kind: 'normal' })
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
      j.handle({ type: 'kill', id: 1, x: 0, y: 0, maxHp: 1, kind: 'normal' })
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

  it('announces combo milestones once per volley', () => {
    const j = juice()
    j.handle({ type: 'fire' })
    j.handle({ type: 'hit', x: 0, y: 0, combo: 24, crit: false })
    expect(j.banner).toBeNull()
    j.handle({ type: 'hit', x: 0, y: 0, combo: 25, crit: false })
    expect(j.banner?.text).toBe('NICE!')
    j.banner = null
    const banner = () => j.banner?.text ?? null
    j.handle({ type: 'hit', x: 0, y: 0, combo: 26, crit: false })
    expect(banner()).toBeNull()
    j.handle({ type: 'hit', x: 0, y: 0, combo: 50, crit: false })
    expect(banner()).toBe('GREAT!')
  })

  it('ripples chain explosions by depth and freezes on big chains', () => {
    const j = juice()
    particles.burst.mockClear()
    j.handle({ type: 'explode', x: 0, y: 0, depth: 3 })
    j.update(0.17)
    expect(particles.burst).not.toHaveBeenCalled()
    j.update(0.02)
    expect(particles.burst).toHaveBeenCalled()
    expect(j.hitstop).toBeCloseTo(0.04)
  })

  it('does not freeze on a lone explosion', () => {
    const j = juice()
    j.handle({ type: 'explode', x: 0, y: 0, depth: 0 })
    j.update(0.01)
    expect(j.hitstop).toBe(0)
  })

  it('flies coins to the counter and eases the shown total', () => {
    const j = juice()
    j.handle({ type: 'kill', id: 1, x: 50, y: 300, maxHp: 1, kind: 'gold' })
    expect(j.coinFlyers.length).toBeGreaterThan(0)
    j.setCoins(100)
    j.update(0.1)
    expect(j.shownCoins).toBeGreaterThan(0)
    expect(j.shownCoins).toBeLessThan(100)
    j.update(5)
    expect(j.shownCoins).toBe(100)
  })
})
