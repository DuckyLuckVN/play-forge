// Badminton racket along +y from the butt (y = 0), string bed in the xy plane: taped grip, slim shaft,
// T-joint, thin oval frame (accent colour), string grid. One merged mesh.

import { BoxGeometry, CylinderGeometry, TorusGeometry } from 'three'
import { RACKET } from './dims'
import type { Look } from './look'
import { part, shade, type Part } from './merge'

/** Frame: ring radius, tube, oval scale (x across, y along the shaft); string spacing. */
const FRAME = { r: 0.16, tube: 0.013, sx: 0.82, sy: 1.1, step: 0.021 }
const GRIP = { r: 0.021, len: 0.12 }
const SHAFT = { r: 0.0065 }
const STRING = 0xf2efe6
const SHAFT_COL = 0xc9ccd6

export function racketParts(l: Look): Part[] {
  const frameCol = l.kit.stripe
  const H = RACKET.head
  const bottom = H - FRAME.r * FRAME.sy
  const out: Part[] = [
    part(new CylinderGeometry(0.025, 0.025, 0.014, 12), shade(l.kit.tape, 0.35), { p: [0, 0.007, 0] }),
    part(new CylinderGeometry(GRIP.r, GRIP.r * 0.92, GRIP.len, 10), l.kit.tape, { p: [0, GRIP.len / 2, 0] }),
  ]
  // Tape overlap ridges.
  for (const y of [0.035, 0.065, 0.095])
    out.push(
      part(new TorusGeometry(GRIP.r, 0.0035, 4, 12), shade(l.kit.tape, 0.15), {
        p: [0, y, 0],
        r: [Math.PI / 2, 0, 0.25],
      }),
    )
  const shaftLen = bottom - GRIP.len + 0.01
  out.push(
    part(new CylinderGeometry(SHAFT.r, SHAFT.r * 1.3, shaftLen, 8), SHAFT_COL, {
      p: [0, GRIP.len + shaftLen / 2 - 0.005, 0],
    }),
    // T-joint: flares into the frame's throat.
    part(new CylinderGeometry(0.018, 0.007, 0.03, 8), frameCol, { p: [0, bottom - 0.008, 0] }),
    part(new TorusGeometry(FRAME.r, FRAME.tube, 8, 44), frameCol, {
      p: [0, H, 0],
      s: [FRAME.sx, FRAME.sy, 1],
    }),
  )
  // Strings: a grid clipped to the frame's inner oval.
  const a = FRAME.r * FRAME.sx - FRAME.tube * 0.5
  const b = FRAME.r * FRAME.sy - FRAME.tube * 0.5
  const box = new BoxGeometry(1, 1, 1)
  for (let x = -Math.floor(a / FRAME.step) * FRAME.step; x <= a - 0.005; x += FRAME.step) {
    const len = 2 * b * Math.sqrt(1 - (x / a) ** 2)
    out.push(part(box, STRING, { p: [x, H, 0], s: [0.0032, len, 0.0022] }))
  }
  for (let y = -Math.floor(b / FRAME.step) * FRAME.step; y <= b - 0.005; y += FRAME.step) {
    const len = 2 * a * Math.sqrt(1 - (y / b) ** 2)
    out.push(part(box, STRING, { p: [0, H + y, 0], s: [len, 0.0032, 0.0022] }))
  }
  return out
}
