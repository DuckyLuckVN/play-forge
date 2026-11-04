// Hearts, hit invulnerability, calm-time regen and combo multiplier: the shared
// "health bar" of the reaction games. Pure and tick-based (sim-safe).

export interface Vitals {
  hearts: number
  maxHearts: number
  /** No damage before this tick. */
  invulnUntil: number
  /** Last hit or heal; a heart regrows after a calm stretch. */
  calmSince: number
  combo: number
  bestCombo: number
}

export function createVitals(maxHearts: number): Vitals {
  return { hearts: maxHearts, maxHearts, invulnUntil: 0, calmSince: 0, combo: 0, bestCombo: 0 }
}

/** Takes a heart unless invulnerable. Breaks the combo. Returns whether it landed. */
export function damage(v: Vitals, tick: number, invulnTicks: number): boolean {
  if (tick < v.invulnUntil || v.hearts <= 0) return false
  v.hearts--
  v.invulnUntil = tick + invulnTicks
  v.calmSince = tick
  v.combo = 0
  return true
}

/** Call every tick: regrows a heart after `regenTicks` without damage. Returns whether it healed. */
export function regen(v: Vitals, tick: number, regenTicks: number): boolean {
  if (v.hearts <= 0) return false
  if (v.hearts >= v.maxHearts) {
    v.calmSince = tick
    return false
  }
  if (tick - v.calmSince < regenTicks) return false
  v.hearts++
  v.calmSince = tick
  return true
}

/** Adds to the combo; returns the new multiplier if it went up, else null. */
export function addCombo(v: Vitals, per: number, max: number): number | null {
  const before = comboMultiplier(v.combo, per, max)
  v.combo++
  v.bestCombo = Math.max(v.bestCombo, v.combo)
  const after = comboMultiplier(v.combo, per, max)
  return after > before ? after : null
}

/** ×1 .. ×max: +1 for every `per` combo. */
export const comboMultiplier = (combo: number, per: number, max: number) =>
  1 + Math.min(max - 1, Math.floor(combo / per))
