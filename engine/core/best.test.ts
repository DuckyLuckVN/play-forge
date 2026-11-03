import { describe, expect, it } from 'vitest'
import { bestScores } from './best'

const memory = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}

describe('bestScores', () => {
  it('keeps the highest score per key, per game', () => {
    const store = memory()
    const a = bestScores('a', store)
    const b = bestScores('b', store)
    expect(a.save(100)).toBe(true)
    expect(a.save(80)).toBe(false)
    expect(a.save(100)).toBe(false)
    expect(a.save(5, 'hard')).toBe(true)
    expect(a.load()).toBe(100)
    expect(a.load('hard')).toBe(5)
    expect(b.load()).toBe(0)
  })

  it('ignores junk and survives blocked storage', () => {
    expect(bestScores('a', { getItem: () => '{oops', setItem: () => {} }).load()).toBe(0)
    expect(bestScores('a', { getItem: () => '{"default":"9"}', setItem: () => {} }).load()).toBe(0)
    const boom = () => {
      throw new Error('blocked')
    }
    const blocked = bestScores('a', { getItem: boom, setItem: boom })
    expect(blocked.load()).toBe(0)
    expect(blocked.save(10)).toBe(true)
  })
})
