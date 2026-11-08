import { describe, expect, it, vi } from 'vitest'
import {
  isFullscreen,
  isFullscreenSupported,
  onFullscreenChange,
  toggleFullscreen,
  type FullscreenDoc,
} from './fullscreen'

type StubDoc = FullscreenDoc & { listeners: Map<string, Set<() => void>> }

function stubDoc(over: Partial<FullscreenDoc> = {}): StubDoc {
  const listeners = new Map<string, Set<() => void>>()
  return {
    listeners,
    documentElement: {},
    addEventListener: (type, fn) => {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(fn)
    },
    removeEventListener: (type, fn) => {
      listeners.get(type)?.delete(fn)
    },
    ...over,
  }
}

const el = {} as Element

describe('isFullscreenSupported', () => {
  it('reads the standard and webkit flags', () => {
    expect(isFullscreenSupported(stubDoc({ fullscreenEnabled: true }))).toBe(true)
    expect(isFullscreenSupported(stubDoc({ webkitFullscreenEnabled: true }))).toBe(true)
  })

  it('is false when neither is enabled (iPhone Safari, blocked iframe)', () => {
    expect(isFullscreenSupported(stubDoc())).toBe(false)
    expect(isFullscreenSupported(stubDoc({ fullscreenEnabled: false }))).toBe(false)
  })
})

describe('isFullscreen', () => {
  it('checks the standard and webkit elements', () => {
    expect(isFullscreen(stubDoc())).toBe(false)
    expect(isFullscreen(stubDoc({ fullscreenElement: null }))).toBe(false)
    expect(isFullscreen(stubDoc({ fullscreenElement: el }))).toBe(true)
    expect(isFullscreen(stubDoc({ webkitFullscreenElement: el }))).toBe(true)
  })
})

describe('toggleFullscreen', () => {
  it('requests fullscreen on the page when not active', async () => {
    const requestFullscreen = vi.fn(() => Promise.resolve())
    await toggleFullscreen(stubDoc({ documentElement: { requestFullscreen } }))
    expect(requestFullscreen).toHaveBeenCalledWith({ navigationUI: 'hide' })
  })

  it('falls back to the webkit request', async () => {
    const webkitRequestFullscreen = vi.fn()
    await toggleFullscreen(stubDoc({ documentElement: { webkitRequestFullscreen } }))
    expect(webkitRequestFullscreen).toHaveBeenCalled()
  })

  it('exits when active, standard first, then webkit', async () => {
    const exitFullscreen = vi.fn(() => Promise.resolve())
    const webkitExitFullscreen = vi.fn()
    await toggleFullscreen(stubDoc({ fullscreenElement: el, exitFullscreen, webkitExitFullscreen }))
    expect(exitFullscreen).toHaveBeenCalled()
    expect(webkitExitFullscreen).not.toHaveBeenCalled()
    await toggleFullscreen(stubDoc({ webkitFullscreenElement: el, webkitExitFullscreen }))
    expect(webkitExitFullscreen).toHaveBeenCalled()
  })

  it('swallows a refusal and a missing API', async () => {
    const requestFullscreen = vi.fn(() => Promise.reject(new TypeError('no gesture')))
    await expect(
      toggleFullscreen(stubDoc({ documentElement: { requestFullscreen } })),
    ).resolves.toBeUndefined()
    await expect(toggleFullscreen(stubDoc())).resolves.toBeUndefined()
  })
})

describe('onFullscreenChange', () => {
  it('listens to both events and unsubscribes cleanly', () => {
    const doc = stubDoc()
    const fn = vi.fn()
    const off = onFullscreenChange(fn, doc)
    for (const type of ['fullscreenchange', 'webkitfullscreenchange']) {
      expect(doc.listeners.get(type)?.has(fn)).toBe(true)
    }
    off()
    for (const set of doc.listeners.values()) expect(set.size).toBe(0)
  })
})
