import { describe, expect, it } from 'vitest'
import {
  bodyFlair,
  bodyOut,
  extraOut,
  extraPose,
  pulse,
  type BodyFlair,
  type Channel,
  type FlairIn,
} from './flair'

const CHANNELS: Channel[] = ['wag', 'flop', 'twitch', 'sway', 'flap']
const BODIES: BodyFlair[] = ['none', 'wiggle', 'rock', 'wobble', 'tick', 'spin']
const input = (o: Partial<FlairIn> = {}): FlairIn => ({
  t: 0,
  seed: 0,
  run: 0,
  stride: 0,
  happy: 0,
  sad: 0,
  cheer: 0,
  jump: 0,
  ...o,
})

describe('flair channels', () => {
  it('extra bones move continuously over time and as the moods blend in (no pops)', () => {
    const o = extraOut()
    for (const ch of CHANNELS)
      for (const k of [0, 1] as const) {
        let prev: number[] | null = null
        for (let f = 0; f <= 600; f++) {
          // 10 s at 60 fps while happy / sad / run fade in and out.
          const t = f / 60
          const w = 0.5 - 0.5 * Math.cos(t * 0.9)
          extraPose(ch, k, input({ t, happy: w, sad: 1 - w, run: w * 0.5, stride: t * 1.7 }), o)
          const cur = [o.rx, o.ry, o.rz]
          for (const v of cur) expect(Number.isFinite(v)).toBe(true)
          if (prev)
            for (let i = 0; i < 3; i++)
              expect(Math.abs(cur[i] - prev[i]), `${ch} ${i} @${t}`).toBeLessThan(0.25)
          prev = cur
        }
      }
  })

  it('a happy tail wags wider and faster than an idle one', () => {
    const o = extraOut()
    const sweep = (happy: number) => {
      let lo = Infinity
      let hi = -Infinity
      let crossings = 0
      let last = 0
      for (let t = 0; t < 3; t += 1 / 120) {
        extraPose('wag', 0, input({ t, happy }), o)
        lo = Math.min(lo, o.ry)
        hi = Math.max(hi, o.ry)
        if (Math.sign(o.ry) !== Math.sign(last)) crossings++
        last = o.ry
      }
      return { span: hi - lo, crossings }
    }
    const idle = sweep(0)
    const happy = sweep(1)
    expect(happy.span).toBeGreaterThan(idle.span * 1.5)
    expect(happy.crossings).toBeGreaterThan(idle.crossings * 2)
  })

  it('sad ears fold, the antenna light blinks off briefly when idle and flashes when happy', () => {
    const o = extraOut()
    expect(extraPose('flop', 0, input({ sad: 1 }), o).rx).toBeGreaterThan(0.8)
    let off = 0
    let n = 0
    for (let t = 0; t < 10; t += 0.01, n++) if (!extraPose('sway', 0, input({ t }), o).glow) off++
    expect(off / n).toBeGreaterThan(0.03)
    expect(off / n).toBeLessThan(0.2)
    let flips = 0
    let last = true
    for (let t = 0; t < 2; t += 0.005) {
      const g = extraPose('sway', 0, input({ t, happy: 1 }), o).glow
      if (g !== last) flips++
      last = g
    }
    expect(flips).toBeGreaterThan(10)
  })

  it('body flair is continuous, stays small, and is exactly nothing for "none"', () => {
    const o = bodyOut()
    for (const f of BODIES) {
      let prev: number[] | null = null
      for (let fr = 0; fr <= 600; fr++) {
        const t = fr / 60
        const w = 0.5 - 0.5 * Math.cos(t * 0.7)
        bodyFlair(f, input({ t, happy: w, run: (1 - w) * 0.3 }), o)
        const cur = [o.ry, o.rz, o.lift, o.squash, o.headZ]
        if (f === 'none') expect(cur).toEqual([0, 0, 0, 0, 0])
        expect(Math.abs(o.rz)).toBeLessThan(0.2)
        expect(Math.abs(o.squash)).toBeLessThan(0.15)
        if (prev)
          for (let i = 0; i < cur.length; i++)
            expect(Math.abs(cur[i] - prev[i]), `${f} ${i}`).toBeLessThan(0.3)
        prev = cur
      }
    }
  })

  it('pulse is a short bump once per period', () => {
    expect(pulse(0.05, 1, 0.1)).toBeCloseTo(1)
    expect(pulse(0.5, 1, 0.1)).toBe(0)
    expect(pulse(1.05, 1, 0.1)).toBeCloseTo(1)
    expect(pulse(-0.95, 1, 0.1)).toBeCloseTo(1)
  })
})
