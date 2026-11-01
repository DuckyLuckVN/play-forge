import { describe, expect, it, vi } from 'vitest'
import { playSound } from '@forge/audio/sound'
import { theme } from '@forge/ui/theme'
import { comboPitch, GROW_FX_LIFE, hitSound, hpColor, Juice, pitched } from './juice'
import { BRICK_SOUNDS } from './sounds'

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
    j.handle({ type: 'kill', id: 1, x: 10, y: 20, maxHp: 5, kind: 'normal', coins: 1 })
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
      j.handle({ type: 'kill', id: 1, x: 0, y: 0, maxHp: 1, kind: 'normal', coins: 1 })
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
    j.handle({ type: 'kill', id: 1, x: 50, y: 300, maxHp: 1, kind: 'gold', coins: 2 })
    expect(j.coinFlyers.length).toBeGreaterThan(0)
    j.setCoins(100)
    j.update(0.1)
    expect(j.shownCoins).toBeGreaterThan(0)
    expect(j.shownCoins).toBeLessThan(100)
    j.update(5)
    expect(j.shownCoins).toBe(100)
  })

  it('flies no coins for a kill that paid none', () => {
    const j = juice()
    j.handle({ type: 'kill', id: 1, x: 50, y: 300, maxHp: 1, kind: 'normal', coins: 0 })
    expect(j.coinFlyers).toHaveLength(0)
    j.handle({ type: 'kill', id: 2, x: 50, y: 300, maxHp: 1, kind: 'normal', coins: 2 })
    expect(j.coinFlyers).toHaveLength(2)
  })
})

describe('XP bar', () => {
  it('eases the bar toward the real XP', () => {
    const j = juice()
    j.setXp(0, 0.5)
    expect(j.shownXp).toBe(0)
    for (let i = 0; i < 120; i++) j.update(1 / 60)
    expect(j.shownXp).toBeCloseTo(0.5, 2)
  })

  it('fills the bar and flashes when a level is crossed', () => {
    const j = juice()
    j.setXp(1, 0.2)
    while (j.shownXp < 1) j.update(1 / 60)
    expect(j.xpFlash).toBe(1)
    for (let i = 0; i < 120; i++) j.update(1 / 60)
    expect(j.shownXp).toBeCloseTo(1.2, 2)
  })

  it('snaps back for a new run', () => {
    const j = juice()
    j.setXp(2, 0.5)
    j.setXp(0, 0)
    expect(j.shownXp).toBe(0)
  })

  it('jumps straight to a resumed run without a rush', () => {
    const j = juice()
    vi.mocked(playSound).mockClear()
    j.setXp(4, 0.5, true)
    j.update(0.1)
    expect(j.shownXp).toBe(4.5)
    expect(j.xpGlow).toBe(0)
    expect(playSound).not.toHaveBeenCalled()
  })

  it('glows, sparks and ticks with a rising pitch on a quick rush of XP', () => {
    const j = juice()
    vi.mocked(playSound).mockClear()
    for (let i = 0; i < 6; i++) {
      j.setXp(0, (i + 1) * 0.08)
      j.update(0.1)
    }
    expect(j.xpGlow).toBeGreaterThan(0)
    expect(j.xpSparks).toBeGreaterThan(0)
    const ticks = vi.mocked(playSound).mock.calls.map(([s]) => (s as { freq: number }[])[0].freq)
    expect(ticks.length).toBeGreaterThan(1)
    expect(ticks.at(-1)!).toBeGreaterThan(ticks[0])
  })

  it('stays calm on a slow trickle of XP', () => {
    const j = juice()
    vi.mocked(playSound).mockClear()
    for (let i = 0; i < 10; i++) {
      j.setXp(0, (i + 1) * 0.02)
      j.update(0.5)
    }
    expect(j.xpGlow).toBe(0)
    expect(playSound).not.toHaveBeenCalled()
  })

  it('ticks at most 8 times a second', () => {
    const j = juice()
    vi.mocked(playSound).mockClear()
    for (let i = 0; i < 60; i++) {
      j.setXp(i, 0.9)
      j.update(1 / 60)
    }
    const ticks = vi.mocked(playSound).mock.calls.filter(([s]) => s !== BRICK_SOUNDS.whoosh)
    expect(ticks.length).toBeLessThanOrEqual(8)
  })
})

describe('level-up intro', () => {
  it('celebrates, then lets the pick screen open after a beat', () => {
    const j = juice()
    vi.mocked(playSound).mockClear()
    j.handle({ type: 'levelUp' })
    j.startLevelUp()
    expect(j.banner).toMatchObject({ text: 'LEVEL UP!', big: true })
    expect(playSound).toHaveBeenCalledTimes(2)
    expect(j.levelUpDone).toBe(false)
    j.update(1)
    expect(j.levelUpDone).toBe(false)
    j.update(0.3)
    expect(j.levelUpDone).toBe(true)
  })

  it('can be skipped', () => {
    const j = juice()
    j.startLevelUp()
    j.skipLevelUp()
    expect(j.levelUpDone).toBe(true)
  })

  it('says FREE BOOST for a pick from a mystery brick', () => {
    const j = juice()
    j.handle({ type: 'mystery', x: 0, y: 0, reward: 'pick' })
    j.startLevelUp()
    expect(j.banner?.text).toBe('FREE BOOST!')
  })
})

describe('XP tally and heat', () => {
  it('adds up XP gained in a burst, then clears', () => {
    const j = juice()
    j.gainXp(3)
    j.update(0.5)
    j.gainXp(4)
    expect(j.xpTally?.amount).toBe(7)
    j.update(0.5)
    expect(j.xpTally?.amount).toBe(7)
    j.update(2)
    expect(j.xpTally).toBeNull()
    j.gainXp(2)
    expect(j.xpTally?.amount).toBe(2)
  })

  it('heats up the bar in tiers with the size of the rush', () => {
    const rush = (levels: number) => {
      const j = juice()
      j.setXp(0, 0)
      j.setXp(Math.floor(levels), levels % 1)
      j.update(0.05)
      return j
    }
    expect(rush(0.1).xpHeat).toBe(0)
    expect(rush(0.4).xpHeat).toBe(1)
    expect(rush(0.9).xpHeat).toBe(2)
    expect(rush(1.5).xpHeat).toBe(3)
  })

  it('whooshes once when the bar goes white-hot', () => {
    const j = juice()
    vi.mocked(playSound).mockClear()
    j.setXp(2, 0)
    j.update(0.05)
    const calls = vi.mocked(playSound).mock.calls.length
    j.setXp(2, 0.5)
    j.update(0.05)
    const whooshes = vi.mocked(playSound).mock.calls.filter(([s]) => s === BRICK_SOUNDS.whoosh)
    expect(whooshes).toHaveLength(1)
    expect(calls).toBeGreaterThan(0)
  })
})

describe('grow effect', () => {
  it('lights the new edge when the board grows, then fades out', () => {
    const j = juice()
    j.handle({ type: 'grow', axis: 'col' })
    expect(j.growFx).toEqual({ axis: 'col', age: 0 })
    j.update(GROW_FX_LIFE / 2)
    expect(j.growFx?.age).toBeCloseTo(GROW_FX_LIFE / 2)
    j.update(GROW_FX_LIFE)
    expect(j.growFx).toBeNull()
  })
})
