import { describe, expect, it } from 'vitest'
import { translatedKeys } from '@forge/core/i18n-scan'
import games from '../games/games.json'
import { BACKDROP_NAMES } from './backdrop-menu'
import { VI } from './i18n'

const main = import.meta.glob<string>('./main.ts', { eager: true, query: '?raw', import: 'default' })
const menus = import.meta.glob<string>('./*-menu.ts', { eager: true, query: '?raw', import: 'default' })
const covers = import.meta.glob<string>('../games/*/cover.svg', {
  eager: true,
  query: '?raw',
  import: 'default',
})

// `t('…')` in the launcher, plus the text it translates from data: the game
// descriptions, the "how it works" steps, the background names and the cover art descriptions.
const steps = [...Object.values(main)[0].matchAll(/\[\s*'([^']+)',\s*'([^']+)'\s*\]/g)].flatMap((m) => [
  m[1],
  m[2],
])
const called = [
  ...[...Object.values(main), ...Object.values(menus)].flatMap((src) => translatedKeys(src)),
  ...Object.values(BACKDROP_NAMES),
  ...games.map((g) => g.description),
  ...steps,
  ...Object.values(covers).flatMap((svg) => [...svg.matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1])),
]

describe('Vietnamese (launcher)', () => {
  it('finds the strings to check', () => {
    expect(steps).toHaveLength(6)
    expect(called.length).toBeGreaterThan(15)
  })

  it('translates every string on screen', () => {
    expect(called.filter((en) => !(en in VI))).toEqual([])
  })

  it('keeps the same {placeholders}', () => {
    const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
    for (const [en, vi] of Object.entries(VI)) expect(names(vi), en).toEqual(names(en))
  })

  it('has no unused entries', () => {
    expect(Object.keys(VI).filter((en) => !called.includes(en))).toEqual([])
  })
})
