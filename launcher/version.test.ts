import { describe, expect, it } from 'vitest'
import { formatUpdated, versionLabel } from './version'

const ISO = '2026-11-11T06:48:26+00:00'

describe('version tag', () => {
  it('shows the version and when it was updated, in the viewer timezone', () => {
    const utc = versionLabel('1.0.300', ISO, 'en', 'UTC')
    expect(utc.startsWith('v1.0.300 · ')).toBe(true)
    expect(utc).toContain('2026')
    expect(utc).toContain('06:48')
    // The same moment in Ho Chi Minh City (UTC+7).
    expect(formatUpdated(ISO, 'en', 'Asia/Ho_Chi_Minh')).toContain('13:48')
  })

  it('formats the date in the page language', () => {
    expect(formatUpdated(ISO, 'en', 'UTC')).toContain('Nov')
    expect(formatUpdated(ISO, 'vi', 'UTC')).not.toContain('Nov')
    expect(formatUpdated(ISO, 'vi', 'UTC')).toContain('2026')
  })

  it('without a known update time, only the version', () => {
    expect(versionLabel('1.0.300', '', 'en')).toBe('v1.0.300')
    expect(versionLabel('1.0.300', 'not a date', 'vi')).toBe('v1.0.300')
  })
})
