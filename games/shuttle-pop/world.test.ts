import { Frustum, Matrix4, PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { COURT, stepShuttle, type Flight, type Vec3 } from './physics'
import { launchFor, shotTarget } from './shots'
import type { SpEvent } from './sim'
import {
  CAMERA,
  CAMERA_TIGHT,
  CHEER,
  cameraPose,
  framingTightness,
  cheerLevel,
  CORRECT,
  correct,
  dampFocus,
  interpShuttle,
  isTwinAlt,
  lerpV,
  moodOf,
  rallyHits,
  swingTick,
  viewOf,
} from './world'

describe('view mapping', () => {
  it('keeps side 0 as is', () => {
    expect(viewOf(0).flip).toBe(1)
  })

  it('mirrors (x, z) → (−x, −z) for side 1, so the local player is always near', () => {
    const { flip } = viewOf(1)
    const p = { x: 1.2, z: 4.5 }
    expect([p.x * flip, p.z * flip]).toEqual([-1.2, -4.5])
  })
})

describe('interpShuttle', () => {
  it('lerps a flight step, snaps a placement', () => {
    const out = { x: 0, y: 0, z: 0 }
    const o = { x: 0, y: 0, z: 0 }
    const a = interpShuttle(o, { x: 1, y: 0, z: 0 }, 0.25, out)
    expect(a.pos.x).toBeCloseTo(0.25)
    expect(a.snap).toBe(false)
    const b = interpShuttle(o, { x: 2.5, y: 0, z: 0 }, 0.25, out)
    expect(b.pos.x).toBe(2.5)
    expect(b.snap).toBe(true)
  })
})

describe('lerpV', () => {
  const a = { x: 1, y: 2, z: 3 }
  const b = { x: -3, y: 6, z: 0 }

  it('hits both endpoints and the midpoint', () => {
    const out = { x: 0, y: 0, z: 0 }
    expect(lerpV(a, b, 0, out)).toEqual(a)
    expect(lerpV(a, b, 1, out)).toEqual(b)
    expect(lerpV(a, b, 0.5, out)).toEqual({ x: -1, y: 4, z: 1.5 })
  })

  it('writes into out and returns it (no allocation)', () => {
    const out = { x: 0, y: 0, z: 0 }
    expect(lerpV(a, b, 0.25, out)).toBe(out)
  })
})

describe('camera framing', () => {
  // Perfect clears and long serves, both directions (render space, local player near at z < 0).
  function flight(kind: 'clear' | 'serveLong', side: 0 | 1, back: number, y: number): Vec3[] {
    const dir = side === 0 ? 1 : -1
    const from = { x: 0.5 * dir, y, z: -dir * back }
    const v = launchFor(kind, 'perfect', from, shotTarget(kind, side, 0), () => 0)
    const f: Flight = { pos: { ...from }, vel: v }
    const out: Vec3[] = []
    while (f.pos.y > 0 && out.length < 600) {
      stepShuttle(f)
      out.push({ ...f.pos })
    }
    return out
  }
  const flights = {
    'clear from my back court': flight('clear', 0, COURT.halfLen - 1.2, 2.2),
    'clear from their back court': flight('clear', 1, COURT.halfLen - 1.2, 2.2),
    'clear from my front court': flight('clear', 0, 2, 2.5),
    'clear from their front court': flight('clear', 1, 2, 2.5),
    'my long serve': flight('serveLong', 0, COURT.shortLine + 0.5, 1),
    'their long serve': flight('serveLong', 1, COURT.shortLine + 0.5, 1),
  }
  const corners = [-1, 1].flatMap((sx) =>
    [-1, 1].map((sz) => new Vector3(sx * COURT.halfWidth, 0, sz * COURT.halfLen)),
  )
  const frustum = new Frustum()
  const m = new Matrix4()
  const p = new Vector3()
  const pose = { x: 0, y: 0, z: 0, lookX: 0, lookY: 0, lookZ: 0, fov: 0 }

  function view(cam: PerspectiveCamera, playerX: number, focus: number, tight: number) {
    cameraPose(playerX, focus, pose, tight)
    cam.fov = pose.fov
    cam.updateProjectionMatrix()
    cam.position.set(pose.x, pose.y, pose.z)
    cam.lookAt(pose.lookX, pose.lookY, pose.lookZ)
    cam.updateMatrixWorld()
    frustum.setFromProjectionMatrix(m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse))
  }

  // Desktop 16:9, a phone in landscape (19.5:9), and a phone canvas under the shell bar (short, ~2.6:1).
  // Every framing from roomy (0) to tight (1) must hold on each of them.
  const cases: [string, number, number[]][] = [
    ['16:9', 16 / 9, [0, 0.5, 1]],
    ['19.5:9 phone', 19.5 / 9, [0, 0.5, 1]],
    ['short phone canvas 2.6:1', 2.6, [0, 0.5, 1]],
    // The real desktop canvas at 1280×720 (shell bar + gutters), at the blend it actually gets.
    ['desktop canvas 1248×639', 1248 / 639, [framingTightness(1248, 639)]],
  ]
  for (const [label, aspect, tights] of cases)
    for (const tight of tights)
      for (const playerX of [0, -COURT.halfWidth, COURT.halfWidth].map((x) => x * CAMERA.followX))
        it(`${label}, tightness ${tight.toFixed(2)}, camera x ${playerX.toFixed(2)}: shuttle on screen ≥ 95% of every high shot, all court corners always`, () => {
          const cam = new PerspectiveCamera(CAMERA.fov, aspect, 0.1, 200)
          for (const [name, pts] of Object.entries(flights)) {
            let focus = 1
            let seen = 0
            for (const s of pts) {
              focus = dampFocus(focus, s.y, 1 / 60)
              view(cam, playerX, focus, tight)
              if (frustum.containsPoint(p.set(s.x, s.y, s.z))) seen++
              for (const c of corners)
                expect(frustum.containsPoint(c), `${name}: corner ${c.x},${c.z}`).toBe(true)
            }
            expect(seen / pts.length, name).toBeGreaterThanOrEqual(0.95)
          }
          // At rest, a player reaching up (2.6 m) at any corner is on screen too.
          view(cam, playerX, 1, tight)
          for (const c of corners)
            expect(frustum.containsPoint(p.set(c.x, 2.6, c.z)), `overhead at ${c.x},${c.z}`).toBe(true)
        })

  it('tight framing draws the players bigger at rest (the phone readability fix)', () => {
    const cam = new PerspectiveCamera(CAMERA.fov, 2.6, 0.1, 200)
    const tall = (tight: number, z: number) => {
      view(cam, 0, 1, tight)
      const a = p.set(0, 0, z).project(cam).y
      return (p.set(0, 1.5, z).project(cam).y - a) / 2
    }
    expect(tall(1, -5) / tall(0, -5)).toBeGreaterThan(1.5) // near player
    expect(tall(1, 5) / tall(0, 5)).toBeGreaterThan(1.4) // far player
    expect(CAMERA_TIGHT.fov).toBeLessThan(CAMERA.fov)
  })

  it('tightness: roomy at 16:9 and taller, tight on wide or short canvases, blended between', () => {
    expect(framingTightness(1920, 1080)).toBe(0)
    expect(framingTightness(1024, 768)).toBe(0)
    expect(framingTightness(844, 390)).toBe(1) // phone landscape
    expect(framingTightness(812, 320)).toBe(1) // phone under the shell bar
    expect(framingTightness(640, 360)).toBe(1) // small 16:9 window
    const mid = framingTightness(1280, 660)
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(1)
    expect(framingTightness(0, 0)).toBe(0)
  })

  it('moves the look-at and zoom smoothly (small per-tick steps) and rests on the floor between rallies', () => {
    for (const tight of [0, 1])
      for (const [name, pts] of Object.entries(flights)) {
        let focus = 1
        cameraPose(0, focus, pose, tight)
        let lastY = pose.lookY
        let lastFov = pose.fov
        for (const s of pts) {
          focus = dampFocus(focus, s.y, 1 / 60)
          cameraPose(0, focus, pose, tight)
          expect(Math.abs(pose.lookY - lastY), name).toBeLessThan(0.1) // ≤ ~0.4° of tilt a tick
          expect(Math.abs(pose.fov - lastFov), name).toBeLessThan(0.5) // a gentle zoom, never a jump
          lastY = pose.lookY
          lastFov = pose.fov
        }
      }
    expect(cameraPose(0, 1, pose).lookY).toBe(0)
    expect(cameraPose(0, 1, pose, 1).fov).toBe(CAMERA_TIGHT.fov)
  })
})

