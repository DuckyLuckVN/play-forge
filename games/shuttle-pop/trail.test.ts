import { describe, expect, it } from 'vitest'
import { Color, Vector3 } from 'three'
import { SHUTTLECOCK } from './model/shuttlecock'
import { POWER_SWING } from './power'
import {
  halfWidthAt,
  layRibbon,
  MIN_HALF_PX,
  newTrailStyle,
  ribbonAlpha,
  ribbonWidth,
  RibbonTrail,
  speedScale,
  trailKind,
  trailStyle,
  TrailSampler,
  TRAIL_SPEED,
} from './trail'

const BIG = 1
const SPEED = 12
const style = (k: Parameters<typeof trailStyle>[0], g: Parameters<typeof trailStyle>[1], p = 0, s = SPEED) =>
  trailStyle(k, g, p, s)
const hue = (c: Color) => c.getHSL({ h: 0, s: 0, l: 0 })

describe('TrailSampler', () => {
  it('spans the same flight time at 30, 60 and 144 fps; head tracks the shuttle', () => {
    const span = (fps: number) => {
      const s = new TrailSampler(7, 1 / 60)
      const dt = 1 / fps
      for (let i = 0; i <= Math.round(0.5 * fps); i++) s.update(i === 0 ? 0 : dt, 12 * i * dt, 2, 0)
      return s.pts[0] - s.pts[(s.len - 1) * 3]
    }
    expect(span(60)).toBeCloseTo(12 * (6 / 60), 3)
    expect(span(30)).toBeCloseTo(span(60), 3)
    expect(span(144)).toBeCloseTo(span(60), 1)
  })
})

describe('trailStyle (kind × grade × power × speed)', () => {
  it('kinds read apart: drop thin/short/fast fade, clear long, drive cyan, smash widest/brightest', () => {
    const drop = style('drop', 'good')
    const clear = style('clear', 'good')
    const drive = style('drive', 'good')
    const smash = style('smash', 'good')
    expect(drop.width).toBeLessThan(clear.width)
    expect(drop.length).toBeLessThan(drive.length)
    expect(drive.length).toBeLessThan(clear.length)
    expect(drop.fade).toBeGreaterThan(clear.fade)
    expect(smash.width).toBeGreaterThan(Math.max(clear.width, drive.width))
    expect(smash.opacity).toBeGreaterThan(Math.max(drop.opacity, clear.opacity, drive.opacity))
    // Drive: cyan tail (g, b ≫ r); clear: pale blue; smash: warm tail (r > b).
    expect(drive.colorTail.b).toBeGreaterThan(drive.colorTail.r * 3)
    expect(clear.colorTail.b).toBeGreaterThan(clear.colorTail.r)
    expect(smash.colorTail.r).toBeGreaterThan(smash.colorTail.b)
    expect(drop.colorHead.getHex()).toBe(0xffffff)
  })

  it('serve shapes like a clear (long) or a drop (short); unknown = clear', () => {
    expect(trailKind('serveShort')).toBe('drop')
    expect(trailKind('serveLong')).toBe('clear')
    expect(trailKind(null)).toBe('clear')
  })

  it('late: thinner, shorter, duller; good = the base; perfect: gold + sparkle', () => {
    const good = style('clear', 'good')
    const late = style('clear', 'late')
    const perf = style('clear', 'perfect')
    expect(late.width).toBeLessThan(good.width)
    expect(late.length).toBeLessThan(good.length)
    expect(late.opacity).toBeLessThan(good.opacity)
    expect(hue(late.colorTail).s).toBeLessThan(hue(good.colorTail).s)
    expect(good.sparkle).toBe(false)
    expect(late.sparkle).toBe(false)
    expect(perf.sparkle).toBe(true)
    // Gold: the tail turns warm (r > b).
    expect(perf.colorTail.r).toBeGreaterThan(perf.colorTail.b)
    expect(style(null, null).width).toBe(good.width) // a serve = a good clear
  })

  it('power ~1.5× wider, longer, orange-red; Perfect + power the widest/longest, gold with a red edge', () => {
    const base = style('drive', 'good')
    const pow = style('drive', 'good', BIG)
    const pp = style('drive', 'perfect', BIG)
    expect(pow.width / base.width).toBeCloseTo(1.5, 5)
    expect(pow.length).toBeGreaterThan(base.length)
    expect(pow.colorTail.r).toBeGreaterThan(0.9)
    expect(pow.colorTail.g).toBeLessThan(0.2)
    expect(pp.width).toBeGreaterThan(pow.width)
    expect(pp.length).toBeGreaterThan(pow.length)
    expect(pp.edged).toBe(true)
    expect(pp.colorEdge.r).toBeGreaterThan(0.9)
    expect(pp.colorEdge.g).toBeLessThan(0.1)
    expect(pp.colorHead.g).toBeGreaterThan(0.6) // gold, linear space
    expect(pp.sparkle).toBe(true)
    expect(style('drive', 'good', POWER_SWING.popFrom - 0.01).width).toBe(base.width)
  })

  it('length grows with speed (none when still); every style is clearly visible', () => {
    expect(style('clear', 'good', 0, 0).length).toBe(0)
    expect(speedScale(TRAIL_SPEED.min - 0.1)).toBe(0)
    expect(style('clear', 'good', 0, 20).length).toBeGreaterThan(style('clear', 'good', 0, 5).length)
    for (const k of ['drop', 'clear', 'drive', 'smash'] as const)
      for (const g of ['late', 'good', 'perfect'] as const)
        expect(style(k, g).opacity).toBeGreaterThanOrEqual(0.45)
  })

  it('writes into `out` without allocating new colours', () => {
    const out = newTrailStyle()
    const head = out.colorHead
    expect(trailStyle('smash', 'perfect', BIG, 20, out)).toBe(out)
    expect(out.colorHead).toBe(head)
  })
})

