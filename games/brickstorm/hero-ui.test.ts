import { describe, expect, it } from 'vitest'
import { equippedHero, perkText } from './hero-ui'
import { DEFAULT_SAVE, type Save } from './save'

const save = (patch: Partial<Save>): Save => ({ ...structuredClone(DEFAULT_SAVE), ...patch })

describe('hero ui', () => {
  it('uses the equipped hero only if it is owned and known; otherwise the Rookie', () => {
    expect(equippedHero(save({}))).toBe('rookie')
    const owned = [...DEFAULT_SAVE.owned, 'hero:knight']
    expect(equippedHero(save({ owned, equipped: { ...DEFAULT_SAVE.equipped, hero: 'hero:knight' } }))).toBe(
      'knight',
    )
    expect(equippedHero(save({ equipped: { ...DEFAULT_SAVE.equipped, hero: 'hero:knight' } }))).toBe('rookie')
    expect(equippedHero(save({ owned, equipped: { ...DEFAULT_SAVE.equipped, hero: 'hero:nope' } }))).toBe(
      'rookie',
    )
  })

  it('names a free skill by its skill name', () => {
    expect(
      perkText({ text: 'Starts with skill {skill} Lv {n}', vars: { skill: 'fireball', n: 2 }, good: true }),
    ).toBe('Starts with skill Fireball Lv 2')
  })
})
