import { describe, expect, it, vi } from 'vitest'
import { lockLandscape, needsRotate, unlockLandscape, watchPortrait, type PortraitWindow } from './landscape'

describe('needsRotate', () => {
  it.each([
    { name: 'asks a touch phone held upright to rotate', w: 390, h: 844, coarse: true, rotate: true },
    { name: 'lets a touch phone in landscape play', w: 844, h: 390, coarse: true, rotate: false },
    {
      name: 'never blocks a mouse (a tall desktop window is fine)',
      w: 800,
      h: 1200,
      coarse: false,
      rotate: false,
    },
    { name: 'treats a square touch screen as landscape', w: 700, h: 700, coarse: true, rotate: false },
  ])('$name', ({ w, h, coarse, rotate }) => {
    expect(needsRotate(w, h, coarse)).toBe(rotate)
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

describe('lock bookkeeping + unlockLandscape', () => {
  it('reports a granted lock, so the cleanup knows to release it', async () => {
    const onLocked = vi.fn()
    lockLandscape({ lock: () => Promise.resolve() }, onLocked)
    await Promise.resolve()
    await Promise.resolve()
    expect(onLocked).toHaveBeenCalledTimes(1)
  })

  it('swallows and does not report a refused lock (not fullscreen, desktop, iOS)', async () => {
    const onLocked = vi.fn()
    expect(() =>
      lockLandscape({ lock: () => Promise.reject(new Error('NotSupportedError')) }, onLocked),
    ).not.toThrow()
    await Promise.resolve()
    await Promise.resolve()
    expect(onLocked).not.toHaveBeenCalled()
  })

  it('releases the lock', () => {
    const unlock = vi.fn()
    unlockLandscape({ unlock })
    expect(unlock).toHaveBeenCalledTimes(1)
  })

  it('swallows an unlock that throws, or none at all', () => {
    expect(() =>
      unlockLandscape({
        unlock: () => {
          throw new Error('nope')
        },
      }),
    ).not.toThrow()
    expect(() => unlockLandscape({})).not.toThrow()
    expect(() => unlockLandscape(undefined)).not.toThrow()
  })
})
