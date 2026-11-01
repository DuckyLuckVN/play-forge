import { describe, expect, it } from 'vitest'
import {
  bankRun,
  canBank,
  clearRun,
  DEFAULT_SAVE,
  loadSave,
  recordRun,
  SAVE_KEY,
  SIM_VERSION,
  spend,
  walletTotal,
  writeSave,
  type Save,
} from './save'
import { createRun } from './sim/run'

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

const fresh = (): Save => structuredClone(DEFAULT_SAVE)

describe('save', () => {
  it('round-trips, including a run', () => {
    const storage = memoryStorage()
    const save = { ...fresh(), bestTurn: 12, coins: 90 }
    const banked = bankRun(save, createRun(4), 0).save
    writeSave(banked, storage)
    expect(loadSave(storage)).toEqual({ save: banked, corrupted: false, droppedRun: false })
  })

  it('starts from defaults when nothing is saved', () => {
    expect(loadSave(memoryStorage())).toEqual({ save: DEFAULT_SAVE, corrupted: false, droppedRun: false })
  })

  it('migrates a v1 save', () => {
    const storage = memoryStorage()
    storage.setItem(SAVE_KEY, JSON.stringify({ version: 1, bestTurn: 12, bestCombo: 40 }))
    const { save, corrupted } = loadSave(storage)
    expect(corrupted).toBe(false)
    expect(save).toEqual({ ...DEFAULT_SAVE, bestTurn: 12, bestCombo: 40 })
  })

  it('adds new helper kinds and seen hints to an older v2 save', () => {
    const storage = memoryStorage()
    storage.setItem(
      SAVE_KEY,
      JSON.stringify({
        ...DEFAULT_SAVE,
        coins: 5,
        helpers: { headStart: 1, luckyStart: 0, reroll: 2, revive: 0 },
        seen: undefined,
      }),
    )
    const { save } = loadSave(storage)
    expect(save.helpers).toEqual({ ...DEFAULT_SAVE.helpers, headStart: 1, reroll: 2 })
    expect(save.helpers.pushBack).toBe(0)
    expect(save.seen).toEqual([])
  })

  it('backs up corrupt data instead of losing it', () => {
    const storage = memoryStorage()
    storage.setItem(SAVE_KEY, '{oops')
    expect(loadSave(storage)).toEqual({ save: DEFAULT_SAVE, corrupted: true, droppedRun: false })
    expect(storage.getItem(SAVE_KEY + ':backup')).toBe('{oops')
  })

  it('treats a wrong shape as corrupt', () => {
    const storage = memoryStorage()
    storage.setItem(SAVE_KEY, '{"version":2,"bestTurn":"lots"}')
    expect(loadSave(storage).corrupted).toBe(true)
  })

  it('drops a run from another sim version but keeps the wallet', () => {
    const storage = memoryStorage()
    const save = bankRun({ ...fresh(), coins: 70 }, createRun(1), 0).save
    save.run!.simVersion = SIM_VERSION - 1
    storage.setItem(SAVE_KEY, JSON.stringify(save))
    const loaded = loadSave(storage)
    expect(loaded.droppedRun).toBe(true)
    expect(loaded.save.run).toBeNull()
    expect(loaded.save.coins).toBe(70)
  })

  it('drops a malformed run but keeps the wallet', () => {
    const storage = memoryStorage()
    const save = { ...fresh(), coins: 33, run: { simVersion: SIM_VERSION, banked: 0, state: 'nope' } }
    storage.setItem(SAVE_KEY, JSON.stringify(save))
    const loaded = loadSave(storage)
    expect(loaded).toMatchObject({ corrupted: false, droppedRun: true })
    expect(loaded.save.coins).toBe(33)
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
    expect(loadSave(broken).save).toEqual(DEFAULT_SAVE)
    expect(() => writeSave(DEFAULT_SAVE, broken)).not.toThrow()
  })

  it('works with no storage at all', () => {
    expect(loadSave(null).save).toEqual(DEFAULT_SAVE)
  })

  it('records only new bests', () => {
    const save = { ...fresh(), bestTurn: 10, bestCombo: 50 }
    expect(recordRun(save, 8, 70)).toMatchObject({ bestTurn: 10, bestCombo: 70 })
  })
})

describe('wallet', () => {
  it('counts coins earned this run that are not banked yet', () => {
    const save = { ...fresh(), coins: 100 }
    const s = createRun(2)
    s.coins = 30
    expect(walletTotal(save, null, 0)).toBe(100)
    expect(walletTotal(save, s, 0)).toBe(130)
    expect(walletTotal(save, s, 30)).toBe(100)
  })

  it('banks only coins not banked before', () => {
    const s = createRun(2)
    s.coins = 30
    const first = bankRun(fresh(), s, 0)
    expect(first.save.coins).toBe(30)
    expect(first.banked).toBe(30)
    s.coins = 45
    const save = bankRun(first.save, s, first.banked).save
    expect(save.coins).toBe(45)
    expect(save.run).toMatchObject({ simVersion: SIM_VERSION, banked: 45 })
  })

  it('stores a copy of the run, not a live reference', () => {
    const s = createRun(2)
    const { save } = bankRun(fresh(), s, 0)
    s.turn = 99
    expect(save.run!.state.turn).toBe(1)
  })

  it('clears the run', () => {
    expect(clearRun(bankRun(fresh(), createRun(1), 0).save).run).toBeNull()
  })

  it('refuses to overdraw', () => {
    expect(spend({ ...fresh(), coins: 10 }, 11)).toBeNull()
    expect(spend({ ...fresh(), coins: 10 }, 10)!.coins).toBe(0)
  })

  it('banks at every turn boundary, including the grow choice', () => {
    expect(['aim', 'pick', 'grow', 'volley', 'over'].map((phase) => canBank(phase as never))).toEqual([
      true,
      true,
      true,
      false,
      false,
    ])
  })
})
