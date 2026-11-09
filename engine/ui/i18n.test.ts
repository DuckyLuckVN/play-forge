import { describe, expect, it } from 'vitest'
import { translatedKeys } from '../core/i18n-scan'
import { VI } from './i18n'

// Every `t('…')` in the game shell and the shared UI.
const sources = import.meta.glob<string>(['../app.ts', './*.ts', '!./*.test.ts'], {
  eager: true,
  query: '?raw',
  import: 'default',
})
const called = Object.values(sources).flatMap((src) => translatedKeys(src))

describe('Vietnamese (game shell and shared UI)', () => {
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

  it('has no unused entries', () => {
    expect(Object.keys(VI).filter((en) => !called.includes(en))).toEqual([])
  })
})
