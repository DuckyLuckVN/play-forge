import { describe, expect, it } from 'vitest'
import { canSplit, Footwork, LUNGE, lateralShare, lungeWanted, SPLIT, splitHop, splitsOn } from './footwork'
import { courtTurn, GAIT } from './locomotion'

describe('lateralShare (gait selection relative to the facing)', () => {
  it('sideways → shuffle (1), forward / back → steps (0), smooth in between', () => {
    expect(lateralShare(0, 1)).toBe(1)
    expect(lateralShare(0, -0.4)).toBe(1)
    expect(lateralShare(1, 0)).toBe(0)
    expect(lateralShare(-0.7, 0)).toBe(0)
    expect(lateralShare(0, 0)).toBe(0)
    expect(lateralShare(0.5, 0.5)).toBeCloseTo(0.5, 9)
    let prev = 0
    for (let a = 0; a <= Math.PI / 2 + 1e-9; a += 0.02) {
      const s = lateralShare(Math.cos(a), Math.sin(a))
      expect(s).toBeGreaterThanOrEqual(prev)
      expect(s - prev).toBeLessThan(0.1)
      prev = s
    }
  })

  it('judges the move in the body frame: the same world move reads differently by facing', () => {
    // Moving +x while facing +z = sideways; the same move facing +x = forward.
    expect(lateralShare(0, 1)).toBe(1)
    expect(lateralShare(1, 0)).toBe(0)
  })
})

describe('courtTurn (facing while moving)', () => {
  it('keeps facing the net on a side shuffle', () => {
    expect(courtTurn(Math.PI / 2)).toBeCloseTo(0, 9)
    expect(courtTurn(-Math.PI / 2)).toBeCloseTo(0, 9)
  })

  it('retreat turns the racket shoulder (right, −x) back: negative yaw; advance a little forward', () => {
    expect(courtTurn(Math.PI)).toBeCloseTo(-GAIT.turnBack, 9)
    expect(courtTurn(0)).toBeCloseTo(GAIT.turnFwd, 9)
    expect(courtTurn((3 * Math.PI) / 4)).toBeLessThan(0)
    expect(courtTurn((-3 * Math.PI) / 4)).toBeLessThan(0)
  })

  it('is continuous all the way round', () => {
    let prev = courtTurn(-Math.PI)
    for (let a = -Math.PI; a <= Math.PI; a += 0.01) {
      const v = courtTurn(a)
      expect(Math.abs(v - prev)).toBeLessThan(0.02)
      prev = v
    }
  })
})

describe('lungeWanted', () => {
  it('only on a far, low reach close to the contact', () => {
    expect(lungeWanted(LUNGE.reach + 0.1, 0.8, 0.1)).toBe(true)
    // Near: no lunge.
    expect(lungeWanted(LUNGE.reach - 0.1, 0.8, 0.1)).toBe(false)
    // Overhead (smash / clear height): no lunge.
    expect(lungeWanted(LUNGE.reach + 0.1, LUNGE.maxY + 0.1, 0.1)).toBe(false)
    // Contact still far off in time, or none pending.
    expect(lungeWanted(LUNGE.reach + 0.1, 0.8, LUNGE.lead + 0.05)).toBe(false)
    expect(lungeWanted(LUNGE.reach + 0.1, 0.8, undefined)).toBe(false)
    expect(lungeWanted(LUNGE.reach + 0.1, 0.8, 0)).toBe(true)
    // Mid-height far reach (chest / shoulder high) still lunges.
    expect(lungeWanted(LUNGE.reach + 0.1, 1.7, 0.1)).toBe(true)
  })
})

describe('splitsOn', () => {
  it('the opponent hitting or serving makes me split-step; my own shot does not', () => {
    expect(splitsOn('hit', 1, 0)).toBe(true)
    expect(splitsOn('serve', 1, 0)).toBe(true)
    expect(splitsOn('hit', 0, 0)).toBe(false)
    expect(splitsOn('serve', 0, 0)).toBe(false)
    expect(splitsOn('whiff', 1, 0)).toBe(false)
    expect(splitsOn('point', 1, 0)).toBe(false)
  })
})

describe('canSplit', () => {
  it('only when planted: not sprinting, not lunging, not airborne', () => {
    expect(canSplit(0, 0, false)).toBe(true)
    expect(canSplit(SPLIT.maxSpeed - 0.01, 0, false)).toBe(true)
    expect(canSplit(SPLIT.maxSpeed + 0.01, 0, false)).toBe(false)
    expect(canSplit(0, SPLIT.maxLunge + 0.01, false)).toBe(false)
    expect(canSplit(0, 0, true)).toBe(false)
  })
})

