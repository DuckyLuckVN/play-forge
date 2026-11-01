// Smooth brick movement for drawing: when the sim moves a brick (the board
// drops a row, a slam, a push-back) it jumps a whole row; the drawing glides
// there instead. New bricks slide in from a row above. Drawing only: the sim's
// rows are the truth, so collision never lags.
import { CELL } from './sim/config'

/** How fast a brick catches up with its row (per second, exponential). */
const RATE = 11
/** Below this many px off, a brick snaps into place. */
const SNAP = 0.4

export class BrickTween {
  /** Each brick's drawn row offset in px (negative: still above its row). */
  private offsets = new Map<number, number>()
  private rows = new Map<number, number>()
  /** False until the first update after a reset: that frame's bricks just appear. */
  private primed = false

  /**
   * Call once per frame with every brick (and pickup) on the board. A brick
   * never seen before slides in from above, except on the first frame after a
   * reset (a new or resumed run), when the board just appears.
   */
  update(items: ReadonlyArray<{ id: number; row: number }>, dt: number): void {
    const fresh = this.primed
    this.primed = true
    const seen = new Set<number>()
    const k = 1 - Math.exp(-RATE * Math.min(dt, 0.1))
    for (const it of items) {
      seen.add(it.id)
      const before = this.rows.get(it.id)
      let off = this.offsets.get(it.id) ?? 0
      if (before === undefined) off = fresh ? -CELL : 0
      else if (before !== it.row) off += (before - it.row) * CELL
      off -= off * k
      if (Math.abs(off) < SNAP) off = 0
      this.offsets.set(it.id, off)
      this.rows.set(it.id, it.row)
    }
    for (const id of [...this.rows.keys()]) {
      if (seen.has(id)) continue
      this.rows.delete(id)
      this.offsets.delete(id)
    }
  }

  /** Px to add to a brick's y when drawing it. */
  dy(id: number): number {
    return this.offsets.get(id) ?? 0
  }

  /** Forget everything (a new run): bricks then appear where they are. */
  reset(): void {
    this.offsets.clear()
    this.rows.clear()
    this.primed = false
  }
}
