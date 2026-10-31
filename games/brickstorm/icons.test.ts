import { describe, expect, it } from 'vitest'
import { BOOST_ICONS } from './icons'
import { BOOSTS, isSynergy } from './sim/boosts'
import { empty } from './sim/testing'
import type { BoostId } from './sim/types'

describe('boost icons', () => {
  it('has a 56px SVG thumbnail for every boost', () => {
    for (const id of Object.keys(BOOSTS) as BoostId[]) {
      expect(BOOST_ICONS[id], id).toMatch(/^<svg[^>]*viewBox="0 0 56 56"/)
    }
  })
})

describe('isSynergy', () => {
  it('lights up when a partner is owned', () => {
    const s = empty()
    expect(isSynergy(s, 'fireball')).toBe(false)
    s.boosts = { aftershock: 1 }
    expect(isSynergy(s, 'fireball')).toBe(true)
  })
})
