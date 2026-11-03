import { describe, expect, it } from 'vitest'
import { bestKey, loadBest, saveBest } from './best'

const memory = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}

describe('best scores', () => {
  it('keeps the highest score per setup', () => {
    const s = memory()
    expect(saveBest(bestKey(5, true), 100, s)).toBe(true)
    expect(saveBest(bestKey(5, true), 80, s)).toBe(false)
    expect(saveBest(bestKey(5, true), 100, s)).toBe(false)
    expect(saveBest(bestKey(4, true), 10, s)).toBe(true)
    expect(loadBest('5r', s)).toBe(100)
    expect(loadBest('5', s)).toBe(0)
  })

  it('survives broken or blocked storage', () => {
    const junk = { getItem: () => '{oops', setItem: () => {} }
    expect(loadBest('5r', junk)).toBe(0)
    const blocked = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(loadBest('5r', blocked)).toBe(0)
    expect(saveBest('5r', 5, blocked)).toBe(true)
  })
})
