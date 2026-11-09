import { describe, expect, it } from 'vitest'
import type { Dictionary } from './core/i18n'
import { untranslatedText } from './core/i18n-scan'

// Every non-test source file that can put text on screen, engine, games and launcher.
const sources = import.meta.glob<string>(
  [
    './**/*.ts',
    '../games/**/*.ts',
    '../launcher/**/*.ts',
    '!./**/*.test.ts',
    '!../games/**/*.test.ts',
    '!../launcher/**/*.test.ts',
  ],
  { eager: true, query: '?raw', import: 'default' },
)

// Every Vietnamese dictionary. In a data file (one that doesn't use a
// translator), a literal that is one of their keys is data, e.g. a hero title in
// a table, translated where it is shown; the module's own i18n test checks that.
const dictionaries = import.meta.glob<Dictionary>(
  ['./**/i18n.ts', '!./core/i18n.ts', '../games/*/i18n.ts', '../launcher/i18n.ts'],
  { eager: true, import: 'VI' },
)
const keys = Object.values(dictionaries).flatMap((vi) => Object.keys(vi))

/** Text that reads the same in every language. */
const SAME_EVERYWHERE = [
  // Names: the site, the games, and each language in its own language.
  'Play Forge',
  '${opts.title} · Play Forge',
  'Brickstorm · Play Forge',
  'Brickstorm',
  'Caro',
  'Fuse',
  'Phantom Drift',
  'Snake',
  'Synthstride',
  'English',
  'Tiếng Việt',
  // Keyboard keys and units, printed on keycaps / after numbers.
  'SPACE',
  'BPM',
  '${ms} ms',
]
const ALLOW = new Set(SAME_EVERYWHERE)
const ALLOW_IN_DATA = new Set([...keys, ...SAME_EVERYWHERE])
const usesTranslator = (src: string) => /from '[^']*i18n'/.test(src)

describe('Untranslated text', () => {
  it('scans the sources and dictionaries', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(50)
    expect(Object.keys(dictionaries).length).toBeGreaterThan(7)
  })

  it('sends every English string on screen through a translator', () => {
    const found = Object.entries(sources).flatMap(([file, src]) =>
      untranslatedText(src, usesTranslator(src) ? ALLOW : ALLOW_IN_DATA).map((text) => `${file}: ${text}`),
    )
    expect(found).toEqual([])
  })
})

describe('numbers on screen', () => {
  it('use formatNumber (1.000 in Vietnamese), not toLocaleString (the browser locale)', () => {
    const offenders = Object.entries(sources)
      .filter(([, src]) => /\.toLocaleString\(\s*\)/.test(src))
      .map(([file]) => file)
    expect(offenders).toEqual([])
  })
})
