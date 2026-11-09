import { describe, expect, it } from 'vitest'
import { translatedKeys } from '../core/i18n-scan'
import { AVATARS } from './avatars'
import { VI } from './i18n'
import { REACTIONS } from './reactions'

// Every `t('…')` in the social UI, `ts('…')` in the game shell, and the names
// in the avatar and reaction tables (translated where shown).
const sources = import.meta.glob<string>(['./*.ts', '!./*.test.ts'], {
  eager: true,
  query: '?raw',
  import: 'default',
})
const shell = import.meta.glob<string>('../app.ts', { eager: true, query: '?raw', import: 'default' })
const called = [
  ...Object.values(sources).flatMap((src) => translatedKeys(src)),
  ...Object.values(shell).flatMap((src) => translatedKeys(src, 'ts')),
  ...AVATARS.map((a) => a.name),
  ...REACTIONS.map((r) => r.name),
]

describe('Vietnamese (social)', () => {
  it('finds the strings to check', () => {
    expect(called.length).toBeGreaterThan(60)
  })

  it('translates every string on screen', () => {
    expect(called.filter((en) => !(en in VI))).toEqual([])
  })

  it('keeps the same {placeholders}', () => {
    const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
    for (const [en, vi] of Object.entries(VI)) expect(names(vi), en).toEqual(names(en))
  })
})
