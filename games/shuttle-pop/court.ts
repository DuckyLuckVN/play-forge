// Shared match constants + view/world mapping. Leaf module (no game imports) so sim.ts and ai.ts
// can both use it without an import cycle.

export const TICK_RATE = 60
/** Top run speed, m/s. */
export const MOVE_SPEED = 4.5
/** Players stay this far from the net plane. */
export const NET_MARGIN = 0.3

/** View-relative (ix = screen right, iz = toward the net) → world. Its own inverse. */
export function toWorld(side: 0 | 1, ix: number, iz: number): { x: number; z: number } {
  return side === 0 ? { x: -ix, z: iz } : { x: ix, z: -iz }
}
