import { describe, expect, it, vi } from 'vitest'
import { AutoRepeat, REPEAT_DELAY, REPEAT_EVERY } from './input'

describe('AutoRepeat', () => {
  it('fires on press, repeats after a delay, stops on release', () => {
    vi.useFakeTimers()
    const fired: string[] = []
    const r = new AutoRepeat<'left'>((k) => fired.push(k))
    r.press('left')
    r.press('left') // already held: no double step
    expect(fired).toHaveLength(1)
    vi.advanceTimersByTime(REPEAT_DELAY - 1)
    expect(fired).toHaveLength(1)
    vi.advanceTimersByTime(1 + REPEAT_EVERY * 3)
    expect(fired).toHaveLength(5)
    r.release('left')
    vi.advanceTimersByTime(1000)
    expect(fired).toHaveLength(5)
    expect(r.isHeld('left')).toBe(false)
    vi.useRealTimers()
  })

  it('releaseAll lets go of everything', () => {
    vi.useFakeTimers()
    let n = 0
    const r = new AutoRepeat<'a' | 'b'>(() => n++)
    r.press('a')
    r.press('b')
    r.releaseAll()
    vi.advanceTimersByTime(1000)
    expect(n).toBe(2)
    vi.useRealTimers()
  })
})
