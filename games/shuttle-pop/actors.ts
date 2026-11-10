// Shuttle Pop chibis: big round head (~55% of the height), small body in a badminton kit, stubby
// jointed limbs, a racket in the right hand. What a character looks like is data (presets.ts → Look) fed
// to builder tables (model/*); every bone's rigid parts are merged into ONE vertex-coloured mesh, shared
// by all chibis wearing that look, so a chibi is ~16 draw calls (+ up to 3 animated extras: tail, ears,
// wings, antenna; a legless look hides its 4 leg meshes). Poses are procedural and allocate
// nothing: the gait / swing / leap curves and the joint angles are pure (locomotion.ts, moves.ts, arm.ts,
// legs.ts, model/face.ts), this file only applies them to the rig.
//
// Model space: feet at y = 0, facing +z, right hand on −x (model/dims.ts). The upper body (chest, head,
// arms) twists and bends on a torso pivot at the hips; each arm is a jointed chain (shoulder → upper arm
// → elbow → forearm → wrist → mitten) whose round ends overlap at the joints, so it bends softly; each
// leg is hip → thigh → knee → shin + sneaker. The racket sits in the right mitten and follows the wrist.
// The face is one morphing mesh (moods blend: happy / sad / effort / blink).

import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  Object3D,
  Vector3,
  type Material,
  type Texture,
} from 'three'
import { basePose, CH, streakGlow, swingPose, upper, type BaseIn, type SwingIn, type Upper } from './arm'
import { lateralShare } from './footwork'
import { legAngles, legOut, type LegDims, type LegIn } from './legs'
import { glideParams, strideParams, type Glide, type Stride } from './locomotion'
import { ARM, HEAD_Y, HIP_X, HIP_Y, LEG, RACKET, SHOULDER_X, SHOULDER_Y } from './model/dims'
import { extraOut, extraPose, type FlairIn } from './flair'
import type { ExtraSpec } from './model/extras'
import { blinkAt, faceMix } from './model/face'
import { legless, rigOf } from './model/look'
import { HEAD_SCALE } from './model/head'
import { modelOf } from './model/model'
import { celebrateSpin, hop, type Hop } from './moves'
import { PRESETS } from './presets'

export { PRESETS, type Preset } from './presets'

/**
 * Everything the rig needs for one frame. Continuous values only (the renderer damps every weight), so
 * moving between states blends instead of popping.
 */
export interface ChibiPose {
  /** Damped speed share 0..1 (stride size, bob, arm swing). */
  run: number
  /** Stride phase in cycles (left foot plants at 0, right at 0.5). */
  stride: number
  /** Velocity share in the body frame: + forward / − backpedal, + toward local +x. Lean + leg direction. */
  fwd: number
  side: number
  /**
   * Swing (SwingDriver): loaded share 0..1, s since release (< 0 = none), a previous strike settling
   * (< 0 = none), s spent coiling in a hold.
   */
  load: number
  strike: number
  prev: number
  coil: number
  /** The last swing's hold-to-charge power 0..1: a brighter, longer swing streak. */
  power: number
  /** 0 = plain swing, 1 = overhead smash (damped by the renderer). */
  smash: number
  /** Jump height share 0..1. */
  jump: number
  /** + squash / − stretch (start / turn springs, landings, the Perfect accent). */
  squash: number
  /** Extra forward lean (rad): the stop overshoot. */
  lean: number
  /**
   * Badminton ready stance 0..1 (waiting and moving, dropped for moods): racket up, off hand up, knees
   * bent, torso forward, a gentle bounce when still; footwork from the gait (shuffle / steps).
   */
  stance: number
  /** Lunge 0..1 (footwork.ts): racket-side knee bent in front, back leg extended, low and leaning. */
  lunge: number
  /** Split-step hop height share 0..1 (footwork.ts splitHop; its landing squash rides on `squash`). */
  split: number
  /** Weights 0..1: shuttle incoming (a little lower), smash crouch, point won, point lost, match won. */
  ready: number
  crouch: number
  happy: number
  sad: number
  cheer: number
  /** Head yaw (rad): the idle glance. */
  look: number
}

