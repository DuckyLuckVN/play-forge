import { describe, expect, it } from 'vitest'
import { HeroAvatar } from '../hero-avatar'
import { HERO_IDS, type HeroId } from '../sim/heroes'
import { fakeCanvas, installPath2D } from '../test-canvas'
import { BODIES } from './bodies'
import { actx, MOODS } from './bodies/body-fixtures'
import { CREATURE_LOOKS } from './looks'
import type { CreatureLook } from './types'

installPath2D()

// Compile-time check: every hero has a look (a missing one fails `tsc`).
const total: Record<HeroId, CreatureLook> = CREATURE_LOOKS

describe('creature looks', () => {
  it('every hero has a look whose body type exists', () => {
    for (const id of HERO_IDS) {
      expect(total[id], id).toBeDefined()
      expect(BODIES[total[id].body], id).toBeDefined()
    }
  })

  it('every hero draws through the creature path in every mood', () => {
    const hold = { x: 100, y: 740, r: 5 }
    for (const id of HERO_IDS) {
      for (const mood of MOODS) {
        const a = new HeroAvatar(id, () => 0.5)
        a.update(1 / 60, actx({ hold }))
        a.setMood(mood)
        expect(a.mood, `${id} ${mood}`).toBe(mood)
        a.draw(fakeCanvas(), 760)
        expect(a.lastHands, `${id} ${mood}`).not.toBeNull()
      }
    }
  })
})
