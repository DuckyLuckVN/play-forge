import { Frustum, Matrix4, PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { COURT, stepShuttle, type Flight, type Vec3 } from './physics'
import { launchFor, shotTarget } from './shots'
import { CAMERA, cameraPose, dampFocus, isTwinAlt, lerpV, moodOf, viewOf } from './world'

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
  const pose = { x: 0, y: 0, z: 0, lookX: 0, lookY: 0, lookZ: 0 }

  function view(cam: PerspectiveCamera, playerX: number, focus: number) {
    cameraPose(playerX, focus, pose)
    cam.position.set(pose.x, pose.y, pose.z)
    cam.lookAt(pose.lookX, pose.lookY, pose.lookZ)
    cam.updateMatrixWorld()
    frustum.setFromProjectionMatrix(m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse))
  }

  for (const [label, aspect] of [
    ['16:9', 16 / 9],
    ['19.5:9 phone', 19.5 / 9],
  ] as const)
    for (const playerX of [0, -COURT.halfWidth, COURT.halfWidth].map((x) => x * CAMERA.followX))
      it(`${label}, camera x ${playerX.toFixed(2)}: shuttle on screen ≥ 95% of every high shot, all court corners always`, () => {
        const cam = new PerspectiveCamera(CAMERA.fov, aspect, 0.1, 200)
        for (const [name, pts] of Object.entries(flights)) {
          let focus = 1
          let seen = 0
          for (const s of pts) {
            focus = dampFocus(focus, s.y, 1 / 60)
            view(cam, playerX, focus)
            if (frustum.containsPoint(p.set(s.x, s.y, s.z))) seen++
            for (const c of corners)
              expect(frustum.containsPoint(c), `${name}: corner ${c.x},${c.z}`).toBe(true)
          }
          expect(seen / pts.length, name).toBeGreaterThanOrEqual(0.95)
        }
      })

  it('moves the look-at smoothly (small per-tick steps) and rests on the floor between rallies', () => {
    for (const [name, pts] of Object.entries(flights)) {
      let focus = 1
      let last = cameraPose(0, focus, pose).lookY
      for (const s of pts) {
        focus = dampFocus(focus, s.y, 1 / 60)
        const y = cameraPose(0, focus, pose).lookY
        expect(Math.abs(y - last), name).toBeLessThan(0.1) // ≤ ~0.4° of tilt a tick
        last = y
      }
    }
    expect(cameraPose(0, 1, pose).lookY).toBe(0)
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
