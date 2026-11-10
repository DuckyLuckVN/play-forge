// Hit power: how much of a swing's charge actually landed (pure leaf: the sim, sounds and view share it).
import type { Grade } from './shots'

export const POWER_SWING = {
  /** Share of the charge effect a hit keeps by its timing grade. */
  gradeShare: { perfect: 1, good: 0.7, late: 0.4 },
  /** power ≥ this = a "power" hit (pop, burst, boom, buzz). */
  popFrom: 0.9,
  /** Receiver Perfect window (ticks) after a pressuring smash. */
  pressuredPerfect: 4,
  /** Move slowdown ticks after a full-charge rally swing. */
  recoveryTicks: 15,
  /** Move speed multiplier during recovery (a slowdown, not a stop). */
  recoveryMoveMul: 0.4,
} as const

/** Hit power 0..1: the charge effect achieved (`gain`) times the timing grade's share. */
export function hitPower(grade: Grade, gain: number): number {
  return Math.min(1, Math.max(0, gain || 0)) * POWER_SWING.gradeShare[grade]
}

/** Counts as a power hit (old events without power: no). */
export const isPowerHit = (power: number | undefined): boolean => (power ?? 0) >= POWER_SWING.popFrom
