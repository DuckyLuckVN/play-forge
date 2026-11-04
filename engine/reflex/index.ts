// Small, pure helpers shared by the reaction games (Phantom Drift, Synthstride).
// All timing is in simulation ticks so it stays deterministic.

import { clamp01, lerp } from '../fx/tween'

/** Difficulty tier reached after `ticks`: +1 every `tierTicks`, capped at `maxTier`. */
export function tierAt(ticks: number, tierTicks: number, maxTier: number): number {
  return Math.min(maxTier, Math.floor(Math.max(0, ticks) / tierTicks))
}

/** Value that eases linearly from `start` (tier 0) to `end` (`maxTier`), then holds. */
export function ramp(tier: number, maxTier: number, start: number, end: number): number {
  return lerp(start, end, clamp01(tier / maxTier))
}

/**
 * State of a warning that leads up to `fireAt`, lasting `duration` ticks:
 * `progress` 0..1 drives the visual tell (shake, glow, shadow), `fired` once it lands.
 */
export function telegraph(
  fireAt: number,
  duration: number,
  now: number,
): { progress: number; fired: boolean } {
  return { progress: clamp01(1 - (fireAt - now) / duration), fired: now >= fireAt }
}

/** True when `mark` happened less than `window` ticks before `now` (near misses, perfect timing). */
export function withinWindow(mark: number, now: number, window: number): boolean {
  return now - mark >= 0 && now - mark < window
}
