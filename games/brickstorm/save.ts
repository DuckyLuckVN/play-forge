// Brickstorm's saved progress, kept in localStorage. Bump `version` and add a
// migration in `parse` when the shape changes.

export const SAVE_KEY = 'play-forge:brickstorm:save'

export interface Save {
  version: 1
  bestTurn: number
  bestCombo: number
}

export const DEFAULT_SAVE: Save = { version: 1, bestTurn: 0, bestCombo: 0 }

function safeLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function parse(raw: string): Save | null {
  try {
    const data = JSON.parse(raw)
    const count = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0
    if (data?.version !== 1 || !count(data.bestTurn) || !count(data.bestCombo)) return null
    return { version: 1, bestTurn: data.bestTurn, bestCombo: data.bestCombo }
  } catch {
    return null
  }
}

/**
 * Reads the save. Unreadable data is copied to a backup key rather than
 * overwritten, and `corrupted` tells the game to warn the player.
 */
export function loadSave(storage: Storage | null = safeLocalStorage()): { save: Save; corrupted: boolean } {
  try {
    const raw = storage ? storage.getItem(SAVE_KEY) : null
    if (raw === null) return { save: { ...DEFAULT_SAVE }, corrupted: false }
    const save = parse(raw)
    if (save) return { save, corrupted: false }
    storage!.setItem(SAVE_KEY + ':backup', raw)
    return { save: { ...DEFAULT_SAVE }, corrupted: true }
  } catch {
    return { save: { ...DEFAULT_SAVE }, corrupted: false }
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
