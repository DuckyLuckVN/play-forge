// Pure screen-space visibility math for the shuttle (visuals only, no sim state).

/** Player's projected box: NDC rect + camera-space distance of the player's centre. */
export interface ScreenRect {
  x0: number
  y0: number
  x1: number
  y1: number
  depth: number
}

export const VIS = {
  /** NDC falloff band outside the rect. */
  edge: 0.05,
  /** Shuttle this much closer to the camera than the player's centre counts as in front. */
  front: 0.2,
  /** Lowest opacity of a fully occluding player. */
  minOpacity: 0.4,
  /** Per second, toward faded. */
  fadeIn: 14,
  /** Per second, recovery. */
  fadeOut: 5,
  /** Metres, for the render projection of the player's body box (the top is the look's head, Chibi.top). */
  body: { bottom: 0.15, halfW: 0.32 },
  /** Stronger than before the lit court / sand (look.ts): the shuttle flies over brighter ground now. */
  halo: { size: 0.44, color: '#fff1a8', opacity: 0.7, px: 32 },
} as const

/** World-y extent of a player's body box. */
export interface BodyBox {
  y0: number
  y1: number
  mid: number
}

/**
 * The body box's world y: bottom `rootY + lift + VIS.body.bottom·scale`, top `rootY + lift + top·scale`
 * (`top` = the look's head top, Chibi.top, in rig metres; `lift` = the rig's height in world metres,
 * Chibi.lift × scale: a jump carries the box up), and the centre.
 * Pass `out` to fill it in place (the per-frame render path allocates nothing).
 */
export function bodyBox(
  rootY: number,
  lift: number,
  top: number,
  scale: number,
  out: BodyBox = { y0: 0, y1: 0, mid: 0 },
): BodyBox {
  const base = rootY + lift
  out.y0 = base + VIS.body.bottom * scale
  out.y1 = base + top * scale
  out.mid = (out.y0 + out.y1) / 2
  return out
}

/** 0..1 how much the shuttle at NDC (px,py) is covered by the player's box. */
export function occlusion(
  px: number,
  py: number,
  pDepth: number,
  r: ScreenRect,
  edge: number = VIS.edge,
): number {
  if (pDepth < r.depth - VIS.front) return 0
  const dx = Math.max(r.x0 - px, 0, px - r.x1)
  const dy = Math.max(r.y0 - py, 0, py - r.y1)
  const d = Math.max(dx, dy)
  if (d <= 0) return 1
  if (edge <= 0 || d >= edge) return 0
  return 1 - d / edge
}

/** Opacity a player covering the shuttle by `occ` (0..1) fades toward, in any phase (a serve too). */
export function fadeTarget(occ: number): number {
  return 1 - occ * (1 - VIS.minOpacity)
}

/** Frame-rate independent exponential approach. */
export function fadeTo(current: number, target: number, dt: number): number {
  const rate = target < current ? VIS.fadeIn : VIS.fadeOut
  return target + (current - target) * Math.exp(-rate * dt)
}

/**
 * Every player's fade, one step: player i eases (fadeTo) toward fadeTarget(occ[i]). Any number of players
 * fade at once, each by how much it covers the shuttle. `fades` is updated in place; dt < 0 counts as 0.
 */
export function stepFades(occ: ArrayLike<number>, fades: number[], dt: number): void {
  const t = Math.max(0, dt)
  for (let i = 0; i < fades.length; i++) fades[i] = fadeTo(fades[i], fadeTarget(occ[i] ?? 0), t)
}

/**
 * Halo opacity: none while the shuttle is held (before a serve it sits at a player's chest), and faded out
 * by `overlap` (0..1: how much any player's screen box overlaps the shuttle, in front or behind), so the
 * glow never shows on or through a player.
 */
export function haloOpacity(overlap: number, held: boolean): number {
  return held ? 0 : VIS.halo.opacity * (1 - Math.min(1, Math.max(0, overlap)))
}

/** RGBA white disc, alpha = 255*(1-r)^2, 0 at the rim. */
export function haloPixels(px: number = VIS.halo.px): Uint8Array {
  const out = new Uint8Array(px * px * 4)
  const c = (px - 1) / 2
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const r = Math.hypot(x - c, y - c) / (px / 2)
      const a = r >= 1 ? 0 : Math.round(255 * (1 - r) * (1 - r))
      const i = (y * px + x) * 4
      out[i] = 255
      out[i + 1] = 255
      out[i + 2] = 255
      out[i + 3] = a
    }
  }
  return out
}
