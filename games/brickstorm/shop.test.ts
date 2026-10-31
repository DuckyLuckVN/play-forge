import { describe, expect, it } from 'vitest'
import { DEFAULT_SAVE, type Save } from './save'
import { buy, CATALOG, equip } from './shop'

const withCoins = (coins: number): Save => ({ ...structuredClone(DEFAULT_SAVE), coins })

describe('catalog', () => {
  it('has the spec item counts with unique ids', () => {
    const n = (kind: string) => CATALOG.filter((i) => i.kind === kind).length
    expect([n('ball'), n('trail'), n('arena'), n('impact'), n('helper')]).toEqual([8, 6, 5, 5, 4])
    expect(new Set(CATALOG.map((i) => i.id)).size).toBe(CATALOG.length)
  })

  it('makes the default cosmetics free', () => {
    for (const id of DEFAULT_SAVE.owned) expect(CATALOG.find((i) => i.id === id)?.price).toBe(0)
  })
})

describe('buy', () => {
  it('buys a cosmetic', () => {
    const { save, result } = buy(withCoins(500), 'ball:star')
    expect(result).toBe('ok')
    expect(save.coins).toBe(500 - CATALOG.find((i) => i.id === 'ball:star')!.price)
    expect(save.owned).toContain('ball:star')
  })

  it('does not charge twice for an owned cosmetic', () => {
    const once = buy(withCoins(500), 'ball:star').save
    const again = buy(once, 'ball:star')
    expect(again.result).toBe('owned')
    expect(again.save.coins).toBe(once.coins)
  })

  it('refuses when the wallet is short', () => {
    const start = withCoins(10)
    const { save, result } = buy(start, 'arena:neon')
    expect(result).toBe('poor')
    expect(save).toEqual(start)
  })

  it('stacks helpers', () => {
    let save = withCoins(1000)
    save = buy(save, 'helper:revive').save
    save = buy(save, 'helper:revive').save
    expect(save.helpers.revive).toBe(2)
  })

  it('rejects unknown items', () => {
    expect(buy(withCoins(1000), 'ball:nope').result).toBe('unknown')
  })
})

describe('equip', () => {
  it('equips owned cosmetics only', () => {
    const save = buy(withCoins(1000), 'trail:sparkle').save
    expect(equip(save, 'trail:sparkle').equipped.trail).toBe('trail:sparkle')
    expect(equip(save, 'trail:rainbow').equipped.trail).toBe('trail:none')
    expect(equip(save, 'helper:revive')).toEqual(save)
  })
})
