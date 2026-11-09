import { describe, expect, it } from 'vitest'
import { Blinker, bob, ghostRig, runPose, runPoseOut, spring, springTo } from './ghost-motion'

describe('running pose', () => {
  const input = (slide: number, reduced = false, speed = 0) => ({
    time: 1.3,
    dt: 1 / 60,
    slide,
    speed,
    eyes: 1,
    glow: 8,
    reduced,
  })
  /** Hop one lane: the slide shrinks from 1 to 0 over 5 ticks (as in the sim), then rest. */
  function hop(dir: number, frames: number, reduced = false) {
    const rig = ghostRig()
    const out = runPoseOut()
    const peeks: number[] = []
    for (let i = 0; i < frames; i++) {
      const slide = dir * Math.max(0, 1 - i / 5)
      peeks.push(runPose(rig, input(slide, reduced), out).peek!)
    }
    return { out, peeks }
  }

  it('at rest: seen from behind, no peek', () => {
    const out = runPose(ghostRig(), input(0), runPoseOut())
    expect(out.back).toBe(true)
    expect(out.peek).toBe(0)
  })

  it('peeks towards the lane it moves into, then turns back', () => {
    for (const dir of [-1, 1]) {
      const { peeks } = hop(dir, 120)
      expect(Math.max(...peeks.map((p) => p * dir))).toBeGreaterThan(0.6) // enough to show the face
      expect(Math.min(...peeks.map((p) => p * dir))).toBeGreaterThanOrEqual(-0.05)
      expect(Math.abs(peeks.at(-1)!)).toBeLessThan(0.05)
    }
  })

  it('the face lingers a moment after a quick hop', () => {
    const { peeks } = hop(1, 30)
    // A quarter second after the hop began, the face still shows.
    expect(peeks[15]).toBeGreaterThan(0.3)
  })

  it('peek is bounded however hard it slides', () => {
    const rig = ghostRig()
    const out = runPoseOut()
    for (let i = 0; i < 200; i++) {
      const p = runPose(rig, input(i % 40 < 20 ? 4 : -4), out).peek!
      expect(Math.abs(p)).toBeLessThanOrEqual(1)
    }
  })

  it('reduced motion: no bob, lean or turning head', () => {
    const { out, peeks } = hop(1, 10, true)
    expect(peeks.every((p) => p === 0)).toBe(true)
    expect(out.tilt).toBe(0)
    expect(out.lift).toBeCloseTo(0)
    expect(out.sx).toBe(1)
    expect(out.time).toBe(0)
    expect(out.glow).toBe(0)
  })

  it('a little shorter at top speed (tipped forward)', () => {
    const slow = runPose(ghostRig(), input(0, true, 0), runPoseOut()).sy
    const fast = runPose(ghostRig(), input(0, true, 1), runPoseOut()).sy
    expect(fast).toBeLessThan(slow)
    expect(fast).toBeGreaterThan(0.9)
  })
})

describe('ghost motion', () => {
  it('a spring overshoots a little, then settles on the target', () => {
    const s = spring()
    let peak = 0
    for (let i = 0; i < 120; i++) peak = Math.max(peak, springTo(s, 1, 1 / 60).value)
    expect(peak).toBeGreaterThan(1)
    expect(peak).toBeLessThan(1.25)
    expect(s.value).toBeCloseTo(1, 2)
  })

  it('a long frame does not blow the spring up', () => {
    const s = springTo(spring(), 1, 5)
    expect(Number.isFinite(s.value)).toBe(true)
    expect(Math.abs(s.value)).toBeLessThan(2)
  })

  it('bob keeps volume: squash wide, stretch thin', () => {
    for (const t of [0, 0.3, 0.7, 1.1]) {
      const b = bob(t)
      expect(b.sx * b.sx * b.sy).toBeCloseTo(1, 5)
    }
    expect(bob(1, 0)).toEqual({ y: 0, sx: 1, sy: 1 })
  })

  it('blinks every 2 to 5 seconds, quickly', () => {
    const b = new Blinker(7)
    const blinks: number[] = []
    let shut = false
    for (let i = 0; i < 60 * 60; i++) {
      const open = b.update(1 / 60)
      if (open < 0.5 && !shut) blinks.push(i / 60)
      shut = open < 0.5
    }
    const gaps = blinks.slice(1).map((t, i) => t - blinks[i])
    expect(blinks.length).toBeGreaterThan(10)
    for (const g of gaps) {
      expect(g).toBeGreaterThanOrEqual(2)
      expect(g).toBeLessThanOrEqual(5.3)
    }
  })

  it('is the same for the same seed', () => {
    const a = new Blinker(3)
    const b = new Blinker(3)
    for (let i = 0; i < 600; i++) expect(a.update(1 / 60)).toBe(b.update(1 / 60))
  })
})
