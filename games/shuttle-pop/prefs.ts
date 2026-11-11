// Personal Shuttle Pop prefs, kept in this browser only (never sent to the room).
// Storage can be missing, blocked or corrupt: then defaults apply and the
// setting simply lasts for the page.
// Schema grows by optional fields only; a missing / invalid field falls back to its default.
import { t } from './i18n'
import { DEFAULT_PATH, DEFAULT_RING, RING_MODES, type RingMode } from './landing'
import type { CameraTweak } from './world'

export const PREFS_KEY = 'play-forge:shuttle-pop:prefs'

export interface SpPrefs {
  camera: CameraTweak
  ring: RingMode
  /** Dotted flight path of shots coming to my side (flightpath.ts); same choices as the ring, default off. */
  path: RingMode
  /** The Jump / Dive buttons also swing by themselves (default false: the player swings). */
  autoSwing: boolean
}

export interface Prefs {
  get(): SpPrefs
  set(patch: Partial<SpPrefs>): void
  onChange(l: (p: SpPrefs) => void): () => void
}

type Store = Pick<Storage, 'getItem' | 'setItem'>

const NONE: Store = { getItem: () => null, setItem: () => {} }
/** Even touching `localStorage` can throw (sandboxed frames). */
function local(): Store {
  try {
    return globalThis.localStorage ?? NONE
  } catch {
    return NONE
  }
}

/** Finite numbers clamp to [-1, 1]; anything else is 0 (default). */
const unit = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) || 0 : 0

/** Turns anything read from storage into valid prefs; unknown fields are dropped. */
export function parsePrefs(raw: unknown): SpPrefs {
  const r =
    raw && typeof raw === 'object'
      ? (raw as { camera?: unknown; ring?: unknown; path?: unknown; autoSwing?: unknown })
      : {}
  const cam = r.camera
  const c = cam && typeof cam === 'object' ? (cam as Record<string, unknown>) : {}
  const ring = RING_MODES.find((m) => m === r.ring) ?? DEFAULT_RING
  const path = RING_MODES.find((m) => m === r.path) ?? DEFAULT_PATH
  return {
    camera: { height: unit(c.height), tilt: unit(c.tilt) },
    ring,
    path,
    autoSwing: r.autoSwing === true,
  }
}

export function createPrefs(store: Store = local()): Prefs {
  let current: SpPrefs
  try {
    current = parsePrefs(JSON.parse(store.getItem(PREFS_KEY) ?? 'null'))
  } catch {
    current = parsePrefs(null)
  }
  const listeners = new Set<(p: SpPrefs) => void>()
  return {
    get: () => current,
    set(patch) {
      current = parsePrefs({ ...current, ...patch })
      try {
        store.setItem(PREFS_KEY, JSON.stringify(current))
      } catch {
        // blocked / full storage: keep the in-page value
      }
      for (const l of listeners) l(current)
    },
    onChange(l) {
      listeners.add(l)
      return () => void listeners.delete(l)
    },
  }
}

export const prefs = createPrefs()

/** Camera sliders move in whole steps from -TWEAK_STEPS to +TWEAK_STEPS. */
export const TWEAK_STEPS = 10
export const toStep = (v: number): number => Math.round(v * TWEAK_STEPS)
export const fromStep = (s: number): number => s / TWEAK_STEPS
export const stepLabel = (s: number): string =>
  s === 0 ? t('Default') : `${s > 0 ? '+' : '−'}${Math.abs(s)}`