/** A pose at rest (fresh object). */
export function restPose(): ChibiPose {
  return {
    run: 0,
    stride: 0,
    fwd: 0,
    side: 0,
    load: 0,
    strike: -1,
    prev: -1,
    coil: 0,
    power: 0,
    smash: 0,
    jump: 0,
    squash: 0,
    lean: 0,
    stance: 0,
    lunge: 0,
    split: 0,
    ready: 0,
    crouch: 0,
    happy: 0,
    sad: 0,
    cheer: 0,
    look: 0,
  }
}

export interface Chibi {
  root: Object3D
  /** `t` = seconds (drives run cycles, breathing, celebrations). */
  setPose(p: ChibiPose, t: number): void
  /** Swap the look. `alt` = the far twin when both sides wear the same preset (tinted + outlined). */
  setPreset(preset: number, alt?: boolean): void
}

const OUTLINE = 0x3b2f4a
/** Shade mixed into the far twin's colours. */
const ALT_SHADE = 0.32
const ALT_SHADE_COLOR = new Color(0x4a3f5c)

// Pose tuning (arm and torso angles are arm.ts, leg joints legs.ts).
const JUMP_H = 0.55
/** Point-won hop height (m); the match winner hops this much higher. */
const HOP_H = 0.13
const HOP_H_WIN = 0.12
/** Lean (rad) per unit forward / side velocity share. */
const LEAN_FWD = 0.3
const LEAN_SIDE = 0.22
/** Squash per unit of crouch / ready / sad. */
const SQUASH_CROUCH = 0.12
const SQUASH_READY = 0.04
/** Knee bend (hip flex, rad) per unit of stance / incoming ready (extra, when planted) / crouch. */
const BEND_STANCE = 0.26
const BEND_READY = 0.08
const BEND_CROUCH = 0.38
/**
 * Stance: legs apart (rad), torso forward (rad), side lean kept on a shuffle (share), steps shortened
 * (share of the stride amplitude). Lunge lean (rad). Split step: hop height (m), legs apart in the air.
 */
const STANCE = { splay: 0.15, lean: 0.14, sideLean: 0.4, short: 0.4 }
const LUNGE_LEAN = 0.18
const SPLIT_H = 0.07
const SPLIT_SPLAY = 0.1
/** Waiting bounce on the balls of the feet: rad/s, lift (m), extra knee bend at the bottom (rad). */
const BOUNCE = { w: 12.5, h: 0.012, bend: 0.07 }
const BREATHE = 0.015
/** Head turns back against this share of the torso twist (eyes stay on the shuttle). */
const HEAD_COUNTER = 0.6
/** Effort face per s of coiling in a held charge (reaches full in 1 / this s). */
const EFFORT_COIL = 3
/**
 * Swing streak: a ribbon swept by the racket head (from `inner` m along the handle axis to the far rim)
 * over the last `life` s of the swing, `samples` + 1 points along it; peak opacity.
 */
/** `power`: extra life / opacity share at a full-charge swing. */
const STREAK = { samples: 10, life: 0.09, opacity: 0.75, inner: 0.5, power: 0.6 }

// Scratch for setPose (shared: setPose never re-enters).
const stride: Stride = { freq: 0, amp: 0, bob: 0 }
const hopO: Hop = { height: 0, squash: 0 }
const baseIn: BaseIn = { run: 0, stride: 0, ready: 0, happy: 0, sad: 0, wave: 0 }
const swingIn: SwingIn = { load: 0, strike: -1, prev: -1, coil: 0 }
const legIn: LegIn = {
  cycle: 0,
  amp: 0,
  along: 0,
  across: 0,
  tuck: 0,
  splay: 0,
  bend: 0,
  phase: 0,
  dir: 1,
  lunge: 0,
}
const legO = legOut()
const glideO: Glide = { lift: 0, squash: 0 }
const base = upper()
const ang = upper()
const v3 = new Vector3()

const flairIn: FlairIn = { t: 0, seed: 0, run: 0, stride: 0, happy: 0, sad: 0, cheer: 0, jump: 0 }
const exO = extraOut()
/** Extra-bone pivots per chibi (3 extras, each possibly a mirrored pair). */
const PIVOTS = 6

