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
  ghostAt: 0.5,
  /** Metres, for the render projection of the player's body box. */
  body: { bottom: 0.15, top: 1.3, halfW: 0.32 },
  halo: { size: 0.34, color: '#fff1a8', opacity: 0.55, px: 32 },
} as const

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

export function fadeTarget(occ: number, rally: boolean): number {
  return rally ? 1 - occ * (1 - VIS.minOpacity) : 1
}

/** Frame-rate independent exponential approach. */
export function fadeTo(current: number, target: number, dt: number): number {
  const rate = target < current ? VIS.fadeIn : VIS.fadeOut
  return target + (current - target) * Math.exp(-rate * dt)
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
