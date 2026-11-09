import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadPreset, savePreset } from './picker'

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

  it.each(['7', '-1', '1.5', 'abc', ''])('returns 0 for an invalid stored value %j', (raw) => {
    const store = memoryStorage()
    store.setItem(KEY, raw)
    vi.stubGlobal('localStorage', store)
    expect(loadPreset()).toBe(0)
  })
})
