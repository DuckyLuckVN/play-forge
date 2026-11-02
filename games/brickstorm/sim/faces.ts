// Which side of a brick (or the boss) a contact is on, from the contact normal
// (pointing out of the brick, at the ball).
import type { Face } from './types'

/** A surface counts as facing a side once its normal leans this far that way (45° slopes face two). */
const LEAN = 0.5

/** The one side a contact normal is mostly on. */
export function faceOf(nx: number, ny: number): Face {
  if (Math.abs(ny) >= Math.abs(nx)) return ny < 0 ? 'top' : 'bottom'
  return nx < 0 ? 'left' : 'right'
}

/** Every side a surface faces: one for a flat side, two for a slope or the curve of an orb. */
export function facesOf(nx: number, ny: number): Face[] {
  const out: Face[] = []
  if (ny <= -LEAN) out.push('top')
  if (ny >= LEAN) out.push('bottom')
  if (nx <= -LEAN) out.push('left')
  if (nx >= LEAN) out.push('right')
  return out.length ? out : [faceOf(nx, ny)]
}
