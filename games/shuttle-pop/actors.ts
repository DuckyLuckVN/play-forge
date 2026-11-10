// Shuttle Pop chibis: big round head (~55% of the height), small body in a badminton kit, stubby
// jointed limbs, a racket in the right hand. What a character looks like is data (presets.ts → Look) fed
// to builder tables (model/*); every bone's rigid parts are merged into ONE vertex-coloured mesh, shared
// by all chibis wearing that look, so a chibi is ~16 draw calls. Poses are procedural and allocate
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
  CircleGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  Vector3,
  type Material,
} from 'three'
import { basePose, CH, streakGlow, swingPose, upper, type BaseIn, type SwingIn, type Upper } from './arm'
import { legAngles, legOut, type LegIn } from './legs'
import { strideParams, type Stride } from './locomotion'
import { ARM, HEAD_R, HEAD_Y, HIP_X, HIP_Y, LEG, RACKET, SHOULDER_X, SHOULDER_Y } from './model/dims'
import { blinkAt, faceMix } from './model/face'
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
  /** Weights 0..1: ready stance (shuttle incoming), smash crouch, point won, point lost, match won. */
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
const SQUASH_READY = 0.05
/** Knee bend (hip flex, rad) per unit of ready / crouch. */
const BEND_READY = 0.22
const BEND_CROUCH = 0.38
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
const legIn: LegIn = { cycle: 0, amp: 0, along: 0, across: 0, tuck: 0, splay: 0, bend: 0 }
const legO = legOut()
const base = upper()
const ang = upper()
const v3 = new Vector3()

let shared: { shadow: BufferGeometry; hull: BufferGeometry } | null = null
function sharedGeos() {
  return (shared ??= {
    shadow: new CircleGeometry(0.3, 18),
    hull: new SphereGeometry(HEAD_R * 1.07, 24, 16),
  })
}

const materials = new Map<string, Material>()
function cached<M extends Material>(key: string, make: () => M): M {
  let m = materials.get(key) as M | undefined
  if (!m) materials.set(key, (m = make()))
  return m
}
/** Smooth pastel vertex-colour material (the far twin's is shaded toward ALT_SHADE_COLOR). */
function kitMat(alt: boolean): MeshStandardMaterial {
  return cached(alt ? 'kitAlt' : 'kit', () => {
    const color = new Color(0xffffff)
    if (alt) color.lerp(ALT_SHADE_COLOR, ALT_SHADE)
    return new MeshStandardMaterial({ color, vertexColors: true, roughness: 0.78 })
  })
}

/** Chibis built so far (offsets each one's blink). */
let built = 0

export function createChibi(preset: number): Chibi {
  const S = sharedGeos()
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
    S.shadow,
    cached(
      'shadow',
      () => new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.2, depthWrite: false }),
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
  const face = new Mesh(
    empty,
    cached('face', () => new MeshBasicMaterial({ vertexColors: true })),
  )
  face.name = 'face'
  // Outline for the far twin: a back-faced shell around the head.
  const hull = new Mesh(
    S.hull,
    cached('hull', () => new MeshBasicMaterial({ color: OUTLINE, side: BackSide })),
  )
  head.add(headMesh, face, hull)
  head.position.y = HEAD_Y - HIP_Y
  torso.add(head)

  // Real shadows (when the renderer has them on) from the three shapes that read in a long low-sun
  // shadow: body, head and racket. Everything else would only add shadow-pass draw calls.
  chest.castShadow = true
  headMesh.castShadow = true
  racketMesh.castShadow = true

  function setPreset(n: number, alt = false) {
    const p = PRESETS[Math.min(PRESETS.length - 1, Math.max(0, n | 0))]
    const g = modelOf(p.look)
    hips.geometry = g.hips
    chest.geometry = g.torso
    headMesh.geometry = g.head
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
    hull.visible = alt
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
    // Ready stance only while (nearly) planted: running keeps its full stride and arm swing.
    const ready = p.ready * (1 - Math.min(1, p.run * 2))

    // Legs (legs.ts): scissor along the move with the back-swing knee folding, open/close on a side
    // shuffle, wide + knees bent in a ready / crouch (the rig lowers to keep the feet down), tucked mid-air.
    const mag = Math.abs(p.fwd) + Math.abs(p.side) + 1e-6
    legIn.cycle = cycle
    legIn.amp = stride.amp
    legIn.along = Math.abs(p.fwd) / mag
    legIn.across = Math.abs(p.side) / mag
    legIn.tuck = p.jump * 0.7 + hopO.height * happy * 0.4
    legIn.splay = 0.16 * ready + 0.2 * p.crouch
    legIn.bend = BEND_READY * ready + BEND_CROUCH * p.crouch
    legAngles(legIn, legO)
    for (let i = 0; i < 2; i++) {
      legs[i].hip.rotation.x = legO.hipX[i]
      legs[i].hip.rotation.z = legO.hipZ[i]
      legs[i].knee.rotation.x = legO.knee[i]
    }

    // Whole rig: bob (2 per stride, lowest at the plants), jump, hops, a ready split-step bounce.
    let y = (stride.bob * (1 - Math.cos(4 * Math.PI * p.stride))) / 2
    y += p.jump * JUMP_H + hopO.height * (HOP_H + p.cheer * HOP_H_WIN) * happy
    y += ready * 0.025 * (1 - Math.cos(t * 9)) * 0.5
    rig.position.y = y - legO.drop
    rig.rotation.x = LEAN_FWD * p.fwd + p.lean + 0.12 * ready + 0.1 * p.crouch + 0.08 * sad
    rig.rotation.z = -LEAN_SIDE * p.side
    rig.rotation.y = celebrateSpin(t) * p.cheer

    // Squash / stretch about the feet (rig origin): springs, crouch, landings, breathing.
    let sq = p.squash + hopO.squash * happy + SQUASH_CROUCH * p.crouch + SQUASH_READY * ready + 0.05 * sad
    sq -= Math.sin(t * (sad ? 1.6 : 3)) * BREATHE * calm
    rig.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5)

    // Upper body (arm.ts): base pose (idle / run counter-swing / ready / moods) with the swing on top.
    baseIn.run = Math.min(1, p.run * 1.6)
    baseIn.stride = p.stride
    baseIn.ready = ready
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
    head.rotation.x = 0.35 * sad - 0.06 * ready - ang[CH.bend] * 0.5
    head.rotation.y = p.look * calm * (1 - p.ready) + HEAD_COUNTER * ang[CH.twist]
    head.rotation.z = happy * Math.sin(t * 9) * 0.08
    const effort = Math.max(p.smash, Math.min(1, p.coil * EFFORT_COIL) * p.load)
    if (face.morphTargetInfluences)
      faceMix(happy, sad, effort, blinkAt(t, blinkSeed), face.morphTargetInfluences)
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
