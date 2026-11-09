import { describe, expect, it } from 'vitest'
import {
  CHARACTER_KEY,
  CHARACTERS,
  characterStore,
  DEFAULT_CHARACTER,
  isUnlocked,
  newlyUnlocked,
  perksOf,
  UnlockWatch,
} from './characters'
import { VI } from './i18n'
import { BASE_PERKS } from './sim'

function memory(init: Record<string, string> = {}) {
  const data = { ...init }
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => void (data[k] = v),
  }
}

describe('Phantom Drift characters', () => {
  it('has six with unique ids, Wisp first and free', () => {
    expect(CHARACTERS).toHaveLength(6)
    expect(new Set(CHARACTERS.map((c) => c.id)).size).toBe(6)
    expect(DEFAULT_CHARACTER.id).toBe('wisp')
    expect(DEFAULT_CHARACTER.unlock).toBe(0)
  })

  it('unlock scores only climb', () => {
    const scores = CHARACTERS.map((c) => c.unlock)
    expect(scores).toEqual([...scores].sort((a, b) => a - b))
  })

  it('Wisp plays exactly like the plain ghost', () => {
    expect(perksOf(DEFAULT_CHARACTER)).toEqual(BASE_PERKS)
  })

  it('every other perk changes only its own tuning', () => {
    const changed = (id: string) => {
      const p = perksOf(CHARACTERS.find((c) => c.id === id)!)
      return Object.keys(p).filter((k) => p[k as keyof typeof p] !== BASE_PERKS[k as keyof typeof p])
    }
    expect(changed('ember')).toEqual(['comboStep'])
    expect(changed('frost')).toEqual(['phantomTicks'])
    expect(changed('bloom')).toEqual(['regenTicks'])
    expect(changed('shade')).toEqual(['nearWindow'])
    expect(changed('gold').sort()).toEqual(['phantomCost', 'wispPoints'])
  })

  it('unlocks by best score', () => {
    const frost = CHARACTERS.find((c) => c.id === 'frost')!
    expect(isUnlocked(frost, frost.unlock - 1)).toBe(false)
    expect(isUnlocked(frost, frost.unlock)).toBe(true)
    expect(newlyUnlocked(0, frost.unlock).map((c) => c.id)).toEqual(['frost'])
    expect(newlyUnlocked(frost.unlock, frost.unlock + 1)).toEqual([])
    expect(newlyUnlocked(0, Infinity).map((c) => c.id)).toEqual(['frost', 'bloom', 'shade', 'gold'])
  })

  it('remembers the pick; a locked or unknown one falls back to Wisp', () => {
    const store = memory()
    const chars = characterStore(store)
    expect(chars.load(0).id).toBe('wisp')
    chars.save(CHARACTERS.find((c) => c.id === 'gold')!)
    expect(store.data[CHARACTER_KEY]).toBe('gold')
    expect(chars.load(0).id).toBe('wisp')
    expect(chars.load(1e9).id).toBe('gold')
    expect(characterStore(memory({ [CHARACTER_KEY]: 'nope' })).load(1e9).id).toBe('wisp')
  })

  it('survives blocked storage', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    const chars = characterStore(broken)
    expect(chars.load(1e9).id).toBe('wisp')
    expect(() => chars.save(CHARACTERS[1])).not.toThrow()
  })

  it('has Vietnamese for every name and perk', () => {
    for (const c of CHARACTERS) {
      expect(VI[c.name], c.name).toBeTruthy()
      expect(VI[c.perk], c.perk).toBeTruthy()
    }
  })

  it('uses valid #rrggbb colours', () => {
    for (const c of CHARACTERS)
      for (const [k, v] of Object.entries(c.colors)) expect(v, `${c.id}.${k}`).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('reports each unlock once, the moment the score crosses it', () => {
    const [, , frost, bloom] = CHARACTERS
    const watch = new UnlockWatch(0)
    expect(watch.update(frost.unlock - 1)).toEqual([])
    expect(watch.update(frost.unlock)).toEqual([frost])
    expect(watch.update(frost.unlock + 5)).toEqual([])
    expect(watch.update(bloom.unlock)).toEqual([bloom])
    expect(watch.unlocked).toEqual([frost, bloom])
    watch.reset(bloom.unlock)
    expect(watch.unlocked).toEqual([])
    expect(watch.update(bloom.unlock + 1)).toEqual([])
  })
})
