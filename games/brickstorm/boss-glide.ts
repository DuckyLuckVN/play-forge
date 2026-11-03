// Bosses move a whole column (or teleport) in one step; this eases the drawn
// body from where it was to where it went, so moves read as motion.
import { CELL } from './sim/config'

const EASE = 12

export class BossGlide {
  /** How far the drawn body is from its true place, in px (eases to 0). */
  x = 0
  y = 0
  private at: { boss: object; col: number; row: number } | null = null

  /** Notes where `boss` is now; returns how far it moved since the last call, in cells. */
  track(boss: object, col: number, row: number): { dc: number; dr: number } {
    const was = this.at
    this.at = { boss, col, row }
    if (!was || was.boss !== boss) {
      this.x = this.y = 0
      return { dc: 0, dr: 0 }
    }
    const dc = col - was.col
    const dr = row - was.row
    this.x -= dc * CELL
    // The usual one-row drop snaps like every other brick; only extra rows glide.
    this.y -= (dr === 1 ? 0 : dr > 1 ? dr - 1 : dr) * CELL
    return { dc, dr }
  }

  update(dt: number): void {
    const k = Math.exp(-EASE * dt)
    this.x *= k
    this.y *= k
  }
}