let shadowGeo: BufferGeometry | null = null

/**
 * Soft contact shadow: a disc in the xy plane whose black fades from the centre (alpha 1) through a mid
 * ring to nothing at the rim (vertex alpha), so it reads as a soft occlusion pool under the feet.
 */
function contactShadow(r: number, seg: number): BufferGeometry {
  const pos = [0, 0, 0]
  const col = [0, 0, 0, 1]
  const rings: [number, number][] = [
    [0.55, 0.75],
    [1, 0],
  ]
  for (const [k, a] of rings)
    for (let i = 0; i < seg; i++) {
      const t = (i / seg) * Math.PI * 2
      pos.push(Math.cos(t) * r * k, Math.sin(t) * r * k, 0)
      col.push(0, 0, 0, a)
    }
  const idx: number[] = []
  for (let i = 0; i < seg; i++) idx.push(0, 1 + i, 1 + ((i + 1) % seg))
  for (let i = 0; i < seg; i++) {
    const a = 1 + i
    const b = 1 + ((i + 1) % seg)
    idx.push(a, a + seg, b, b, a + seg, b + seg)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 4))
  g.setIndex(idx)
  return g
}

const materials = new Map<string, Material>()
function cached<M extends Material>(key: string, make: () => M): M {
  let m = materials.get(key) as M | undefined
  if (!m) materials.set(key, (m = make()))
  return m
}
/** The unlit face / light material; the far twin's face dims with its body. */
function faceMat(alt: boolean): MeshBasicMaterial {
  return cached(alt ? 'faceAlt' : 'face', () => {
    const color = new Color(0xffffff)
    if (alt) color.lerp(ALT_SHADE_COLOR, ALT_SHADE)
    // Blended: the toy faces' blush fades out at its edge (vertex alpha); everything else is opaque.
    return new MeshBasicMaterial({ color, vertexColors: true, transparent: true })
  })
}
/**
 * Toy render (the reference's studio look): physically based, per vertex surface (model/merge.ts SURFS:
 * roughness, clear coat, sheen in the `surf` attribute), so one merged bone mesh can hold soft skin, sheeny
 * fabric, matte knit and glossy hair / plastic in a single draw call. Lit by the scene lights plus an
 * environment map (setToyEnvironment: a procedural PMREM room) for soft reflections, and a fresnel rim
 * that lifts silhouettes off the court.
 *
 * Slow devices (setToyShading(false)): the clear-coat and sheen lobes and the rim drop. Both program
 * variants are compiled up front (Court3D.warm), so the switch never compiles mid-match.
 */
const TOY = { rim: 0.22, clearcoat: 1, sheen: 1 }
const toyUniforms = { toyRim: { value: TOY.rim } }
const TOY_VERTEX_HEAD = /* glsl */ `#include <common>
attribute vec3 surf;
varying vec3 vSurf;`
const TOY_FRAGMENT_HEAD = /* glsl */ `#include <common>
varying vec3 vSurf;
uniform float toyRim;`
/** Per vertex roughness. */
const TOY_ROUGHNESS = /* glsl */ `#include <roughnessmap_fragment>
roughnessFactor = vSurf.x;`
/** Per vertex clear coat + sheen weights. */
const TOY_LOBES = /* glsl */ `#include <lights_physical_fragment>
#ifdef USE_CLEARCOAT
  material.clearcoat *= vSurf.y;
#endif
#ifdef USE_SHEEN
  // Fabric sheen takes the fabric's own colour (no white haze).
  material.sheenColor *= vSurf.z * diffuseColor.rgb;
#endif`
const TOY_RIM = /* glsl */ `{
    vec3 toyN = normalize(normal);
    float toyF = pow(1.0 - clamp(dot(toyN, normalize(vViewPosition)), 0.0, 1.0), 3.0);
    outgoingLight += toyRim * toyF * (0.35 + 0.65 * diffuseColor.rgb);
  }
  #include <opaque_fragment>`

const kits: MeshPhysicalMaterial[] = []

