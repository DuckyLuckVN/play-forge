import { describe, expect, it } from 'vitest'
import { DEFAULT_SAVE, loadSave, recordRun, SAVE_KEY, writeSave } from './save'

function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, String(v)),
    removeItem: (k) => void data.delete(k),
  }
}

describe('save', () => {
  it('round-trips', () => {
    const storage = memoryStorage()
    const save = { version: 1 as const, bestTurn: 12, bestCombo: 40 }
    writeSave(save, storage)
    expect(loadSave(storage)).toEqual({ save, corrupted: false })
  })

  it('starts from defaults when nothing is saved', () => {
    expect(loadSave(memoryStorage())).toEqual({ save: DEFAULT_SAVE, corrupted: false })
  })

  it('backs up corrupt data instead of losing it', () => {
    const storage = memoryStorage()
    storage.setItem(SAVE_KEY, '{oops')
    expect(loadSave(storage)).toEqual({ save: DEFAULT_SAVE, corrupted: true })
    expect(storage.getItem(SAVE_KEY + ':backup')).toBe('{oops')
  })

  it('treats a wrong shape as corrupt', () => {
    const storage = memoryStorage()
    storage.setItem(SAVE_KEY, '{"version":1,"bestTurn":"lots"}')
    expect(loadSave(storage).corrupted).toBe(true)
  })

  it('falls back when storage throws', () => {
    const broken = {
      getItem() {
        throw new Error('blocked')
      },
      setItem() {
        throw new Error('blocked')
      },
    } as unknown as Storage
    expect(loadSave(broken)).toEqual({ save: DEFAULT_SAVE, corrupted: false })
    expect(() => writeSave(DEFAULT_SAVE, broken)).not.toThrow()
  })

  it('works with no storage at all', () => {
    expect(loadSave(null).save).toEqual(DEFAULT_SAVE)
  })

  it('records only new bests', () => {
    const save = { version: 1 as const, bestTurn: 10, bestCombo: 50 }
    expect(recordRun(save, 8, 70)).toEqual({ version: 1, bestTurn: 10, bestCombo: 70 })
  })
})
