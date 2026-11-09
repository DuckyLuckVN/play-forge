import { describe, expect, it, vi } from 'vitest'
import { lockLandscape, needsRotate, watchPortrait, type PortraitWindow } from './landscape'

describe('needsRotate', () => {
  it('asks a touch phone held upright to rotate', () => {
    expect(needsRotate(390, 844, true)).toBe(true)
  })

  it('lets a touch phone in landscape play', () => {
    expect(needsRotate(844, 390, true)).toBe(false)
  })

  it('never blocks a mouse (a tall desktop window is fine)', () => {
    expect(needsRotate(800, 1200, false)).toBe(false)
  })

  it('treats a square touch screen as landscape', () => {
    expect(needsRotate(700, 700, true)).toBe(false)
  })
})

type FakeWindow = PortraitWindow & { fire(type: string): void; count(): number }

function fakeWindow(w: number, h: number, coarse = true): FakeWindow {
  const listeners = new Map<string, Set<() => void>>()
  const win: FakeWindow = {
    innerWidth: w,
    innerHeight: h,
    matchMedia: () => ({ matches: coarse }),
    addEventListener: (type: string, fn: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(fn)
    },
    removeEventListener: (type: string, fn: () => void) => {
      listeners.get(type)?.delete(fn)
    },
    fire: (type) => listeners.get(type)?.forEach((fn) => fn()),
    count: () => [...listeners.values()].reduce((n, s) => n + s.size, 0),
  }
  return win
}

describe('watchPortrait', () => {
  it('reports the starting orientation once', () => {
    const fn = vi.fn()
    watchPortrait(fn, fakeWindow(390, 844))
    expect(fn).toHaveBeenCalledExactlyOnceWith(true)
  })

  it('reports rotations on resize / orientationchange, and only real changes', () => {
    const fn = vi.fn()
    const win = fakeWindow(390, 844)
    watchPortrait(fn, win)
    win.fire('resize') // same size: no call
    win.innerWidth = 844
    win.innerHeight = 390
    win.fire('orientationchange')
    win.fire('resize') // same answer again: no call
    expect(fn.mock.calls).toEqual([[true], [false]])
  })

  it('stays landscape for a mouse however the window is shaped', () => {
    const fn = vi.fn()
    const win = fakeWindow(800, 1200, false)
    watchPortrait(fn, win)
    win.innerWidth = 600
    win.fire('resize')
    expect(fn.mock.calls).toEqual([[false]])
  })

  it('removes every listener on stop', () => {
    const fn = vi.fn()
    const win = fakeWindow(390, 844)
    const stop = watchPortrait(fn, win)
    expect(win.count()).toBeGreaterThan(0)
    stop()
    expect(win.count()).toBe(0)
    win.innerWidth = 900
    win.fire('resize')
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('lockLandscape', () => {
  it('asks for landscape', () => {
    const lock = vi.fn(() => Promise.resolve())
    lockLandscape({ lock })
    expect(lock).toHaveBeenCalledWith('landscape')
  })

  it('swallows a rejected lock (not fullscreen, desktop, iOS)', async () => {
    const lock = vi.fn(() => Promise.reject(new Error('NotSupportedError')))
    expect(() => lockLandscape({ lock })).not.toThrow()
    await Promise.resolve()
  })

  it('swallows a lock that throws, or none at all', () => {
    expect(() =>
      lockLandscape({
        lock: () => {
          throw new Error('nope')
        },
      }),
    ).not.toThrow()
    expect(() => lockLandscape({})).not.toThrow()
    expect(() => lockLandscape(undefined)).not.toThrow()
  })
})
