/** Pure geometry for a radial (pie) menu. Screen coords: y down; slot 0 at top, clockwise. */

const TAU = Math.PI * 2

export interface Point {
  x: number
  y: number
}

/** Angle (radians) of slot `i` of `count`. */
export function slotAngle(i: number, count: number): number {
  return -Math.PI / 2 + (i / count) * TAU
}

/** Offset of slot `i` from the wheel centre at `radius`. */
export function slotOffset(i: number, count: number, radius: number): Point {
  const a = slotAngle(i, count)
  return { x: Math.cos(a) * radius, y: Math.sin(a) * radius }
}

/** Slot whose sector holds direction (dx, dy); -1 inside the dead zone. No outer limit. */
export function pickSlot(dx: number, dy: number, count: number, deadZone: number): number {
  if (Math.hypot(dx, dy) < deadZone) return -1
  const turn = (((Math.atan2(dy, dx) + Math.PI / 2) % TAU) + TAU) % TAU
  return Math.round(turn / (TAU / count)) % count
}

/** Clamp a wheel centre so a wheel of `reach` stays inside `box`; centres an axis too small to fit. */
export function fitCenter(p: Point, box: { w: number; h: number }, reach: number): Point {
  const fit = (v: number, size: number) =>
    size < 2 * reach ? size / 2 : Math.min(Math.max(v, reach), size - reach)
  return { x: fit(p.x, box.w), y: fit(p.y, box.h) }
}