/** Full toy lobes (clear coat, sheen, rim) on, or off for slow devices (no recompile once warmed). */
export function setToyShading(on: boolean): void {
  toyUniforms.toyRim.value = on ? TOY.rim : 0
  for (const m of kits) {
    if (m.clearcoat > 0 === on && m.sheen > 0 === on) continue
    m.clearcoat = on ? TOY.clearcoat : 0
    m.sheen = on ? TOY.sheen : 0
  }
}

/** Environment map (a PMREM texture) for every chibi material, at `intensity`; null removes it. */
export function setToyEnvironment(env: Texture | null, intensity = 1): void {
  for (const m of kits) {
    m.envMap = env
    m.envMapIntensity = intensity
    m.needsUpdate = true
  }
  toyEnv = { env, intensity }
}
let toyEnv: { env: Texture | null; intensity: number } = { env: null, intensity: 1 }

/** Toy vertex-colour material (the far twin's is shaded toward ALT_SHADE_COLOR). */
function kitMat(alt: boolean): MeshPhysicalMaterial {
  return cached(alt ? 'kitAlt' : 'kit', () => {
    const color = new Color(0xffffff)
    if (alt) color.lerp(ALT_SHADE_COLOR, ALT_SHADE)
    const m = new MeshPhysicalMaterial({
      color,
      vertexColors: true,
      roughness: 0.6,
      clearcoat: TOY.clearcoat,
      clearcoatRoughness: 0.28,
      sheen: TOY.sheen,
      sheenColor: new Color(0xffffff),
      sheenRoughness: 0.55,
      envMap: toyEnv.env,
      envMapIntensity: toyEnv.intensity,
    })
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, toyUniforms)
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', TOY_VERTEX_HEAD)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurf = surf;')
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', TOY_FRAGMENT_HEAD)
        .replace('#include <roughnessmap_fragment>', TOY_ROUGHNESS)
        .replace('#include <lights_physical_fragment>', TOY_LOBES)
        .replace('#include <opaque_fragment>', TOY_RIM)
    }
    m.customProgramCacheKey = () => 'toy'
    kits.push(m)
    return m
  })
}

/** Chibis built so far (offsets each one's blink). */
let built = 0