describe('ribbon shape', () => {
  it('smooth taper: zero at both ends, widest early, alpha fades to the tail', () => {
    expect(ribbonWidth(0)).toBe(0)
    expect(ribbonWidth(1)).toBe(0)
    expect(ribbonWidth(0.15)).toBeGreaterThan(ribbonWidth(0.6))
    expect(ribbonWidth(0.6)).toBeGreaterThan(ribbonWidth(0.9))
    expect(ribbonAlpha(0.1, 1.2)).toBeGreaterThan(ribbonAlpha(0.5, 1.2))
    // Drop fades faster.
    expect(ribbonAlpha(0.5, 2.4)).toBeLessThan(ribbonAlpha(0.5, 1.2))
  })

  it('layRibbon starts `gap` behind the shuttle and is cut at the path end', () => {
    const n = 14
    const pts = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) pts[i * 3] = -(2 * i) / (n - 1) // head at 0, path back to x = −2
    const out = new Float32Array(10 * 4)
    expect(layRibbon(pts, n, 0.3, 1, 10, out)).toBeCloseTo(1)
    expect(out[0]).toBeCloseTo(-0.3)
    expect(out[9 * 4]).toBeCloseTo(-1.3)
    expect(layRibbon(pts, n, 0.3, 5, 10, out)).toBeCloseTo(1.7) // only 1.7 m of path past the gap
    expect(layRibbon(pts, n, 2.5, 1, 10, out)).toBe(0)
  })
})

describe('RibbonTrail', () => {
  it('one mesh; never reaches the shuttlecock (all vertices behind its skirt mouth); restarts on a hit', () => {
    const gap = SHUTTLECOCK.length + 0.05
    const r = new RibbonTrail(40, 1 / 60, gap)
    const look = trailStyle('smash', 'perfect', BIG, 20)
    // Flying +z at 20 m/s for 0.3 s; camera behind at z = −8.
    for (let i = 0; i <= 18; i++) r.update(true, 0, 1.5, (20 * i) / 60, i === 0 ? 0 : 1 / 60, look, 0, 3, -8)
    expect(r.mesh.visible).toBe(true)
    const head = (20 * 18) / 60
    const pos = r.mesh.geometry.getAttribute('position')
    const v = new Vector3()
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i)
      expect(head - v.z).toBeGreaterThan(SHUTTLECOCK.length)
    }
    r.restart()
    expect(r.mesh.visible).toBe(false)
    r.update(true, 0, 1.5, 6, 1 / 60, look, 0, 3, -8)
    expect(r.mesh.visible).toBe(false) // regrows from the contact
    r.update(false, 0, 1.5, 6, 1 / 60, look, 0, 3, -8)
    expect(r.mesh.visible).toBe(false)
  })

  it('soft edges: outer vertices transparent, core strongest; Perfect + power edges red', () => {
    const r = new RibbonTrail(40, 1 / 60, 0.2)
    const look = trailStyle('smash', 'perfect', BIG, 20)
    for (let i = 0; i <= 18; i++) r.update(true, 0, 1.5, (20 * i) / 60, i === 0 ? 0 : 1 / 60, look, 0, 3, -8)
    const col = r.mesh.geometry.getAttribute('color')
    const p = 8 * 5 // point 8: [edge, inner edge, core, inner edge, edge]
    expect(col.getW(p)).toBe(0)
    expect(col.getW(p + 2)).toBeGreaterThan(col.getW(p + 1))
    expect(col.getX(p + 1)).toBeCloseTo(look.colorEdge.r)
    expect(col.getY(p + 1)).toBeCloseTo(look.colorEdge.g)
  })
})

describe('halfWidthAt (screen floor)', () => {
  it('never thinner than the pixel floor far away; the style width up close; wider styles stay wider', () => {
    const px = (2 * Math.tan((55 * Math.PI) / 360)) / 720
    expect(halfWidthAt(0.15, 1, px)).toBeCloseTo(0.075)
    const far = halfWidthAt(0.15, 20, px)
    expect(far / (20 * px)).toBeCloseTo(MIN_HALF_PX)
    expect(halfWidthAt(0.3, 20, px)).toBeGreaterThan(far)
    expect(halfWidthAt(0.15, 20, 0)).toBeCloseTo(0.075)
  })
})
