import { describe, expect, it } from 'vitest'
import {
  bankRun,
  canBank,
  clearRun,
  DEFAULT_SAVE,
  loadSave,
  recordRun,
  RESET_BACKUP_KEY,
  resetSave,
  undoReset,
  SAVE_KEY,
  SIM_VERSION,
  spend,
  walletTotal,
  writeSave,
  type Save,
} from './save'
import { xpToNext } from './sim/boosts'
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
    save.run!.simVersion = 3
    storage.setItem(SAVE_KEY, JSON.stringify(save))
    const loaded = loadSave(storage)
    expect(loaded.droppedRun).toBe(true)
    expect(loaded.save.run).toBeNull()
    expect(loaded.save.coins).toBe(70)
  })

  it('keeps a v4 run, carrying its XP bar over to the new XP scale', () => {
    const storage = memoryStorage()
    const save = bankRun(fresh(), createRun(1), 0).save
    save.run!.simVersion = 4
    save.run!.state.level = 2
    save.run!.state.xp = 10 // old scale: 10 of 20 to the next level
    storage.setItem(SAVE_KEY, JSON.stringify(save))
    const loaded = loadSave(storage)
    expect(loaded.droppedRun).toBe(false)
    expect(loaded.save.run!.simVersion).toBe(SIM_VERSION)
    expect(loaded.save.run!.state.level).toBe(2)
    expect(loaded.save.run!.state.xp / xpToNext(2)).toBeCloseTo(0.5)
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

describe('soundtracks', () => {
  it('gives older saves the default track, owned and equipped', () => {
    const old = { ...fresh(), owned: ['ball:classic'], equipped: { ball: 'ball:classic' } }
    const storage = new Map([[SAVE_KEY, JSON.stringify(old)]])
    const { save } = loadSave({ getItem: (k: string) => storage.get(k) ?? null } as unknown as Storage)
    expect(save.owned).toContain('music:arcade')
    expect(save.equipped.music).toBe('music:arcade')
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

  it('takes coins the run lost (a boss tax) back out of the wallet, then refunds them once', () => {
    const s = createRun(2)
    s.coins = 100
    let { save, banked } = bankRun({ ...fresh(), coins: 50 }, s, 0)
    expect(save.coins).toBe(150)
    s.coins = 90 // taxed
    expect(walletTotal(save, s, banked)).toBe(140)
    ;({ save, banked } = bankRun(save, s, banked))
    expect(save.coins).toBe(140)
    s.coins = 100 // refunded when the boss falls
    save = bankRun(save, s, banked).save
    expect(save.coins).toBe(150)
  })

  it('never takes the wallet below zero', () => {
    const s = createRun(2)
    s.coins = 10
    const save = { ...fresh(), coins: 0 }
    expect(walletTotal(save, s, 40)).toBe(0)
    expect(bankRun(save, s, 40).save.coins).toBe(0)
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

describe('fresh start', () => {
  const played = (): Save => ({
    ...structuredClone(DEFAULT_SAVE),
    bestTurn: 80,
    coins: 5000,
    owned: [...DEFAULT_SAVE.owned, 'ball:star'],
    seen: ['brick:bomb'],
  })

  it('erases all progress and keeps a copy of it', () => {
    const storage = memoryStorage()
    writeSave(played(), storage)
    storage.setItem('pf.lang', 'vi')
    const fresh = resetSave(storage)
    expect(fresh).toEqual(DEFAULT_SAVE)
    expect(loadSave(storage).save).toEqual(DEFAULT_SAVE)
    expect(JSON.parse(storage.getItem(RESET_BACKUP_KEY)!).coins).toBe(5000)
    // Preferences are not progress.
    expect(storage.getItem('pf.lang')).toBe('vi')
  })

  it('can be undone, once', () => {
    const storage = memoryStorage()
    writeSave(played(), storage)
    resetSave(storage)
    const back = undoReset(storage)
    expect(back?.coins).toBe(5000)
    expect(loadSave(storage).save.coins).toBe(5000)
    expect(undoReset(storage)).toBeNull()
  })

  it('works with nothing saved yet', () => {
    const storage = memoryStorage()
    expect(resetSave(storage)).toEqual(DEFAULT_SAVE)
    expect(undoReset(storage)).toBeNull()
  })
})