export function createChibi(preset: number): Chibi {
  const empty = new BufferGeometry()
  const kit = kitMat(false)
  /** Every kit-coloured bone mesh (geometry + material swap with the preset). */
  const bones: Mesh[] = []
  const bone = (name: string) => {
    const m = new Mesh(empty, kit)
    m.name = name
    bones.push(m)
    return m
  }
  const blinkSeed = (built++ * 1.37) % 3.4

  const root = new Group()
  // Ground shadow stays down when the rig jumps.
  const shadow = new Mesh(
    (shadowGeo ??= contactShadow(0.32, 20)),
    cached(
      'shadow',
      () =>
        new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.42, depthWrite: false }),
    ),
  )
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = 0.011
  const rig = new Group()
  root.add(shadow, rig)

  // Hips (shorts / skirt) stay with the legs; the upper body twists / bends about them.
  const hips = bone('hips')
  hips.position.y = HIP_Y
  const torso = new Group()
  torso.position.y = HIP_Y
  torso.rotation.order = 'YXZ'
  const chest = bone('torso')
  torso.add(chest)
  rig.add(hips, torso)

  // Legs: hip joint → thigh → knee joint → shin + sneaker. [0] = right (−x).
  const legs = [-1, 1].map((s) => {
    const hip = new Group()
    hip.position.set(s * HIP_X, HIP_Y, 0)
    const knee = new Group()
    knee.position.y = -LEG.thigh
    const thigh = bone('thigh')
    const shin = bone('shin')
    knee.add(shin)
    hip.add(thigh, knee)
    rig.add(hip)
    return { hip, knee, thigh, shin }
  })

  // Arms: [0] = right (racket) on −x, [1] = left. Shoulder (swing plane yaw, pitch, raise sideways) →
  // upper arm (roll) → elbow (bend) → wrist (flex) → mitten.
  const arms = [-1, 1].map((s) => {
    const shoulder = new Group()
    shoulder.position.set(s * SHOULDER_X, SHOULDER_Y - HIP_Y, 0)
    shoulder.rotation.order = 'YXZ'
    const roll = new Group()
    const elbow = new Group()
    elbow.position.y = -ARM.upper
    const wrist = new Group()
    wrist.position.y = -ARM.fore
    wrist.rotation.order = 'YXZ'
    const upperArm = bone('upperArm')
    const foreArm = bone('foreArm')
    const hand = bone('hand')
    wrist.add(hand)
    elbow.add(foreArm, wrist)
    roll.add(upperArm, elbow)
    shoulder.add(roll)
    torso.add(shoulder)
    return { side: s, shoulder, roll, elbow, wrist, upperArm, foreArm, hand }
  })
  // Racket: handle along the forearm (tipped forward a little), frame beyond. `racketHead` marks the
  // frame centre (no mesh).
  const racket = new Group()
  racket.position.y = -ARM.hand
  racket.rotation.x = Math.PI - RACKET.mount
  const racketMesh = bone('racket')
  const racketHead = new Object3D()
  racketHead.name = 'racketHead'
  racketHead.position.y = RACKET.head
  racket.add(racketMesh, racketHead)
  arms[0].wrist.add(racket)
  /** Racket chain from the frame up to the rig (local matrices only: no world update needed). */
  const racketChain: Object3D[] = [
    racket,
    arms[0].wrist,
    arms[0].elbow,
    arms[0].roll,
    arms[0].shoulder,
    torso,
  ]

  // Swing streak: a ribbon swept by the racket head, in rig space. Own geometry + material (per chibi).
  const streak = makeStreak()
  rig.add(streak.mesh)

  // Head: shape + hair + headwear (one mesh), the morphing face, the twin outline.
  const head = new Group()
  const headMesh = bone('head')
  const face = new Mesh(empty, faceMat(false))
  face.name = 'face'
  // Outline for the far twin: a back-faced shell around the head (per look: covers hair, hats, ears).
  const hullMat = cached('hull', () => new MeshBasicMaterial({ color: OUTLINE, side: BackSide }))
  const hull = new Mesh(empty, hullMat)
  hull.name = 'hull'
  head.add(headMesh, face, hull)
  head.position.y = HEAD_Y - HIP_Y
  torso.add(head)

  // Extra bones (tails, ears, wings, antenna): a pool of pivots, each with a kit mesh, an unlit light
  // mesh and an outline shell, re-parented and filled per look (setPreset); unused ones stay hidden.
  const parents = { hips, torso, head }
  const pivots = Array.from({ length: PIVOTS }, () => {
    const pivot = new Group()
    const mesh = new Mesh(empty, kit)
    mesh.name = 'extra'
    const glow = new Mesh(empty, faceMat(false))
    glow.name = 'glow'
    const shell = new Mesh(empty, hullMat)
    shell.name = 'hull'
    pivot.add(mesh, glow, shell)
    pivot.visible = false
    return { pivot, mesh, glow, shell, spec: null as ExtraSpec | null, k: 0 as 0 | 1 }
  })
  let used = 0
  let hasLegs = true
  let legKind: 'pair' | 'hop' | 'float' = 'pair'
  /** This chibi's leg lengths (its look's rig; legIn is shared scratch, so set per pose). */
  let legDims: LegDims = LEG

  // Real shadows (when the renderer has them on) from the three shapes that read in a long low-sun
  // shadow: body, head and racket. Everything else would only add shadow-pass draw calls.
  chest.castShadow = true
  headMesh.castShadow = true
  racketMesh.castShadow = true

  function setPreset(n: number, alt = false) {
    const p = PRESETS[Math.min(PRESETS.length - 1, Math.max(0, n | 0))]
    const g = modelOf(p)
    hasLegs = !legless(p.look)
    legKind = p.look.legs
    hips.rotation.set(0, 0, 0)
    // Joint layout of this look's rig.
    const r = rigOf(p.look)
    hips.position.y = r.hipY
    torso.position.y = r.hipY
    head.position.y = r.headY - r.hipY
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? -1 : 1
      legs[i].hip.position.set(s * r.hipX, r.hipY, 0)
      legs[i].knee.position.y = -r.thigh
      arms[i].shoulder.position.set(s * r.shoulderX, r.shoulderY - r.hipY, 0)
    }
    legDims = r
    for (const l of legs) l.hip.visible = hasLegs
    hips.geometry = g.hips
    chest.geometry = g.torso
    headMesh.geometry = g.head
    head.scale.setScalar(HEAD_SCALE[p.look.head])
    racketMesh.geometry = g.racket
    for (let i = 0; i < 2; i++) {
      legs[i].thigh.geometry = g.thigh
      legs[i].shin.geometry = g.shin
      arms[i].upperArm.geometry = g.upperArm
      arms[i].foreArm.geometry = g.foreArm[i]
      arms[i].hand.geometry = g.hand[i]
    }
    const mat = kitMat(alt)
    for (const m of bones) m.material = mat
    if (face.geometry !== g.face) {
      face.geometry = g.face
      face.updateMorphTargets()
    }
    face.material = faceMat(alt)
    hull.geometry = g.hull
    hull.visible = alt
    used = 0
    for (const e of g.extras)
      for (let k = 0; k < (e.spec.pair ? 2 : 1); k++) {
        const v = pivots[used++]
        v.spec = e.spec
        v.k = k as 0 | 1
        parents[e.spec.parent].add(v.pivot)
        const [x, y, z] = e.spec.at
        v.pivot.position.set(k ? -x : x, y, z)
        v.pivot.scale.x = k ? -1 : 1
        v.pivot.rotation.set(0, 0, 0)
        v.pivot.visible = true
        v.mesh.geometry = e.geo
        v.mesh.material = mat
        v.glow.geometry = e.glow ?? empty
        v.glow.material = faceMat(alt)
        v.glow.visible = e.glow !== null
        v.shell.geometry = e.hull ?? empty
        v.shell.visible = alt && e.hull !== null
      }
    for (let i = used; i < PIVOTS; i++) {
      pivots[i].pivot.visible = false
      pivots[i].spec = null
    }
  }

  /** Extra bones from their channels (flair.ts). */
  function applyExtras(p: ChibiPose, t: number) {
    flairIn.t = t
    flairIn.seed = blinkSeed
    flairIn.run = p.run
    flairIn.stride = p.stride
    flairIn.happy = p.happy
    flairIn.sad = p.sad
    flairIn.cheer = p.cheer
    flairIn.jump = p.jump
    for (let i = 0; i < used; i++) {
      const v = pivots[i]
      extraPose(v.spec!.channel, v.k, flairIn, exO)
      v.pivot.rotation.set(exO.rx, exO.ry, exO.rz)
      if (v.glow.geometry !== empty) v.glow.visible = exO.glow
    }
  }

  /** The point `k` m along the racket's handle axis (frame centre = RACKET.head) in rig space, into `v3`. */
  function racketPoint(k: number): Vector3 {
    v3.set(0, k, 0)
    for (let i = 0; i < racketChain.length; i++) {
      racketChain[i].updateMatrix()
      v3.applyMatrix4(racketChain[i].matrix)
    }
    return v3
  }

  /** Joint channels (arm.ts) → torso and arm transforms. */
  function applyUpper(ang: Upper) {
    torso.rotation.y = -ang[CH.twist]
    torso.rotation.x = ang[CH.bend]
    for (let i = 0; i < 2; i++) {
      const a = arms[i]
      const o = i === 0 ? CH.rAcross : CH.lAcross
      const right = i === 0
      a.shoulder.rotation.y = -a.side * ang[o]
      a.shoulder.rotation.x = ang[o + 1]
      a.shoulder.rotation.z = a.side * ang[o + 2]
      a.roll.rotation.y = right ? -a.side * ang[CH.rRoll] : 0
      a.elbow.rotation.x = -ang[right ? CH.rElbow : CH.lElbow]
      a.wrist.rotation.y = right ? ang[CH.rTurn] : 0
      a.wrist.rotation.x = right ? -ang[CH.rWrist] : -0.2
    }
  }

  function setPose(p: ChibiPose, t: number) {
    strideParams(p.run, stride)
    const cycle = Math.sin(Math.PI * 2 * p.stride)
    hop(t, hopO)
    const happy = p.happy
    const sad = p.sad
    const calm = (1 - p.run) * (1 - happy)
    const planted = 1 - Math.min(1, p.run * 2)
    const st = p.stance
    // Incoming shuttle: a little lower, only while (nearly) planted.
    const ready = p.ready * planted
    // Waiting bounce on the balls of the feet (0 = bottom, knees most bent).
    const bounceW = st * planted * (1 - happy) * (1 - sad) * (1 - p.lunge)
    const bounce = (1 - Math.cos(t * BOUNCE.w)) * 0.5

    // Legs (legs.ts): short scissor steps forward / back, a chassé on a side shuffle (footwork.ts picks
    // by the body-frame move), wide + knees bent in the stance / crouch (the rig lowers to keep the feet
    // down), the lunge, tucked mid-air.
    const across = lateralShare(p.fwd, p.side)
    legIn.cycle = cycle
    legIn.amp = stride.amp * (1 - STANCE.short * st)
    legIn.along = 1 - across
    legIn.across = across
    legIn.phase = p.stride
    legIn.dir = p.side
    legIn.lunge = p.lunge
    legIn.leg = legDims
    legIn.tuck = p.jump * 0.7 + hopO.height * happy * 0.4 + p.split * 0.3
    legIn.splay = STANCE.splay * st + 0.2 * p.crouch + SPLIT_SPLAY * p.split
    legIn.bend =
      BEND_STANCE * st + BEND_READY * ready + BEND_CROUCH * p.crouch + BOUNCE.bend * (1 - bounce) * bounceW
    legAngles(legIn, legO)
    for (let i = 0; i < 2; i++) {
      legs[i].hip.rotation.x = legO.hipX[i]
      legs[i].hip.rotation.z = legO.hipZ[i]
      legs[i].knee.rotation.x = legO.knee[i]
    }

    // Whole rig: bob (2 per stride, lowest at the plants), jump, hops, shuffle hop, split step, bounce.
    let y = (stride.bob * (1 - Math.cos(4 * Math.PI * p.stride))) / 2
    y += p.jump * JUMP_H + hopO.height * (HOP_H + p.cheer * HOP_H_WIN) * happy
    y += p.split * SPLIT_H + bounce * BOUNCE.h * bounceW
    let glideSquash = 0
    let drop = 0
    if (hasLegs) {
      y += legO.lift
      drop = legO.drop
    } else {
      // No legs: hop (slime) or float (ghost) from the same gait; the ghost's hem trails the move.
      glideParams(legKind === 'hop' ? 'hop' : 'float', p.run, p.stride, t, glideO)
      y += glideO.lift
      glideSquash = glideO.squash
      if (legKind === 'float') hips.rotation.set(0.35 * p.fwd * p.run, 0, -0.3 * p.side * p.run)
    }
    rig.position.y = y - drop
    rig.rotation.x =
      LEAN_FWD * p.fwd +
      p.lean +
      STANCE.lean * st +
      0.04 * ready +
      0.1 * p.crouch +
      0.08 * sad +
      LUNGE_LEAN * p.lunge
    rig.rotation.z = -LEAN_SIDE * p.side * (1 - STANCE.sideLean * st)
    rig.rotation.y = celebrateSpin(t) * p.cheer

    // Squash / stretch about the feet (rig origin): springs, crouch, landings, breathing.
    let sq =
      p.squash +
      glideSquash +
      hopO.squash * happy +
      SQUASH_CROUCH * p.crouch +
      SQUASH_READY * ready +
      0.05 * sad
    sq -= Math.sin(t * (sad ? 1.6 : 3)) * BREATHE * calm
    rig.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5)

    // Upper body (arm.ts): base pose (idle / run counter-swing / ready stance / moods) with the swing on
    // top. The stance arms don't depend on the legs (legless looks can use them as is).
    baseIn.run = Math.min(1, p.run * 1.6)
    baseIn.stride = p.stride
    baseIn.ready = Math.max(st, p.ready)
    baseIn.happy = happy
    baseIn.sad = sad
    baseIn.wave = Math.sin(t * 9) * 0.25
    basePose(baseIn, base)
    swingIn.load = p.load
    swingIn.coil = p.coil
    swingIn.prev = p.prev

    // Streak: the racket head's path over the last STREAK.life s, re-sampled from the (pure) swing pose
    // at fixed sub-times every frame, so it is a smooth arc at any frame rate. The current pose goes last
    // and stays on the rig.
    const glow = p.strike >= 0 ? streakGlow(p.strike) : 0
    const trail = glow > 0.02
    const N = STREAK.samples
    const boost = 1 + STREAK.power * p.power
    for (let k = trail ? N : 0; k >= 0; k--) {
      const back = (k * STREAK.life * boost) / N
      swingIn.strike = k === 0 ? p.strike : p.strike - back
      swingIn.prev = k === 0 || p.prev < 0 ? p.prev : Math.max(0, p.prev - back)
      swingPose(base, swingIn, p.smash, ang)
      applyUpper(ang)
      if (trail) {
        const fade = Math.min(1, STREAK.opacity * boost * glow) * (1 - k / (N + 1))
        const c = racketPoint(STREAK.inner)
        streak.set(N - k, c.x, c.y, c.z, fade * 0.35)
        const r = racketPoint(RACKET.tip)
        streak.set(N - k, r.x, r.y, r.z, fade, true)
      }
    }
    if (trail) streak.commit()
    streak.mesh.visible = trail

    // Ground shadow shrinks as the rig leaves the ground.
    shadow.scale.setScalar(1 - Math.min(0.4, y * 0.6))

    // Face: idle glance (against the torso twist), moods + blinks on the morphing face (face.ts).
    head.rotation.x = 0.35 * sad - 0.06 * Math.max(st, ready) - ang[CH.bend] * 0.5
    head.rotation.y = p.look * calm * (1 - p.ready) + HEAD_COUNTER * ang[CH.twist]
    head.rotation.z = happy * Math.sin(t * 9) * 0.08
    const effort = Math.max(p.smash, Math.min(1, p.coil * EFFORT_COIL) * p.load)
    if (face.morphTargetInfluences)
      faceMix(happy, sad, effort, blinkAt(t, blinkSeed), face.morphTargetInfluences)
    if (used > 0) applyExtras(p, t)
  }

  setPreset(preset)
  setPose(restPose(), 0)
  return { root, setPose, setPreset }
}

