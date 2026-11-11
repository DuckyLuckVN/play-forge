// Test-only helpers for the camera framing tests (world.test.ts and world.simulation.test.ts).
import { Frustum, Matrix4, PerspectiveCamera, Vector3 } from 'three'
import { expect, it } from 'vitest'
import { COURT, stepShuttle, type CourtDims as FullCourt, type Flight, type Vec3 } from './physics'
import { courtDims, type CourtSize } from './courtsize'
import { launchFor, shotTarget } from './shots'
import {
  CAMERA,
  cameraPose,
  clampCameraTweak,
  dampFocus,
  framingTightness,
  type CameraTweak,
  type CourtDims,
} from './world'

// Perfect clears and long serves, both directions (render space, local player near at z < 0).
function flight(
  kind: 'clear' | 'serveLong',
  side: 0 | 1,
  back: number,
  y: number,
  court: FullCourt = COURT,
): Vec3[] {
  const dir = side === 0 ? 1 : -1
  const from = { x: 0.5 * dir, y, z: -dir * back }
  const v = launchFor(kind, 'perfect', from, shotTarget(kind, side, 0, court), () => 0, 0, court)
  const f: Flight = { pos: { ...from }, vel: v }
  const out: Vec3[] = []
  while (f.pos.y > 0 && out.length < 600) {
    stepShuttle(f)
    out.push({ ...f.pos })
  }
  return out
}
export const flightsFor = (court: FullCourt) => ({
  'clear from my back court': flight('clear', 0, court.halfLen - 1.2, 2.2, court),
  'clear from their back court': flight('clear', 1, court.halfLen - 1.2, 2.2, court),
  'clear from my front court': flight('clear', 0, 2, 2.5, court),
  'clear from their front court': flight('clear', 1, 2, 2.5, court),
  'my long serve': flight('serveLong', 0, court.shortLine + 0.5, 1, court),
  'their long serve': flight('serveLong', 1, court.shortLine + 0.5, 1, court),
})
export const cornersOf = (court: CourtDims) =>
  [-1, 1].flatMap((sx) => [-1, 1].map((sz) => new Vector3(sx * court.halfWidth, 0, sz * court.halfLen)))

/** Court lines' ends and the net posts: what must stay on screen at rest. */
export const keyPoints = (c: CourtDims) =>
  [-1, 1].flatMap((s) => [
    new Vector3(s * c.halfWidth, 0, -c.halfLen),
    new Vector3(s * c.halfWidth, 0, c.halfLen),
    new Vector3(s * c.halfWidth, c.netH, 0),
  ])

/** A canvas: label, aspect, the framing tightnesses it is checked at. */
export type AspectCase = [string, number, number[]]

// Desktop 16:9, a phone in landscape (19.5:9), and a phone canvas under the shell bar (short, ~2.6:1).
// Every framing from roomy (0) to tight (1) must hold on each of them.
export const CASES: AspectCase[] = [
  ['16:9', 16 / 9, [0, 0.5, 1]],
  ['19.5:9 phone', 19.5 / 9, [0, 0.5, 1]],
  ['short phone canvas 2.6:1', 2.6, [0, 0.5, 1]],
  // The real desktop canvas at 1280×720 (shell bar + gutters), at the blend it actually gets.
  ['desktop canvas 1248×639', 1248 / 639, [framingTightness(1248, 639)]],
]

/** Every height / tilt corner and edge of the tweak square. */
export const WANTS: CameraTweak[] = [
  { height: 1, tilt: 1 },
  { height: 1, tilt: -1 },
  { height: -1, tilt: 1 },
  { height: -1, tilt: -1 },
  { height: 1, tilt: 0 },
  { height: -1, tilt: 0 },
  { height: 0, tilt: 1 },
  { height: 0, tilt: -1 },
]

/**
 * One test per size × canvas × tightness × want: the clamped tweak keeps the key points in view at rest
 * and the court corners through every high shot. Call inside a describe.
 */
export function cameraTweakSweep(
  sizes: readonly CourtSize[],
  cases: AspectCase[],
  wants: CameraTweak[],
): void {
  const frustum = new Frustum()
  const m = new Matrix4()
  const pose = { x: 0, y: 0, z: 0, lookX: 0, lookY: 0, lookZ: 0, fov: 0 }
  const tweakView = (
    cam: PerspectiveCamera,
    camX: number,
    focus: number,
    tight: number,
    tw: CameraTweak,
    court: CourtDims,
  ) => {
    cameraPose(camX, focus, pose, tight, tw, court)
    cam.fov = pose.fov
    cam.updateProjectionMatrix()
    cam.position.set(pose.x, pose.y, pose.z)
    cam.lookAt(pose.lookX, pose.lookY, pose.lookZ)
    cam.updateMatrixWorld()
    frustum.setFromProjectionMatrix(m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse))
  }
  for (const size of sizes)
    for (const [label, aspect, tights] of cases)
      for (const tight of tights)
        for (const w of wants)
          it(`${size}: ${label} t=${tight.toFixed(2)} want ${w.height},${w.tilt}: clamped tweak keeps key points in view at rest and corners through every high shot`, () => {
            const court = courtDims(size)
            const cs = cornersOf(court)
            const c = clampCameraTweak(w, { aspect, tight, court })
            for (const k of ['height', 'tilt'] as const) {
              expect(Math.sign(c[k]) * Math.sign(w[k])).not.toBe(-1)
              expect(Math.abs(c[k])).toBeLessThanOrEqual(1)
            }
            const cam = new PerspectiveCamera(CAMERA.fov, aspect, 0.1, 200)
            for (const camX of [0, -court.halfWidth, court.halfWidth].map((x) => x * CAMERA.followX)) {
              tweakView(cam, camX, 1, tight, c, court)
              for (const q of keyPoints(court)) expect(frustum.containsPoint(q)).toBe(true)
              for (const [name, pts] of Object.entries(flightsFor(court))) {
                let focus = 1
                for (const s of pts) {
                  focus = dampFocus(focus, s.y, 1 / 60)
                  tweakView(cam, camX, focus, tight, c, court)
                  for (const q of cs)
                    expect(frustum.containsPoint(q), `${name}: corner ${q.x},${q.z}`).toBe(true)
                }
              }
            }
          })
}
