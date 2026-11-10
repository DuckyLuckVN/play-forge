import { describe, expect, it } from 'vitest'
import {
  BufferGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  Object3D,
  Vector3,
  type Material,
} from 'three'
import { createChibi, PRESETS, restPose, setToyShading } from './actors'
import { STRIKE_END } from './arm'
import { SwingDriver } from './moves'
import { BOX_HEAD, HEAD_R } from './model/dims'
import { EXTRAS, extraMeshes } from './model/extras'
import { HEAD_SCALE, HEAD_SIZE } from './model/head'
import { legless, rigOf } from './model/look'
import { modelOf } from './model/model'

// Rig checks with real three.js transforms (no WebGL needed).
function rig(preset = 0) {
  const chibi = createChibi(preset)
  const named = (n: string) => chibi.root.getObjectByName(n)!
  return { chibi, frame: named('racketHead'), head: named('head'), streak: named('streak') as Mesh }
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

  it('every preset builds with ≤ 19 draw calls per chibi (16 + ≤ 3 extras; legless −4; twin outline + streak only when shown), shadow casters = torso, head, racket', () => {
    for (let n = 0; n < PRESETS.length; n++) {
      const { chibi } = rig(n)
      const look = PRESETS[n].look
      const extras = modelOf(PRESETS[n]).extras
      const expected = 16 - (legless(look) ? 4 : 0) + extras.reduce((a, e) => a + extraMeshes(e.spec), 0)
      expect(drawn(chibi.root).length, PRESETS[n].name).toBe(expected)
      expect(expected).toBeLessThanOrEqual(19)
      chibi.setPreset(n, true)
      const hulls = extras.reduce((a, e) => a + (e.hull ? (e.spec.pair ? 2 : 1) : 0), 0)
      expect(drawn(chibi.root).length).toBe(expected + 1 + hulls)
      const casters: string[] = []
      chibi.root.traverse((o) => o instanceof Mesh && o.castShadow && casters.push(o.name))
      expect(casters.sort()).toEqual(['head', 'racket', 'torso'])
      for (const m of drawn(chibi.root))
        expect((m.geometry as BufferGeometry).getAttribute('position').count).toBeGreaterThan(0)
    }
  })

  it('switching looks re-uses the extra-bone pool: no leftovers from the previous look', () => {
    const { chibi } = rig(0)
    const count = () => drawn(chibi.root).length
    const base = count()
    for (let n = 0; n < PRESETS.length; n++) chibi.setPreset(n)
    chibi.setPreset(0)
    expect(count()).toBe(base)
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

describe('face material', () => {
  it('only faces with faded decals (the toy blush) blend; the others draw opaque', () => {
    const { chibi } = rig()
    const face = chibi.root.getObjectByName('face') as Mesh
    const blends: boolean[] = []
    for (let n = 0; n < PRESETS.length; n++)
      for (const alt of [false, true]) {
        chibi.setPreset(n, alt)
        const blend = modelOf(PRESETS[n]).faceBlend
        expect((face.material as MeshBasicMaterial).transparent, PRESETS[n].name).toBe(blend)
        blends.push(blend)
      }
    // The four humans' blush fades; some animal faces have none (or a hard-edged one).
    expect(blends.slice(0, 8).every(Boolean)).toBe(true)
    expect(blends.some((b) => !b)).toBe(true)
  })
})

describe('toy shading toggle (governor)', () => {
  /** What three.js keys a material's program on that the toggle could touch (clear coat / sheen defines). */
  const programState = (m: MeshPhysicalMaterial) => ({
    clearcoat: m.clearcoat > 0,
    sheen: m.sheen > 0,
    key: m.customProgramCacheKey(),
    version: m.version,
  })
  /** The toy uniforms the material's patched shader reads (onBeforeCompile on a stub shader). */
  function uniformsOf(m: MeshPhysicalMaterial): Record<string, { value: number }> {
    const sh = { uniforms: {}, vertexShader: '', fragmentShader: '' }
    m.onBeforeCompile(sh as never, null as never)
    return sh.uniforms as Record<string, { value: number }>
  }

  it('off / on only moves uniforms: no program-affecting state changes (no recompile mid-match)', () => {
    const { chibi } = rig()
    chibi.setPreset(0, true)
    const mats = new Set<MeshPhysicalMaterial>()
    for (const alt of [false, true]) {
      chibi.setPreset(0, alt)
      chibi.root.traverse((o) => {
        if (o instanceof Mesh && o.material instanceof MeshPhysicalMaterial) mats.add(o.material)
      })
    }
    expect(mats.size).toBe(2)
    const before = [...mats].map(programState)
    setToyShading(false)
    expect([...mats].map(programState)).toEqual(before)
    for (const m of mats) {
      const u = uniformsOf(m)
      expect(u.toyRim.value).toBe(0)
      expect(u.toyLobes.value).toBe(0)
    }
    setToyShading(true)
    expect([...mats].map(programState)).toEqual(before)
    for (const m of mats) {
      const u = uniformsOf(m)
      expect(u.toyRim.value).toBeGreaterThan(0)
      expect(u.toyLobes.value).toBe(1)
    }
  })
})

describe('fade (local player covering the shuttle)', () => {
  it('setOpacity(<1) swaps every kit/face/extra mesh to transparent variants; 1 restores the exact originals', () => {
    const { chibi } = rig(0)
    const meshes: Mesh[] = []
    chibi.root.traverse((o) => {
      if (o instanceof Mesh && o.name !== 'hull') meshes.push(o)
    })
    const before = meshes.map((m) => m.material)
    chibi.setOpacity(0.5)
    const faded = meshes.filter((m) => m.name !== 'streak' && m.name !== 'shadow')
    expect(faded.length).toBeGreaterThan(10)
    for (const m of faded) {
      const mat = m.material as Material
      expect(mat.transparent && mat.opacity, m.name).toBe(0.5)
      expect(mat.depthWrite, m.name).toBe(true)
    }
    chibi.setOpacity(1)
    expect(meshes.map((m) => m.material)).toEqual(before)
    for (let i = 0; i < meshes.length; i++) expect(meshes[i].material).toBe(before[i])
  })

  it('opacity changes while fading only write .opacity (no material swap); crossing 1 restores originals', () => {
    const { chibi } = rig(0)
    const meshes: Mesh[] = []
    chibi.root.traverse((o) => {
      if (o instanceof Mesh && o.name !== 'hull') meshes.push(o)
    })
    const before = meshes.map((m) => m.material)
    chibi.setOpacity(0.5)
    const faded = meshes.map((m) => m.material)
    for (const a of [0.6, 0.7, 0.55]) {
      chibi.setOpacity(a)
      expect(meshes.map((m) => m.material)).toEqual(faded)
      for (let i = 0; i < meshes.length; i++) {
        expect(meshes[i].material).toBe(faded[i])
        if (faded[i] !== before[i]) expect((faded[i] as Material).opacity).toBe(a)
      }
    }
    chibi.setOpacity(1)
    for (let i = 0; i < meshes.length; i++) expect(meshes[i].material).toBe(before[i])
  })

  it('a preset swap while faded stays faded; the far twin (alt) never fades by itself', () => {
    const { chibi } = rig(0)
    chibi.setOpacity(0.6)
    chibi.setPreset(2)
    expect(((chibi.root.getObjectByName('head') as Mesh).material as Material).opacity).toBe(0.6)
    expect(((chibi.root.getObjectByName('face') as Mesh).material as Material).opacity).toBe(0.6)
    chibi.setOpacity(1)
    const twin = rig(1).chibi
    twin.setPreset(1, true)
    expect(((twin.root.getObjectByName('head') as Mesh).material as Material).transparent).toBe(false)
  })

  it('fade is pure opacity: same colour / emissive / shading as the normal materials, no tint', () => {
    const { chibi } = rig(0)
    const byName = (n: string) => (chibi.root.getObjectByName(n) as Mesh).material as MeshPhysicalMaterial
    const normal = { head: byName('head'), face: byName('face') }
    chibi.setOpacity(0.5)
    const faded = { head: byName('head'), face: byName('face') }
    for (const k of ['head', 'face'] as const) {
      const a = normal[k]
      const b = faded[k]
      expect(b).not.toBe(a)
      expect(b.type).toBe(a.type)
      expect(b.color.getHex()).toBe(a.color.getHex())
      expect(b.vertexColors).toBe(a.vertexColors)
      if ('emissive' in a) expect(b.emissive.getHex()).toBe(a.emissive.getHex())
      for (const p of ['roughness', 'metalness', 'clearcoat', 'sheen', 'envMapIntensity'] as const)
        if (p in a) expect(b[p], p).toBe(a[p])
      expect(b.transparent).toBe(true)
      expect(b.opacity).toBe(0.5)
    }
    chibi.setOpacity(1)
  })

  it('two chibis (same look) fade independently: own opacity each, either restores on its own', () => {
    const a = rig(0).chibi
    const b = rig(0).chibi
    const head = (c: typeof a) => (c.root.getObjectByName('head') as Mesh).material as Material
    const original = head(a)
    a.setOpacity(0.4)
    b.setOpacity(0.7)
    expect(head(a)).not.toBe(head(b))
    expect(head(a).opacity).toBe(0.4)
    expect(head(b).opacity).toBe(0.7)
    a.setOpacity(1)
    expect(head(a)).toBe(original)
    expect(head(b).opacity).toBe(0.7)
    b.setOpacity(1)
    expect(head(b)).toBe(original)
  })

  it('fade variants reuse the toy program key (no new shader family) and keep the draw-call count', () => {
    const { chibi } = rig(0)
    const calls = drawn(chibi.root).length
    chibi.setOpacity(0.5)
    const m = (chibi.root.getObjectByName('head') as Mesh).material as MeshPhysicalMaterial
    expect(m.customProgramCacheKey()).toBe('toy')
    expect(drawn(chibi.root).length).toBe(calls)
    chibi.setOpacity(1)
  })
})

describe('head size', () => {
  it('every look: head group scaled by HEAD_SIZE, bottom stays where it was, racket/hands unscaled', () => {
    for (const p of PRESETS) {
      const { chibi } = rig(p.id)
      const head = chibi.root.getObjectByName('head')!.parent!
      const r = rigOf(p.look)
      const k = HEAD_SCALE[p.look.head]
      expect(head.scale.x).toBeCloseTo(k * HEAD_SIZE, 9)
      const half = p.look.head === 'box' ? BOX_HEAD.b : HEAD_R
      expect(head.position.y + r.hipY - half * head.scale.x).toBeCloseTo(r.headY - half * k, 9)
      const ws = new Vector3()
      chibi.root.updateMatrixWorld(true)
      chibi.root.getObjectByName('racket')!.getWorldScale(ws)
      expect(ws.x).toBeCloseTo(1, 9)
    }
  })
  it('head extras (ears, antenna: ExtraSpec parent "head") ride in the scaled head group', () => {
    for (const p of PRESETS) {
      const { chibi } = rig(p.id)
      const head = chibi.root.getObjectByName('head')!.parent!
      const extras = head.children.filter((c) => c.visible && c.children.some((m) => m.name === 'extra'))
      const want = p.look.extras.filter((e) => EXTRAS[e].parent === 'head').length
      expect(extras.length >= want, p.name).toBe(true)
    }
  })
})
