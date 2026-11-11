import { describe, expect, it } from 'vitest'
import { formatUpdated, versionLabel } from './version'

const ISO = '2026-11-11T06:48:26+00:00'

describe('version tag', () => {
  it('shows the version and when it was updated as dd/MM/yyyy, HH:mm', () => {
    expect(versionLabel('1.0.300', ISO, 'UTC')).toBe('v1.0.300 · 11/11/2026, 06:48')
  })

  it('in the viewer timezone, 24-hour, zero-padded', () => {
    // Ho Chi Minh City is UTC+7.
    expect(formatUpdated(ISO, 'Asia/Ho_Chi_Minh')).toBe('11/11/2026, 13:48')
    expect(formatUpdated('2026-03-05T21:07:00Z', 'Asia/Ho_Chi_Minh')).toBe('06/03/2026, 04:07')
    expect(formatUpdated('2026-01-02T00:05:00Z', 'UTC')).toBe('02/01/2026, 00:05')
  })

  it('without a known update time, only the version', () => {
    expect(versionLabel('1.0.300', '')).toBe('v1.0.300')
    expect(versionLabel('1.0.300', 'not a date')).toBe('v1.0.300')
  })
})
