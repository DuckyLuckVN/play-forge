import { describe, expect, it } from 'vitest'
import { CapsuleGeometry, Mesh, SphereGeometry, TorusGeometry, Vector3 } from 'three'
import { createChibi, restPose } from './actors'
import { STRIKE_END } from './arm'
import { SwingDriver } from './moves'

// Rig checks with real three.js transforms (no WebGL needed).
function rig() {
  const chibi = createChibi(0)
  let frame: Mesh | null = null
  let head: Mesh | null = null
  const capsules: Mesh[] = []
  chibi.root.traverse((o) => {
    if (!(o instanceof Mesh)) return
    if (o.geometry instanceof TorusGeometry && o.geometry.parameters.radius === 0.16) frame = o
    if (o.geometry instanceof SphereGeometry && o.geometry.parameters.radius === 0.36) head = o
    if (o.geometry instanceof CapsuleGeometry) capsules.push(o)
  })
  return { chibi, frame: frame!, head: head!, capsules }
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
      for (let t = 0; t < STRIKE_END + 0.1; t += 1 / 240) {
        d.update(1 / 240)
        p.load = d.load
        p.strike = d.strike
        p.prev = d.prev
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
})