describe('poses', () => {
  it('moodOf: idle in play, winner of the point happy / loser sad, match winner at over', () => {
    expect(moodOf('rally', -1, 1, 0)).toBe('idle')
    expect(moodOf('serve', -1, 1, 1)).toBe('idle')
    expect(moodOf('point', -1, 1, 1)).toBe('happy')
    expect(moodOf('point', -1, 1, 0)).toBe('sad')
    expect(moodOf('point', -1, -1, 0)).toBe('idle')
    expect(moodOf('over', 0, 1, 0)).toBe('happy')
    expect(moodOf('over', 0, 1, 1)).toBe('sad')
  })

  it('isTwinAlt: only the far player, only on the same preset', () => {
    expect(isTwinAlt(2, 2, 1, 0)).toBe(true)
    expect(isTwinAlt(2, 2, 0, 0)).toBe(false)
    expect(isTwinAlt(2, 2, 0, 1)).toBe(true)
    expect(isTwinAlt(1, 2, 1, 0)).toBe(false)
  })
})

describe('crowd', () => {
  const run = (kinds: SpEvent['k'][]) => kinds.reduce(rallyHits, 0)

  it('counts hits since the last serve or point', () => {
    expect(run(['serve', 'hit', 'hit', 'land', 'net', 'whiff'])).toBe(2)
    expect(run(['hit', 'hit', 'point'])).toBe(0)
    expect(run(['hit', 'hit', 'hit', 'serve', 'hit'])).toBe(1)
  })

  it('stays quiet in a short rally and cheers from the rally threshold, louder as it goes on', () => {
    expect(cheerLevel(CHEER.rally - 1, Infinity, 0)).toBe(0)
    const at = cheerLevel(CHEER.rally, Infinity, 0)
    expect(at).toBeGreaterThan(0)
    expect(cheerLevel(CHEER.rally + 4, Infinity, 0)).toBeGreaterThan(at)
    expect(cheerLevel(CHEER.rally + 100, Infinity, 0)).toBe(1)
  })

  it('cheers every point for a moment, loudest after a long rally', () => {
    const short = cheerLevel(0, 0.2, 3)
    expect(short).toBeGreaterThan(0)
    expect(cheerLevel(0, 0.2, CHEER.rally)).toBe(1)
    expect(cheerLevel(0, 0.2, CHEER.rally)).toBeGreaterThan(short)
    expect(cheerLevel(0, CHEER.pointTime + 0.01, CHEER.rally)).toBe(0)
  })
})

