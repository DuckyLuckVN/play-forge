// The ghosts you can play: a look and one small perk each, unlocked by your
// best score. Pure data and rules; the picker lives in picker.ts, the look in
// ghost2d.ts (drawn the same in the picker, the 2D rift and the 3D rift).

import { BASE_PERKS, type Perks } from './sim'

export type CharacterId = 'wisp' | 'ember' | 'frost' | 'bloom' | 'shade' | 'gold'
export type Accessory = 'none' | 'horns' | 'crown' | 'flower' | 'hood' | 'halo'

export interface CharacterColors {
  /** Body colour, inside. */
  core: string
  /** Glowing rim and the ghost's light. */
  rim: string
  eye: string
  blush: string
  /** Ribbon trail and afterimages. */
  trail: string
  /** Accessory colour. */
  accent: string
}

export interface Character {
  id: CharacterId
  /** English; translated with `t()` where shown (all listed in i18n.ts). */
  name: string
  /** One line: the perk's name and what it does. */
  perk: string
  colors: CharacterColors
  accessory: Accessory
  /** Best score that unlocks it (0 = free). */
  unlock: number
  /** What the perk changes; everything else is {@link BASE_PERKS}. */
  perks: Partial<Perks>
}

export const CHARACTERS: readonly Character[] = [
  {
    id: 'wisp',
    name: 'Wisp',
    perk: 'Balanced: no perk, pure skill',
    colors: {
      core: '#6f97b0',
      rim: '#5ff3ff',
      eye: '#1b1240',
      blush: '#ff8fc8',
      trail: '#5ff3ff',
      accent: '#5ff3ff',
    },
    accessory: 'none',
    unlock: 0,
    perks: {},
  },
  {
    id: 'ember',
    name: 'Ember',
    perk: 'Hot streak: combo climbs every 4, not 5',
    colors: {
      core: '#b8562a',
      rim: '#ffb347',
      eye: '#2a0d06',
      blush: '#ff5a3c',
      trail: '#ff8a3d',
      accent: '#e8452c',
    },
    accessory: 'horns',
    unlock: 0,
    perks: { comboStep: 4 },
  },
  {
    id: 'frost',
    name: 'Frost',
    perk: 'Cool head: Phantom lasts 2.5 s, not 2 s',
    colors: {
      core: '#5a88c8',
      rim: '#bfe9ff',
      eye: '#0d1a3a',
      blush: '#9fd8ff',
      trail: '#9fe3ff',
      accent: '#e6f8ff',
    },
    accessory: 'crown',
    unlock: 1000,
    perks: { phantomTicks: 150 },
  },
  {
    id: 'bloom',
    name: 'Bloom',
    perk: 'Regrowth: hearts regrow in 36 s, not 45 s',
    colors: {
      core: '#b56a98',
      rim: '#ffa8d9',
      eye: '#3a0d2a',
      blush: '#ff6fae',
      trail: '#ff9ccf',
      accent: '#fff07a',
    },
    accessory: 'flower',
    unlock: 3000,
    perks: { regenTicks: 36 * 60 },
  },
  {
    id: 'shade',
    name: 'Shade',
    perk: 'Close call: near misses come easier',
    colors: {
      core: '#3d2a6e',
      rim: '#a77bff',
      eye: '#e9dcff',
      blush: '#7a4dff',
      trail: '#8f5cff',
      accent: '#24164a',
    },
    accessory: 'hood',
    unlock: 8000,
    perks: { nearWindow: 11 },
  },
  {
    id: 'gold',
    name: 'Gold',
    perk: 'Gold rush: wisps worth 12, Phantom needs 12',
    colors: {
      core: '#a88a2c',
      rim: '#ffe27a',
      eye: '#2a1d04',
      blush: '#ffb36b',
      trail: '#ffd84d',
      accent: '#fff3b0',
    },
    accessory: 'halo',
    unlock: 20000,
    perks: { wispPoints: 12, phantomCost: 12 },
  },
]

export const DEFAULT_CHARACTER: Character = CHARACTERS[0]

export function characterById(id: unknown): Character | undefined {
  return CHARACTERS.find((c) => c.id === id)
}

/** The full sim tuning for a character. */
export function perksOf(c: Character): Perks {
  return { ...BASE_PERKS, ...c.perks }
}

export const isUnlocked = (c: Character, best: number) => best >= c.unlock

/** Characters a new best of `after` unlocks that `before` had not. */
export function newlyUnlocked(before: number, after: number): Character[] {
  return CHARACTERS.filter((c) => c.unlock > before && c.unlock <= after)
}

/**
 * Unlocks reached during a run, each reported once (for a banner the moment
 * the score crosses one). `best` is the stored best when the run started.
 */
export class UnlockWatch {
  /** Everything unlocked this run so far. */
  readonly unlocked: Character[] = []

  constructor(private best: number) {}

  /** New run: forget, and count from this best. */
  reset(best: number): void {
    this.best = best
    this.unlocked.length = 0
  }

  /** Characters the score unlocked just now. */
  update(score: number): Character[] {
    const fresh = newlyUnlocked(this.best, score).filter((c) => !this.unlocked.includes(c))
    this.unlocked.push(...fresh)
    return fresh
  }
}

type Store = Pick<Storage, 'getItem' | 'setItem'>
const NONE: Store = { getItem: () => null, setItem: () => {} }
function local(): Store {
  try {
    return globalThis.localStorage ?? NONE
  } catch {
    return NONE
  }
}

export const CHARACTER_KEY = 'play-forge:phantom-drift:character'

/** The chosen character, kept in this browser. A locked or unknown pick falls back to Wisp. */
export function characterStore(store: Store = local()) {
  return {
    load(best: number): Character {
      let id: string | null = null
      try {
        id = store.getItem(CHARACTER_KEY)
      } catch {
        // storage blocked: the default ghost
      }
      const c = characterById(id)
      return c && isUnlocked(c, best) ? c : DEFAULT_CHARACTER
    },
    save(c: Character): void {
      try {
        store.setItem(CHARACTER_KEY, c.id)
      } catch {
        // storage full or blocked: the pick lasts this page only
      }
    },
  }
}
