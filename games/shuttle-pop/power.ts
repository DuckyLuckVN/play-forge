// Hit power: how much of a swing's charge actually landed (pure leaf: the sim, sounds and view share it).
import { isFull } from './charge'
import { WINDOW, type Grade, type ShotKind } from './shots'

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

/** A power smash pressures the receiver: their Perfect window shrinks (AI included). */
export const pressureOf = (kind: ShotKind, power: number): boolean => kind === 'smash' && isPowerHit(power)

/** The receiver's Perfect window (ticks): pressuredPerfect after a pressuring smash, else WINDOW.perfect. */
export const perfectWindowOf = (pressured: boolean): number =>
  pressured ? POWER_SWING.pressuredPerfect : WINDOW.perfect

/** Move-slowdown ticks after a rally swing of `charge`: a full charge pays recoveryTicks, anything less none. */
export const recoveryAfter = (charge: number): number => (isFull(charge) ? POWER_SWING.recoveryTicks : 0)