describe('guest prediction correction', () => {
  const out = { x: 0, z: 0 }
  it('keeps the prediction when the error is under 5 cm', () => {
    correct({ x: 1, z: 2 }, { x: 1.03, z: 2.03 }, out)
    expect(out).toEqual({ x: 1, z: 2 })
  })
  it('blends 15% per 60 Hz frame toward the authority under 1 m', () => {
    correct({ x: 0, z: 0 }, { x: 0.5, z: 0 }, out)
    expect(out.x).toBeCloseTo(0.5 * CORRECT.blend)
    expect(out.z).toBe(0)
  })
  it('the blend is frame-rate independent: two 120 Hz frames = one 60 Hz frame', () => {
    const half = { x: 0, z: 0 }
    correct({ x: 0, z: 0 }, { x: 0.8, z: 0 }, half, 1 / 120)
    correct(half, { x: 0.8, z: 0 }, half, 1 / 120)
    correct({ x: 0, z: 0 }, { x: 0.8, z: 0 }, out, 1 / 60)
    expect(half.x).toBeCloseTo(out.x, 10)
  })
  it('snaps when 1 m or more off', () => {
    correct({ x: 0, z: 0 }, { x: 0.6, z: 0.8 }, out)
    expect(out).toEqual({ x: 0.6, z: 0.8 })
  })
  it('may write into the prediction itself', () => {
    const p = { x: 0, z: 0 }
    correct(p, { x: 0, z: 0.4 }, p)
    expect(p.z).toBeCloseTo(0.4 * CORRECT.blend)
  })
})

describe('swing tick', () => {
  it('the tick on screen in history terms: curr, +1 past the halfway point', () => {
    expect(swingTick(100, 0)).toBe(100)
    expect(swingTick(100, 0.5)).toBe(100)
    expect(swingTick(100, 0.51)).toBe(101)
    expect(swingTick(100, 1)).toBe(101)
  })
})