describe('splitHop', () => {
  const o = { height: 0, squash: 0 }
  it('grounded before and after; a small hop then a landing squash; continuous', () => {
    expect(splitHop(-0.1, o)).toEqual({ height: 0, squash: 0 })
    expect(splitHop(Infinity, o)).toEqual({ height: 0, squash: 0 })
    expect(splitHop(SPLIT.air / 2, o).height).toBeCloseTo(1, 9)
    expect(splitHop(SPLIT.air + SPLIT.land / 2, o).squash).toBeGreaterThan(0)
    expect(splitHop(SPLIT.air + SPLIT.land, o)).toEqual({ height: 0, squash: 0 })
    let ph = 0
    let ps = 0
    for (let t = 0; t <= SPLIT.air + SPLIT.land + 0.02; t += 0.002) {
      splitHop(t, o)
      expect(Math.abs(o.height - ph)).toBeLessThan(0.05)
      expect(Math.abs(o.squash - ps)).toBeLessThan(0.02)
      ph = o.height
      ps = o.squash
    }
  })
})

describe('Footwork', () => {
  it('split step: starts on the event, hops once, lands ready; a second trigger mid-hop is ignored', () => {
    const f = new Footwork()
    expect(f.splitAge).toBe(Infinity)
    f.splitStep()
    expect(f.splitAge).toBe(0)
    for (let i = 0; i < 6; i++) f.update(1 / 60, false, 0, 1)
    const age = f.splitAge
    f.splitStep()
    expect(f.splitAge).toBe(age)
    for (let i = 0; i < 60; i++) f.update(1 / 60, false, 0, 1)
    f.splitStep()
    expect(f.splitAge).toBe(0)
  })

  it('lunge rises while wanted, holds through the shot, then eases out (no pops)', () => {
    const f = new Footwork()
    let prev = 0
    let peak = 0
    for (let i = 0; i < 120; i++) {
      f.update(1 / 60, i < 12, -0.6, 0.8)
      expect(Math.abs(f.lunge - prev)).toBeLessThan(0.35)
      prev = f.lunge
      peak = Math.max(peak, f.lunge)
      // Still lunging just after the reach ends (the hold covers the swing).
      if (i === 12 + Math.floor((LUNGE.hold * 60) / 2)) expect(f.lunge).toBeGreaterThan(0.8)
    }
    expect(peak).toBeGreaterThan(0.9)
    expect(f.lunge).toBeLessThan(0.02)
  })

  it('turns toward the shuttle while lunging (capped), back to 0 after', () => {
    const f = new Footwork()
    for (let i = 0; i < 20; i++) f.update(1 / 60, true, -1, 0.2)
    expect(f.turn()).toBeLessThan(-0.5)
    expect(f.turn()).toBeGreaterThanOrEqual(-LUNGE.yawMax - 1e-9)
    for (let i = 0; i < 120; i++) f.update(1 / 60, false, 0, 1)
    expect(Math.abs(f.turn())).toBeLessThan(0.02)
  })

  it('a same-tick trigger (dt = 0) still lunges and turns on the following frames', () => {
    const f = new Footwork()
    f.update(0, true, -1, 0.3)
    expect(f.lunge).toBe(0)
    for (let i = 0; i < 9; i++) f.update(1 / 60, false, 0, 1)
    expect(f.lunge).toBeGreaterThan(0.9)
    expect(f.turn()).toBeLessThan(-0.6)
  })

  it('is dt-independent (30 / 60 / 144 fps give the same lunge + split)', () => {
    const run = (fps: number) => {
      const f = new Footwork()
      f.splitStep()
      // Reach wanted for the first 1/6 s, 0.5 s in all (whole frames at every rate).
      for (let i = 0; i < fps / 2; i++) f.update(1 / fps, i < fps / 6, 0.5, 0.5)
      return [f.lunge, f.splitAge, f.turn()]
    }
    const a = run(60)
    for (const fps of [30, 144]) {
      const b = run(fps)
      for (let k = 0; k < a.length; k++) expect(b[k]).toBeCloseTo(a[k], 2)
    }
  })

  it('reset: grounded, no lunge', () => {
    const f = new Footwork()
    f.splitStep()
    f.update(0.1, true, 1, 0)
    f.reset()
    expect(f.lunge).toBe(0)
    expect(f.turn()).toBe(0)
    expect(f.splitAge).toBe(Infinity)
  })
})
