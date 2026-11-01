import { describe, expect, it } from 'vitest'
import { COIN_SVG, shortCoins } from './coin'

describe('coins', () => {
  it('shortens big amounts for badges', () => {
    expect(shortCoins(0)).toBe('0')
    expect(shortCoins(999)).toBe('999')
    expect(shortCoins(1234)).toBe('1.2k')
    expect(shortCoins(15_600)).toBe('15.6k')
    expect(shortCoins(250_000)).toBe('250k')
    expect(shortCoins(3_400_000)).toBe('3.4M')
  })

  it('has an inline SVG coin for the page', () => {
    expect(COIN_SVG).toMatch(/^<svg[^>]*viewBox="0 0 24 24"/)
  })
})
