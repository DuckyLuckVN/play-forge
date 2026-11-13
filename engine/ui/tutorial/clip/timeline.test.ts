import { describe, expect, it } from 'vitest'
import { animation, keyframes, uid } from './timeline'

describe('keyframes', () => {
  const css = keyframes('k', 10, { at: 2, dur: 3 }, 'opacity:1', 'opacity:0')
  it('is one named block', () => {
    expect(css.startsWith('@keyframes k{')).toBe(true)
    expect(css.endsWith('}')).toBe(true)
  })
  it('off until 20%, on to 50%, off by 100%, monotonic', () => {
    const stops = [...css.matchAll(/([\d.,%]+)\{([^}]*)\}/g)].flatMap((m) =>
      m[1].split(',').map((s) => ({ pct: parseFloat(s), style: m[2] })),
    )
    const pcts = stops.map((s) => s.pct)
    expect([...pcts].sort((a, b) => a - b)).toEqual(pcts)
    expect(pcts[0]).toBe(0)
    expect(pcts[pcts.length - 1]).toBe(100)
    const at = (n: number) => stops.find((s) => s.pct === n)?.style
    expect(at(0)).toBe('opacity:0')
    expect(at(20)).toBe('opacity:0')
    expect(at(50)).toBe('opacity:1')
    expect(at(100)).toBe('opacity:0')
    const first = stops.find((s) => s.style === 'opacity:1')!
    expect(first.pct).toBeGreaterThan(20)
    expect(first.pct).toBeLessThan(21)
  })
})

describe('animation', () => {
  it('shorthand', () => expect(animation('k', 12)).toBe('k 12s infinite'))
})

describe('uid', () => {
  it('unique and CSS-safe', () => {
    const a = uid('a')
    const b = uid('a')
    expect(a).not.toBe(b)
    expect(a).toMatch(/^[a-z][\w-]*$/)
    expect(b).toMatch(/^[a-z][\w-]*$/)
  })
})
