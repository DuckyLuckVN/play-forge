import { describe, expect, it } from 'vitest'
import { GUIDE } from './guide'
import { VI } from './i18n'
import { ACTIVE_HELPERS } from './panels'
import { CATALOG } from './shop'
import { BOOSTS } from './sim/boosts'

// Every `t('…')` call in the game's source, plus the data tables shown on screen.
const sources = import.meta.glob<string>(['./*.ts', '!./*.test.ts'], {
  eager: true,
  query: '?raw',
  import: 'default',
})
const called = Object.values(sources).flatMap((src) =>
  [...src.matchAll(/\bt\(\s*(['"`])((?:\\.|(?!\1).)*)\1/gs)].map((m) => m[2].replace(/\\(.)/g, '$1')),
)
const tables = [
  ...Object.values(BOOSTS).flatMap((b) => [b.name, b.text]),
  ...CATALOG.flatMap((i) => [i.name, i.text ?? '']),
  ...GUIDE.flatMap((g) => [g.name, g.text]),
  ...ACTIVE_HELPERS.flatMap((a) => [a.name, a.text]),
].filter(Boolean)

describe('Vietnamese', () => {
  it('finds the strings to check', () => {
    expect(called.length).toBeGreaterThan(100)
  })

  it('translates every string on screen', () => {
    const missing = [...new Set([...called, ...tables])].filter((en) => !(en in VI))
    expect(missing).toEqual([])
  })

  it('keeps the same {placeholders} in each translation', () => {
    const marks = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
    for (const [en, vi] of Object.entries(VI)) expect(marks(vi), en).toEqual(marks(en))
  })

  it('has no stale entries', () => {
    const used = new Set([...called, ...tables])
    expect(Object.keys(VI).filter((en) => !used.has(en))).toEqual([])
  })
})
