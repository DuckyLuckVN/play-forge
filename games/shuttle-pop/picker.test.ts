import { afterEach, describe, expect, it, vi } from 'vitest'
import { PRESETS } from './presets'
import { loadPreset, portrait, savePreset } from './picker'

const KEY = 'play-forge:shuttle-pop:preset'

function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('preset storage', () => {
  it('defaults to 0 with nothing stored', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    expect(loadPreset()).toBe(0)
  })

  it('round-trips a saved preset', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    savePreset(2)
    expect(loadPreset()).toBe(2)
  })

  it('returns 0 when storage throws', () => {
    const boom = () => {
      throw new Error('blocked')
    }
    vi.stubGlobal('localStorage', { getItem: boom, setItem: boom })
    expect(() => savePreset(3)).not.toThrow()
    expect(loadPreset()).toBe(0)
  })

  it('keeps every valid saved choice, old 0..3 picks included', () => {
    const store = memoryStorage()
    vi.stubGlobal('localStorage', store)
    for (let n = 0; n < PRESETS.length; n++) {
      store.setItem(KEY, String(n))
      expect(loadPreset()).toBe(n)
    }
  })

  it.each([String(PRESETS.length), '99', '-1', '1.5', 'abc', ''])(
    'returns 0 for an invalid stored value %j',
    (raw) => {
      const store = memoryStorage()
      store.setItem(KEY, raw)
      vi.stubGlobal('localStorage', store)
      expect(loadPreset()).toBe(0)
    },
  )
})

describe('portraits', () => {
  it('every preset gets its own portrait SVG built from its look keys', () => {
    const svgs = PRESETS.map((p) => portrait(p.look))
    for (const s of svgs) {
      expect(s.startsWith('<svg')).toBe(true)
      expect(s).not.toMatch(/undefined|NaN/)
    }
    expect(new Set(svgs).size).toBe(PRESETS.length)
  })
})
