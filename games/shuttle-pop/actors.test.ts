import { describe, expect, it } from 'vitest'
import { BufferGeometry, Mesh, MeshBasicMaterial, Object3D, Vector3 } from 'three'
import { createChibi, PRESETS, restPose } from './actors'
import { STRIKE_END } from './arm'
import { SwingDriver } from './moves'

// Rig checks with real three.js transforms (no WebGL needed).
function rig(preset = 0) {
  const chibi = createChibi(preset)
  const named = (n: string) => chibi.root.getObjectByName(n)!
  let streak: Mesh | null = null
  chibi.root.traverse((o) => {
    if (o instanceof Mesh && o.material instanceof MeshBasicMaterial && o.material.vertexColors && !o.name)
      streak = o
  })
  return { chibi, frame: named('racketHead'), head: named('head'), streak: streak! }
}

/** Meshes that would draw (visible all the way up). */
function drawn(root: Object3D): Mesh[] {
  const out: Mesh[] = []
  root.traverseVisible((o) => {
    if (o instanceof Mesh) out.push(o)
  })
  return out
}

describe('chibi rig', () => {
  it('limbs are jointed chains: shoulder → upper arm → elbow → forearm → wrist → hand, hip → thigh → knee → shin', () => {
    const { chibi } = rig()
    const parentName = (m: Object3D) => m.parent!
    const by = (n: string) => {
      const out: Object3D[] = []
      chibi.root.traverse((o) => o.name === n && out.push(o))
      return out
    }
    for (const n of ['upperArm', 'foreArm', 'hand', 'thigh', 'shin']) expect(by(n)).toHaveLength(2)
    for (const shin of by('shin')) {
      const knee = parentName(shin)
      const hip = knee.parent!
      expect(hip.children).toContain(by('thigh').find((t) => t.parent === hip))
      expect(knee.position.y).toBeLessThan(0)
    }
    for (const hand of by('hand')) {
      const wrist = hand.parent!
      const elbow = wrist.parent!
      expect(elbow.children.some((c) => c.name === 'foreArm')).toBe(true)
      expect(elbow.parent!.children.some((c) => c.name === 'upperArm')).toBe(true)
    }
  })

  it('every preset builds with ≤ 16 draw calls per chibi (twin outline + streak only when shown), shadow casters = torso, head, racket', () => {
    for (let n = 0; n < PRESETS.length; n++) {
      const { chibi } = rig(n)
      expect(drawn(chibi.root).length).toBeLessThanOrEqual(16)
      chibi.setPreset(n, true)
      expect(drawn(chibi.root).length).toBeLessThanOrEqual(17)
      const casters: string[] = []
      chibi.root.traverse((o) => o instanceof Mesh && o.castShadow && casters.push(o.name))
      expect(casters.sort()).toEqual(['head', 'racket', 'torso'])
      for (const m of drawn(chibi.root))
        expect((m.geometry as BufferGeometry).getAttribute('position').count).toBeGreaterThan(0)
    }
  })

  it('both players on one preset share every geometry (built once per look)', () => {
    const a = rig(2).chibi
    const b = rig(2).chibi
    const geos = (c: typeof a) => drawn(c.root).map((m) => m.geometry)
    expect(geos(a)).toEqual(geos(b))
    geos(a).forEach((g, i) => expect(g).toBe(geos(b)[i]))
  })

  it('the far twin: an outline shell around the whole head (hair, hats) and a face dimmed like the body', () => {
    for (let n = 0; n < PRESETS.length; n++) {
      const { chibi } = rig(n)
      const head = chibi.root.getObjectByName('head') as Mesh
      const face = chibi.root.getObjectByName('face') as Mesh
      const hull = head.parent!.children.find((c) => c.name === 'hull') as Mesh
      expect(hull.visible).toBe(false)
      const near = (face.material as MeshBasicMaterial).color.clone()
      chibi.setPreset(n, true)
      expect(hull.visible).toBe(true)
      const hb = hull.geometry.boundingSphere!
      const mb = head.geometry.boundingSphere!
      expect(hb.radius).toBeGreaterThan(mb.radius)
      const far = (face.material as MeshBasicMaterial).color
      expect(far.r + far.g + far.b).toBeLessThan(near.r + near.g + near.b - 0.3)
    }
  })

  it('the face morphs: smash effort and a happy point move its influences', () => {
    const { chibi } = rig()
    const face = chibi.root.getObjectByName('face') as Mesh
    const p = restPose()
    p.happy = 1
    chibi.setPose(p, 1)
    expect(face.morphTargetInfluences![0]).toBeCloseTo(1)
    p.happy = 0
    p.smash = 1
    chibi.setPose(p, 1)
    expect(face.morphTargetInfluences![2]).toBeCloseTo(1)
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
    for (const [smash, ready, stance, lunge] of [
      [0, 0, 0, 0],
      [0.5, 0, 0, 0],
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [1, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 1, 1, 0],
      [1, 1, 1, 0],
      [0, 0, 1, 1],
    ]) {
      const p = restPose()
      p.smash = smash
      p.ready = ready
      p.stance = stance
      p.lunge = lunge
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
      { run: 1, stance: 1, side: 1, fwd: 0, happy: 0 },
      { run: 1, stance: 1, side: 0, fwd: -1, happy: 0 },
      { run: 0, stance: 1, split: 1, happy: 0 },
    ])
      for (let st = 0; st < 1; st += 0.02) {
        Object.assign(p, pose)
        p.stride = st
        chibi.setPose(p, st * 3)
        check()
      }
    // Head radius 0.36 + frame half-width 0.13 (oval, 0.18 along the shaft): the frame's centre stays (about) outside both, so the
    // racket at most grazes the head's silhouette.
    expect(closest).toBeGreaterThan(0.36 + 0.14)
  })

  it('stance, lunge and split step blend in without pops (racket + feet move a little per step)', () => {
    const { chibi, frame } = rig()
    const shins: Object3D[] = []
    chibi.root.traverse((o) => o.name === 'shin' && shins.push(o))
    const pts = [frame, ...shins]
    const prev = pts.map(() => new Vector3())
    const cur = new Vector3()
    const p = restPose()
    for (const key of ['stance', 'lunge', 'split'] as const) {
      Object.assign(p, restPose(), { stance: key === 'stance' ? 0 : 1 })
      for (let w = 0; w <= 1.0001; w += 0.01) {
        p[key] = w
        chibi.setPose(p, 0)
        chibi.root.updateMatrixWorld(true)
        pts.forEach((o, i) => {
          o.getWorldPosition(cur)
          if (w > 0) expect(cur.distanceTo(prev[i])).toBeLessThan(0.02)
          prev[i].copy(cur)
        })
      }
    }
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
