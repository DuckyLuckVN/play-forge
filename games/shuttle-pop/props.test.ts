import { describe, expect, it } from 'vitest'
import { topOf, type Prop } from './kit'
import { COURT } from './physics'
import { parkLayout, SURROUND } from './props'
import { CAMERA, cameraPose, type CameraPose } from './world'

const layout = parkLayout()
/** Half extents (x, y, z) of a prop's world box: exact for yaw, generous for tilted props. */
function extents(p: Prop): [number, number, number] {
  const tilted = p.tilt !== 0 || p.roll !== 0
  const s = tilted ? Math.max(p.sx, p.sy, p.sz) : 0
  const sx = Math.max(p.sx, s)
  const sz = Math.max(p.sz, s)
  const c = Math.abs(Math.cos(p.yaw))
  const n = Math.abs(Math.sin(p.yaw))
  return [(c * sx + n * sz) / 2, Math.max(p.sy, s) / 2, (n * sx + c * sz) / 2]
}
const overlaps = (p: Prop, hx: number, hz: number) => {
  const [ex, , ez] = extents(p)
  return Math.abs(p.x) - ex < hx && Math.abs(p.z) - ez < hz
}
/** Rec. 601 luma of a #rrggbb colour, 0..1. */
const luma = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return (((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255
}

/** Does the segment a → b pass through the prop's (yaw-generous) box? Slab test. */
function blocks(p: Prop, a: number[], b: number[]): boolean {
  const [ex, ey, ez] = extents(p)
  const lo = [p.x - ex, p.y - ey, p.z - ez]
  const hi = [p.x + ex, p.y + ey, p.z + ez]
  let t0 = 0
  let t1 = 1
  for (let k = 0; k < 3; k++) {
    const d = b[k] - a[k]
    if (Math.abs(d) < 1e-9) {
      if (a[k] < lo[k] || a[k] > hi[k]) return false
      continue
    }
    let ta = (lo[k] - a[k]) / d
    let tb = (hi[k] - a[k]) / d
    if (ta > tb) [ta, tb] = [tb, ta]
    t0 = Math.max(t0, ta)
    t1 = Math.min(t1, tb)
    if (t0 > t1) return false
  }
  return true
}

describe('park layout', () => {
  it('is the same park every load', () => {
    expect(parkLayout()).toEqual(layout)
  })

  it('keeps the court surface and run-off clear', () => {
    const hit = layout.filter((p) => overlaps(p, COURT.halfWidth + 0.35, COURT.halfLen + 0.45))
    expect(hit).toEqual([])
  })

  it('puts only the net-side furniture (umpire chair, scoreboard) inside the surround', () => {
    const inside = layout.filter((p) => overlaps(p, COURT.halfWidth + SURROUND.x, COURT.halfLen + SURROUND.z))
    expect(inside.length).toBeGreaterThan(0)
    for (const p of inside) {
      expect(Math.abs(p.z)).toBeLessThanOrEqual(1)
      expect(Math.abs(p.x)).toBeGreaterThanOrEqual(COURT.halfWidth + 0.5)
    }
  })

  it('never stands between the camera and the court or the players on it', () => {
    const pose: CameraPose = { x: 0, y: 0, z: 0, lookX: 0, lookY: 0, lookZ: 0 }
    const blockers = new Set<Prop>()
    for (const camX of [-1, 0, 1]) {
      cameraPose(camX, CAMERA.riseFrom, pose)
      const eye = [pose.x, pose.y, pose.z]
      for (let i = 0; i <= 4; i++)
        for (let j = 0; j <= 8; j++)
          for (const y of [0.02, 1.4]) {
            const pt = [
              -COURT.halfWidth + (i / 4) * COURT.halfWidth * 2,
              y,
              -COURT.halfLen + (j / 8) * COURT.halfLen * 2,
            ]
            for (const p of layout) if (blocks(p, eye, pt)) blockers.add(p)
          }
    }
    expect([...blockers]).toEqual([])
  })

  it('has nothing pale above the net behind the far baseline (the white shuttle reads there)', () => {
    const pale = layout.filter(
      (p) =>
        p.z > COURT.halfLen &&
        Math.abs(p.x) < COURT.halfWidth + SURROUND.x &&
        topOf(p) > COURT.netH &&
        luma(p.color) > 0.75,
    )
    expect(pale).toEqual([])
  })
})
