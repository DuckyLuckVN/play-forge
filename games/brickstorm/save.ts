// Brickstorm's saved progress, kept in localStorage. Bump `version` and add a
// migration in `migrate` when the shape changes. Bump SIM_VERSION when
// RunState's shape changes, so old saved runs are dropped instead of loaded.
import type { RunState } from './sim/types'

export const SAVE_KEY = 'play-forge:brickstorm:save'
export const SIM_VERSION = 4

export interface Equipped {
  ball: string
  trail: string
  arena: string
  impact: string
  /** Gameplay soundtrack. */
  music: string
}

export interface Helpers {
  headStart: number
  luckyStart: number
  reroll: number
  revive: number
  pushBack: number
  rowBomb: number
  freeze: number
  firePack: number
  surge: number
}

export interface SavedRun {
  simVersion: number
  /** How many of the run's coins are already in the wallet. */
  banked: number
  state: RunState
}

export interface Save {
  version: 2
  bestTurn: number
  bestCombo: number
  coins: number
  owned: string[]
  equipped: Equipped
  helpers: Helpers
  /** Brick and pickup kinds the player has already been told about. */
  seen: string[]
  run: SavedRun | null
}

export const DEFAULT_SAVE: Save = {
  version: 2,
  bestTurn: 0,
  bestCombo: 0,
  coins: 0,
  owned: ['ball:classic', 'trail:none', 'arena:indigo', 'impact:shards', 'music:arcade'],
  equipped: {
    ball: 'ball:classic',
    trail: 'trail:none',
    arena: 'arena:indigo',
    impact: 'impact:shards',
    music: 'music:arcade',
  },
  helpers: {
    headStart: 0,
    luckyStart: 0,
    reroll: 0,
    revive: 0,
    pushBack: 0,
    rowBomb: 0,
    freeze: 0,
    firePack: 0,
    surge: 0,
  },
  seen: [],
  run: null,
}

const defaults = (): Save => structuredClone(DEFAULT_SAVE)

function safeLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

const count = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

function validRun(run: unknown): run is SavedRun {
  if (!isObject(run) || run.simVersion !== SIM_VERSION || !count(run.banked)) return false
  const s = run.state
  return (
    isObject(s) &&
    ['aim', 'pick', 'grow', 'over', 'volley'].includes(s.phase as string) &&
    Array.isArray(s.bricks) &&
    Array.isArray(s.balls) &&
    Array.isArray(s.pickups) &&
    isObject(s.rng)
  )
}

/** Turns stored data into a v2 save; null if it isn't a save at all. */
function migrate(data: unknown): { save: Save; droppedRun: boolean } | null {
  if (!isObject(data) || !count(data.bestTurn) || !count(data.bestCombo)) return null
  const save = defaults()
  save.bestTurn = data.bestTurn
  save.bestCombo = data.bestCombo
  if (data.version === 1) return { save, droppedRun: false }
  if (data.version !== 2 || !count(data.coins)) return null

  save.coins = data.coins
  if (Array.isArray(data.owned)) {
    save.owned = [...new Set([...save.owned, ...data.owned.filter((x) => typeof x === 'string')])]
  }
  if (isObject(data.equipped)) {
    for (const k of Object.keys(save.equipped) as (keyof Equipped)[]) {
      const v = data.equipped[k]
      if (typeof v === 'string' && save.owned.includes(v)) save.equipped[k] = v
    }
  }
  if (isObject(data.helpers)) {
    for (const k of Object.keys(save.helpers) as (keyof Helpers)[]) {
      const v = data.helpers[k]
      if (count(v)) save.helpers[k] = Math.floor(v)
    }
  }
  if (Array.isArray(data.seen)) save.seen = data.seen.filter((x) => typeof x === 'string')
  const droppedRun = data.run !== null && data.run !== undefined && !validRun(data.run)
  save.run = droppedRun ? null : ((data.run as SavedRun | null) ?? null)
  return { save, droppedRun }
}

/**
 * Reads the save. Unreadable data is copied to a backup key rather than
 * overwritten, and `corrupted` tells the game to warn the player. A saved run
 * that can't be resumed is dropped (`droppedRun`) while the rest is kept.
 */
export function loadSave(storage: Storage | null = safeLocalStorage()): {
  save: Save
  corrupted: boolean
  droppedRun: boolean
} {
  try {
    const raw = storage ? storage.getItem(SAVE_KEY) : null
    if (raw === null) return { save: defaults(), corrupted: false, droppedRun: false }
    let migrated: ReturnType<typeof migrate> = null
    try {
      migrated = migrate(JSON.parse(raw))
    } catch {
      migrated = null
    }
    if (migrated) return { ...migrated, corrupted: false }
    storage!.setItem(SAVE_KEY + ':backup', raw)
    return { save: defaults(), corrupted: true, droppedRun: false }
  } catch {
    return { save: defaults(), corrupted: false, droppedRun: false }
  }
}

export function writeSave(save: Save, storage: Storage | null = safeLocalStorage()): void {
  try {
    storage?.setItem(SAVE_KEY, JSON.stringify(save))
  } catch {
    // Storage full or blocked: progress for this session still lives in memory.
  }
}

export function recordRun(save: Save, turn: number, bestCombo: number): Save {
  return {
    ...save,
    bestTurn: Math.max(save.bestTurn, turn),
    bestCombo: Math.max(save.bestCombo, bestCombo),
  }
}

/**
 * Moves the run's new coins into the wallet and stores a snapshot of the run,
 * in one step, so a coin is never paid twice and never lost.
 */
export function bankRun(save: Save, s: RunState, banked: number): { save: Save; banked: number } {
  const gained = Math.max(0, s.coins - banked)
  return {
    save: {
      ...save,
      coins: save.coins + gained,
      run: { simVersion: SIM_VERSION, banked: s.coins, state: { ...structuredClone(s), events: [] } },
    },
    banked: s.coins,
  }
}

/** Runs are saved only at turn boundaries, never mid-volley or after game over. */
/** Coins the player has right now: the wallet plus this run's coins not banked yet. */
export function walletTotal(save: Save, run: RunState | null, banked: number): number {
  return save.coins + (run ? Math.max(0, run.coins - banked) : 0)
}

export function canBank(phase: RunState['phase']): boolean {
  return phase === 'aim' || phase === 'pick' || phase === 'grow'
}

export function clearRun(save: Save): Save {
  return { ...save, run: null }
}

/** The save with `amount` coins spent, or null if the wallet is short. */
export function spend(save: Save, amount: number): Save | null {
  if (amount < 0 || save.coins < amount) return null
  return { ...save, coins: save.coins - amount }
}
