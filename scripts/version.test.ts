import { describe, expect, it } from 'vitest'
import { formatVersion } from './version.mjs'

describe('formatVersion', () => {
  it('uses MAJOR.MINOR from package.json and the commit count as the patch', () => {
    expect(formatVersion('1.0.0', 175, false)).toBe('1.0.175')
    expect(formatVersion('2.3.9', 4, false)).toBe('2.3.4')
  })

  it('marks dev-server builds', () => {
    expect(formatVersion('1.0.0', 175, true)).toBe('1.0.175-dev')
  })

  it('without git history, falls back to the package version as is', () => {
    expect(formatVersion('1.2.0', null, false)).toBe('1.2.0')
    expect(formatVersion('1.2.0', null, true)).toBe('1.2.0-dev')
  })
})
