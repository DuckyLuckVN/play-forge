import { afterEach, describe, expect, it } from 'vitest'
import { markGuideSeen, resetGuideMemory } from '../guide'
import { shouldAutoOpen, shouldMarkSeen } from './first-play'

const memStore = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}
const brokenStore = {
  getItem: (): string | null => {
    throw new Error('blocked')
  },
  setItem: (): void => {
    throw new Error('blocked')
  },
}

afterEach(() => resetGuideMemory())

describe('shouldMarkSeen', () => {
  it('finished or skipped marks seen; dismissed by code does not', () => {
    expect(shouldMarkSeen('done')).toBe(true)
    expect(shouldMarkSeen('skipped')).toBe(true)
    expect(shouldMarkSeen('dismissed')).toBe(false)
  })
})

describe('shouldAutoOpen', () => {
  it('never opens without help to show', () => {
    expect(shouldAutoOpen('g', false, memStore())).toBe(false)
  })

  it('opens on fresh storage, not after it is marked seen', () => {
    const store = memStore()
    expect(shouldAutoOpen('g', true, store)).toBe(true)
    markGuideSeen('g', store)
    expect(shouldAutoOpen('g', true, store)).toBe(false)
  })

  it('storage that throws: opens once per page (in-memory fallback)', () => {
    expect(shouldAutoOpen('g', true, brokenStore)).toBe(true)
    markGuideSeen('g', brokenStore)
    expect(shouldAutoOpen('g', true, brokenStore)).toBe(false)
  })
})