/**
 * Racket streak ribbon: STREAK.samples + 1 racket-head points (inner, far rim), oldest first, as a quad
 * strip. Vertex colours carry the fade (additive blending: black = invisible). Buffers are allocated
 * once per chibi; a frame only writes into them.
 */
function makeStreak() {
  const n = STREAK.samples + 1
  const pos = new Float32Array(n * 2 * 3)
  const col = new Float32Array(n * 2 * 3)
  const geo = new BufferGeometry()
  const posAttr = new BufferAttribute(pos, 3)
  const colAttr = new BufferAttribute(col, 3)
  geo.setAttribute('position', posAttr)
  geo.setAttribute('color', colAttr)
  const index: number[] = []
  for (let k = 0; k < n - 1; k++) {
    const a = k * 2
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  geo.setIndex(index)
  const mat = new MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  })
  const mesh = new Mesh(geo, mat)
  mesh.visible = false
  mesh.frustumCulled = false
  return {
    mesh,
    /** Point `i` (0 = oldest), its inner (`outer` false) or far-rim vertex, with brightness `f`. */
    set(i: number, x: number, y: number, z: number, f: number, outer = false) {
      const v = (i * 2 + (outer ? 1 : 0)) * 3
      pos[v] = x
      pos[v + 1] = y
      pos[v + 2] = z
      col[v] = col[v + 1] = col[v + 2] = f
    },
    commit() {
      posAttr.needsUpdate = true
      colAttr.needsUpdate = true
    },
  }
}
