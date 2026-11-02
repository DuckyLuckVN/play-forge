/** 2D affine transforms as plain tuples, so a body's metrics (pure) and its drawing use the very same placement. */

export interface Pt {
  x: number
  y: number
}

/** [a b c d e f]: (x, y) → (a·x + c·y + e, b·x + d·y + f). */
export type Mat = readonly [number, number, number, number, number, number]

/** m ∘ n: apply n first, then m. */
export const mul = (m: Mat, n: Mat): Mat => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
]
export const move = (x: number, y: number): Mat => [1, 0, 0, 1, x, y]
export const turnAbout = (o: Pt, a: number): Mat =>
  mul(move(o.x, o.y), mul([Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0], move(-o.x, -o.y)))
export const scaleAbout = (o: Pt, sx: number, sy: number): Mat =>
  mul(move(o.x, o.y), mul([sx, 0, 0, sy, 0, 0], move(-o.x, -o.y)))
export const apply = (m: Mat, p: Pt): Pt => ({
  x: m[0] * p.x + m[2] * p.y + m[4],
  y: m[1] * p.x + m[3] * p.y + m[5],
})
/** Multiplies the canvas transform by `m`. */
export const along = (ctx: CanvasRenderingContext2D, m: Mat) =>
  ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5])
