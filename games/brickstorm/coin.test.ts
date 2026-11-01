import { describe, expect, it } from 'vitest'
import { COIN_SVG, formatCoins, shortCoins } from './coin'

describe('coins', () => {
  it('shortens big amounts for badges', () => {
    expect(shortCoins(0)).toBe('0')
    expect(shortCoins(999)).toBe('999')
    expect(shortCoins(1234)).toBe('1.2k')
    expect(shortCoins(15_600)).toBe('15.6k')
    expect(shortCoins(250_000)).toBe('250k')
    expect(shortCoins(3_400_000)).toBe('3.4M')
  })

  it('formats coins one way everywhere: full below 100k, short above', () => {
    expect(formatCoins(0)).toBe('0')
    expect(formatCoins(12_345)).toBe((12_345).toLocaleString())
    expect(formatCoins(99_999)).toBe((99_999).toLocaleString())
    expect(formatCoins(250_000)).toBe('250k')
    expect(formatCoins(12.7)).toBe('12')
  })

  it('has an inline SVG coin for the page', () => {
    expect(COIN_SVG).toMatch(/^<svg[^>]*viewBox="0 0 24 24"/)
  })
})
