// Hold-to-charge: how long the swing button has been held → charge 0..1 (pure leaf module, shared by
// the sim, the computer, the view and the sounds).

/**
 * Ticks held before the charge starts (a tap stays a plain swing), ticks held for a full charge, the
 * run speed share while charging, and the levels the charge sounds step at (the last one = full).
 */
export const CHARGE = { start: 6, full: 30, moveMul: 0.7, steps: [0.01, 0.5, 1] } as const

/** Charge for a hold of `ticks` ticks: 0 up to CHARGE.start, linear to 1 at CHARGE.full, then 1. */
export function chargeOf(ticks: number): number {
  if (!(ticks > CHARGE.start)) return 0
  return Math.min(1, (ticks - CHARGE.start) / (CHARGE.full - CHARGE.start))
}

/** Counts as a full charge (power pop, boom, buzz). */
export const isFull = (charge: number | undefined): boolean => (charge ?? 0) >= 1

/** How many of CHARGE.steps `charge` has reached (0 = none yet; steps.length = full). */
export function chargeStage(charge: number): number {
  let n = 0
  for (const s of CHARGE.steps) if (charge >= s) n++
  return n
}
