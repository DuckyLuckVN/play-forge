import { describe, expect, it } from 'vitest'
import {
  BufferGeometry,
  CapsuleGeometry,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three'
import { createChibi, restPose } from './actors'
import { STRIKE_END } from './arm'
import { SwingDriver } from './moves'

// Rig checks with real three.js transforms (no WebGL needed).
function rig() {
  const chibi = createChibi(0)
  let frame: Mesh | null = null
  let head: Mesh | null = null
  const capsules: Mesh[] = []
  let streak: Mesh | null = null
  chibi.root.traverse((o) => {
    if (!(o instanceof Mesh)) return
    if (o.geometry instanceof TorusGeometry && o.geometry.parameters.radius === 0.16) frame = o
    if (o.geometry instanceof SphereGeometry && o.geometry.parameters.radius === 0.36) head = o
    if (o.geometry instanceof CapsuleGeometry) capsules.push(o)
    if (o.material instanceof MeshBasicMaterial && o.material.vertexColors) streak = o
  })
  return { chibi, frame: frame!, head: head!, capsules, streak: streak! }
}

describe('chibi rig', () => {
  it('arms are jointed chains: upper arm + forearm capsules per arm (plus legs and body)', () => {
    const { capsules } = rig()
    expect(capsules).toHaveLength(2 * 2 + 2 + 1)
  })

  it('the racket never cuts through the head: swing, smash, run, ready, cheer (behind-camera readability)', () => {
    const { chibi, frame, head } = rig()
    const fc = new Vector3()
    const hc = new Vector3()
    let closest = Infinity
    const check = () => {
      chibi.root.updateMatrixWorld(true)
      frame.getWorldPosition(fc)
      head.getWorldPosition(hc)
      closest = Math.min(closest, fc.distanceTo(hc))
    }
    for (const [smash, ready] of [
      [0, 0],
      [0.5, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ]) {
      const p = restPose()
      p.smash = smash
      p.ready = ready
      const d = new SwingDriver()
      d.press()
      for (let t = 0; t < STRIKE_END + 0.6; t += 1 / 240) {
        // Held loaded (coiling) for 0.3 s, then the strike.
        d.update(1 / 240, Math.max(0, 0.45 - t))
        p.load = d.load
        p.strike = d.strike
        p.prev = d.prev
        p.coil = d.coil
        chibi.setPose(p, t)
        check()
      }
    }
    const p = restPose()
    for (const pose of [
      { run: 1, ready: 0, happy: 0 },
      { run: 0, ready: 1, happy: 0 },
      { run: 0, ready: 0, happy: 1 },
    ])
      for (let st = 0; st < 1; st += 0.02) {
        Object.assign(p, pose)
        p.stride = st
        chibi.setPose(p, st * 3)
        check()
      }
    // Head radius 0.36 + frame radius 0.16: the frame's centre stays (about) outside both, so the
    // racket at most grazes the head's silhouette.
    expect(closest).toBeGreaterThan(0.36 + 0.14)
  })

  it('the swing streak is the same smooth arc at 30 and 60 fps (re-sampled, no frame history)', () => {
    const at = (fps: number) => {
      const { chibi, streak } = rig()
      const p = restPose()
      const d = new SwingDriver()
      d.press()
      // Run to the same swing time (0.2 s after the press) at `fps`.
      for (let f = 0; f < fps * 0.2; f++) {
        d.update(1 / fps)
        p.load = d.load
        p.strike = d.strike
        p.prev = d.prev
        chibi.setPose(p, f / fps)
      }
      expect(streak.visible).toBe(true)
      return Array.from((streak.geometry as BufferGeometry).getAttribute('position').array)
    }
    const a = at(30)
    const b = at(60)
    expect(a.length).toBeGreaterThan(30)
    for (let i = 0; i < a.length; i++) expect(b[i]).toBeCloseTo(a[i], 5)
  })
})
