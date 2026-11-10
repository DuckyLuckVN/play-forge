/** Racket bonk: pure stun rules (60 Hz ticks, metres). N-player: bodies matched by id. */
export const STUN = {
  /** Lock length: 0.8 s, no move / swing. */
  ticks: 48,
  /** Immunity after the lock ends: 2 s, so no stun-lock. */
  immune: 120,
  /** Same-side centre distance (m) a swing reaches. */
  reach: 1.2,
  /**
   * Cross-net centre distance (m) a swing reaches: both players must hug the net (NET_MARGIN keeps them
   * ≥ 0.6 m apart). 0.85, not the plan's 1.0: at 1.0 a casual player rushing the net to bonk the computer
   * won 65% vs 54% plain play (balance.test.ts 'racket stun balance').
   */
  netReach: 0.85,
  /** Render-only flinch length in ticks. */
  flinch: 12,
} as const

const TICK_HZ = 60

export interface Body {
  id: string
  side: 0 | 1
  x: number
  z: number
}

/** Flat circle around the swinger; no facing or height check. */
export function racketHits(swinger: Body, victim: Body): boolean {
  if (swinger.id === victim.id) return false
  const reach = swinger.side === victim.side ? STUN.reach : STUN.netReach
  return Math.hypot(victim.x - swinger.x, victim.z - swinger.z) <= reach
}

/** `tick` may be fractional (render). */
export function stunned(stunAt: number, tick: number): boolean {
  return stunAt >= 0 && tick >= stunAt && tick < stunAt + STUN.ticks
}

/** True while stunned too, so a stunned player is never re-stunned. */
export function stunImmune(stunAt: number, tick: number): boolean {
  return stunAt >= 0 && tick < stunAt + STUN.ticks + STUN.immune
}

/** Every other player in reach and not immune, in `players` order. */
export function bonkVictims<T extends Body & { stunAt: number }>(
  swinger: Body,
  players: readonly T[],
  tick: number,
): T[] {
  return players.filter((q) => racketHits(swinger, q) && !stunImmune(q.stunAt, tick))
}

export function stunLook(stunAt: number, tick: number): { on: boolean; spin: number; flinch: number } {
  const on = stunned(stunAt, tick)
  const spin = on ? ((tick - stunAt) / TICK_HZ) * Math.PI * 2 * 1.5 : 0
  const f = stunAt >= 0 && tick >= stunAt ? 1 - (tick - stunAt) / STUN.flinch : 0
  return { on, spin, flinch: Math.min(1, Math.max(0, f)) }
}
