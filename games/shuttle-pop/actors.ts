// Shuttle Pop chibis: big round head (~55% of the height), tiny body, stubby limbs, a racket in the
// right hand, a hat per preset. Built from three.js primitives; every geometry and material is shared
// by all instances (materials are cached per colour). Poses are procedural and allocate nothing: the
// gait / swing / leap curves and the joint angles are pure (locomotion.ts, moves.ts, arm.ts), this file
// only applies them to the rig.
//
// Model space: feet at y = 0, facing +z, right hand on −x. Total height ≈ 1.3 m. The upper body (chest,
// head, arms) twists and bends on a torso pivot at the hips; each arm is a jointed chain (shoulder →
// upper arm → elbow → forearm → wrist → mitten) of capsules whose round ends overlap at the joints, so
// it bends softly. The racket sits in the right mitten and follows the wrist.

import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  CapsuleGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  AdditiveBlending,
  Vector3,
  type Material,
  type Object3D,
} from 'three'
import { basePose, CH, streakGlow, swingPose, upper, type BaseIn, type SwingIn } from './arm'
import { strideParams, type Stride } from './locomotion'
import { celebrateSpin, hop, type Hop } from './moves'

export type Hat = 'cap' | 'headband' | 'bow' | 'beanie'

export interface Preset {
  id: number
  /** English name; shown through the game's translator (VI in i18n.ts). */
  name: string
  /** Shirt colour. */
  body: number
  /** Hat + racket frame colour. */
  accent: number
  hat: Hat
}

/** Index = sim preset (0..3). The computer starts on 1, the player on 0. */
export const PRESETS: readonly Preset[] = [
  { id: 0, name: 'Berry', body: 0xff8fab, accent: 0xe8467c, hat: 'bow' },
  { id: 1, name: 'Cloud', body: 0x7cc6fe, accent: 0x3d74d6, hat: 'cap' },
  { id: 2, name: 'Sunny', body: 0xffd166, accent: 0xff8c42, hat: 'headband' },
  { id: 3, name: 'Mint', body: 0x9be7a8, accent: 0x2f9e7e, hat: 'beanie' },
]

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
  /** Swing: loaded share 0..1, s since release (< 0 = none), a previous strike settling (< 0 = none). */
  load: number
  strike: number
  prev: number
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
  /** Swap colours + hat. `alt` = the far twin when both sides wear the same preset (tinted + outlined). */
  setPreset(preset: number, alt?: boolean): void
}

const COLORS = {
  skin: 0xffe0c7,
  hair: 0x5a3e36,
  eye: 0x2b2233,
  blush: 0xff9eb5,
  white: 0xffffff,
  handle: 0x6b5b73,
  outline: 0x3b2f4a,
}

// Proportions (metres).
const HEAD_R = 0.36
const HEAD_Y = 0.94
const HIP_Y = 0.24
const SHOULDER_Y = 0.56
const SHOULDER_X = 0.2
/** Arm chain: upper arm / forearm length and radius, mitten centre past the wrist (m). Short + chubby. */
const ARM = { upper: 0.1, upperR: 0.056, fore: 0.088, foreR: 0.049, hand: 0.035 }
/** Racket in the mitten: handle → frame axis tipped this far forward of the forearm (rad). */
const RACKET_MOUNT = 0.35
/** Racket frame centre and far rim along the handle axis (m). */
const RACKET_HEAD = 0.42
const RACKET_TIP = 0.58
/** Shade mixed into the far twin's colours. */
const ALT_SHADE = 0.32
const ALT_SHADE_COLOR = new Color(0x4a3f5c)

// Pose tuning (arm and torso angles are arm.ts).
const JUMP_H = 0.55
/** Point-won hop height (m); the match winner hops this much higher. */
const HOP_H = 0.13
const HOP_H_WIN = 0.12
/** Lean (rad) per unit forward / side velocity share. */
const LEAN_FWD = 0.3
const LEAN_SIDE = 0.22
/** Squash per unit of crouch / ready / sad. */
const SQUASH_CROUCH = 0.16
const SQUASH_READY = 0.06
const BREATHE = 0.015
/** Head turns back against this share of the torso twist (eyes stay on the shuttle). */
const HEAD_COUNTER = 0.6
/**
 * Swing streak: a ribbon swept by the racket head (from `inner` along the handle axis to the far rim)
 * over the last `life` s, from up to `samples` recent frames; peak opacity.
 */
const STREAK = { samples: 14, life: 0.08, opacity: 0.75, inner: 0.5 }

// Scratch for setPose (shared: setPose never re-enters).
const stride: Stride = { freq: 0, amp: 0, bob: 0 }
const hopO: Hop = { height: 0, squash: 0 }
const baseIn: BaseIn = { run: 0, stride: 0, ready: 0, happy: 0, sad: 0, wave: 0 }
const swingIn: SwingIn = { load: 0, strike: -1, prev: -1 }
const base = upper()
const ang = upper()
const v3 = new Vector3()
const mix = (a: number, b: number, u: number) => a + (b - a) * u

interface Parts {
  head: BufferGeometry
  hull: BufferGeometry
  hair: BufferGeometry
  body: BufferGeometry
  limb: BufferGeometry
  upperArm: BufferGeometry
  foreArm: BufferGeometry
  hand: BufferGeometry
  shoe: BufferGeometry
  eye: BufferGeometry
  spark: BufferGeometry
  blush: BufferGeometry
  mouth: BufferGeometry
  shadow: BufferGeometry
  handle: BufferGeometry
  frame: BufferGeometry
  capDome: BufferGeometry
  capBrim: BufferGeometry
  band: BufferGeometry
  bowLoop: BufferGeometry
  knot: BufferGeometry
  beanieDome: BufferGeometry
  beanieRim: BufferGeometry
  pompom: BufferGeometry
}

let parts: Parts | null = null
function sharedParts(): Parts {
  if (parts) return parts
  const BEANIE_R = HEAD_R * 1.09
  parts = {
    head: new SphereGeometry(HEAD_R, 18, 14),
    hull: new SphereGeometry(HEAD_R * 1.07, 18, 14),
    hair: new SphereGeometry(HEAD_R * 1.04, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.42),
    body: new CapsuleGeometry(0.17, 0.14, 4, 10),
    limb: new CapsuleGeometry(0.065, 0.12, 3, 8),
    // Hanging from the joint (y = 0 → −length), round ends on both joints.
    upperArm: new CapsuleGeometry(ARM.upperR, ARM.upper, 4, 10).translate(0, -ARM.upper / 2, 0),
    foreArm: new CapsuleGeometry(ARM.foreR, ARM.fore, 4, 10).translate(0, -ARM.fore / 2, 0),
    hand: new SphereGeometry(0.065, 10, 8),
    shoe: new SphereGeometry(0.085, 10, 6),
    eye: new SphereGeometry(0.055, 10, 8),
    spark: new SphereGeometry(0.018, 6, 4),
    blush: new SphereGeometry(0.05, 10, 6),
    mouth: new TorusGeometry(0.05, 0.014, 6, 12, Math.PI),
    shadow: new CircleGeometry(0.3, 18),
    handle: new CylinderGeometry(0.022, 0.022, 0.26, 6),
    frame: new TorusGeometry(0.16, 0.025, 6, 18),
    capDome: new SphereGeometry(HEAD_R * 1.08, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.38),
    capBrim: new CylinderGeometry(0.2, 0.2, 0.03, 16),
    band: new TorusGeometry(Math.sqrt(HEAD_R * HEAD_R - 0.14 * 0.14) + 0.01, 0.04, 6, 24),
    bowLoop: new ConeGeometry(0.1, 0.17, 8),
    knot: new SphereGeometry(0.05, 8, 6),
    beanieDome: new SphereGeometry(BEANIE_R, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.42),
    beanieRim: new TorusGeometry(BEANIE_R * Math.sin(Math.PI * 0.42), 0.05, 6, 24),
    pompom: new SphereGeometry(0.08, 10, 8),
  }
  return parts
}

const materials = new Map<string, Material>()
/** Flat-shaded pastel material, cached per colour (+ shade for the far twin). */
function flat(hex: number, alt = false): MeshStandardMaterial {
  const key = `s${hex}${alt ? 'a' : ''}`
  let m = materials.get(key) as MeshStandardMaterial | undefined
  if (!m) {
    const color = new Color(hex)
    if (alt) color.lerp(ALT_SHADE_COLOR, ALT_SHADE)
    m = new MeshStandardMaterial({ color, roughness: 0.85, flatShading: true })
    materials.set(key, m)
  }
  return m
}
function basic(key: string, make: () => Material): Material {
  let m = materials.get(key)
  if (!m) materials.set(key, (m = make()))
  return m
}

const at = (mesh: Mesh, x: number, y: number, z: number) => {
  mesh.position.set(x, y, z)
  return mesh
}

export function createChibi(preset: number): Chibi {
  const P = sharedParts()
  const skin = flat(COLORS.skin)
  const white = flat(COLORS.white)

  const root = new Group()
  // Ground shadow stays down when the rig jumps.
  const shadow = new Mesh(
    P.shadow,
    basic(
      'shadow',
      () => new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.2, depthWrite: false }),
    ),
  )
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = 0.011
  const rig = new Group()
  root.add(shadow, rig)

  // Upper body: twists / bends about the hips. Chest, head and arms hang off it.
  const torso = new Group()
  torso.position.y = HIP_Y
  torso.rotation.order = 'YXZ'
  rig.add(torso)
  const body = at(new Mesh(P.body, skin), 0, 0.42 - HIP_Y, 0)
  torso.add(body)

  // Legs: pivot at the hip, capsule hanging down, a round shoe.
  const legs = [-1, 1].map((s) => {
    const leg = new Group()
    leg.position.set(s * 0.09, HIP_Y, 0)
    const shoe = at(new Mesh(P.shoe, white), 0, -0.2, 0.03)
    shoe.scale.set(1, 0.7, 1.3)
    leg.add(at(new Mesh(P.limb, skin), 0, -0.1, 0), shoe)
    rig.add(leg)
    return leg
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
    const hand = at(new Mesh(P.hand, skin), 0, -ARM.hand, 0.006)
    hand.scale.set(0.95, 1.05, 0.85)
    wrist.add(hand)
    elbow.add(new Mesh(P.foreArm, skin), wrist)
    roll.add(new Mesh(P.upperArm, skin), elbow)
    shoulder.add(roll)
    torso.add(shoulder)
    return { side: s, shoulder, roll, elbow, wrist }
  })
  // Racket: handle along the forearm (tipped forward a little), frame beyond. `tip` marks the far rim.
  const racket = new Group()
  racket.position.y = -ARM.hand
  racket.rotation.x = Math.PI - RACKET_MOUNT
  const frame = at(new Mesh(P.frame, skin), 0, RACKET_HEAD, 0)
  racket.add(at(new Mesh(P.handle, flat(COLORS.handle)), 0, 0.13, 0), frame)
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

  // Head: skin ball, hair cap tipped back, face on +z.
  const head = new Group()
  const hair = new Mesh(P.hair, flat(COLORS.hair))
  hair.rotation.x = -0.45
  head.add(new Mesh(P.head, skin), hair)
  const eyeMat = flat(COLORS.eye)
  const sparkMat = basic('spark', () => new MeshBasicMaterial({ color: COLORS.white }))
  const eyes = [-1, 1].map((s) => {
    const eye = at(new Mesh(P.eye, eyeMat), s * 0.13, 0.0, 0.32)
    eye.scale.set(0.8, 1.1, 0.5)
    eye.add(at(new Mesh(P.spark, sparkMat), 0.02, 0.025, 0.045))
    head.add(eye)
    return eye
  })
  for (const s of [-1, 1]) {
    const blush = at(new Mesh(P.blush, flat(COLORS.blush)), s * 0.22, -0.09, 0.265)
    blush.scale.set(1.3, 0.7, 0.4)
    blush.rotation.y = s * 0.7
    head.add(blush)
  }
  const mouth = at(new Mesh(P.mouth, eyeMat), 0, -0.11, 0.335)
  head.add(mouth)
  // Outline for the far twin: a back-faced shell around the head.
  const hull = new Mesh(
    P.hull,
    basic('hull', () => new MeshBasicMaterial({ color: COLORS.outline, side: BackSide })),
  )
  head.add(hull)
  head.position.y = HEAD_Y - HIP_Y
  torso.add(head)

  // Hats (one visible). Accent meshes recolour with the preset.
  const accented: Mesh[] = [frame]
  const accent = (g: BufferGeometry) => {
    const m = new Mesh(g, skin)
    accented.push(m)
    return m
  }
  const hats: Record<Hat, Group> = {
    cap: new Group(),
    headband: new Group(),
    bow: new Group(),
    beanie: new Group(),
  }
  {
    const dome = accent(P.capDome)
    dome.rotation.x = -0.2
    const brim = at(accent(P.capBrim), 0, 0.24, 0.24)
    brim.scale.z = 1.3
    brim.rotation.x = 0.3
    hats.cap.add(dome, brim)

    const band = at(accent(P.band), 0, 0.14, 0)
    band.rotation.x = Math.PI / 2
    hats.headband.add(band)

    const bow = hats.bow
    bow.position.set(0.17, 0.3, 0.02)
    bow.rotation.z = -0.45
    for (const s of [-1, 1]) {
      const loop = at(accent(P.bowLoop), s * 0.09, 0, 0)
      loop.rotation.z = (s * Math.PI) / 2
      loop.scale.z = 0.6
      bow.add(loop)
    }
    bow.add(accent(P.knot))

    const rimY = HEAD_R * 1.09 * Math.cos(Math.PI * 0.42)
    const rim = at(accent(P.beanieRim), 0, rimY, 0)
    rim.rotation.x = Math.PI / 2
    hats.beanie.add(accent(P.beanieDome), rim, at(new Mesh(P.pompom, white), 0, HEAD_R * 1.09 + 0.04, 0))
  }
  for (const k of Object.keys(hats) as Hat[]) head.add(hats[k])

  // Real shadows (when the renderer has them on) from the three shapes that read in a long low-sun
  // shadow: body, head and racket. Everything else would only add shadow-pass draw calls.
  const casts = new Set<BufferGeometry>([P.body, P.head, P.frame])
  rig.traverse((o) => {
    if (o instanceof Mesh && casts.has(o.geometry)) o.castShadow = true
  })

  function setPreset(n: number, alt = false) {
    const p = PRESETS[Math.min(PRESETS.length - 1, Math.max(0, n | 0))]
    body.material = flat(p.body, alt)
    const acc = flat(p.accent, alt)
    for (const m of accented) m.material = acc
    for (const k of Object.keys(hats) as Hat[]) hats[k].visible = k === p.hat
    hull.visible = alt
  }

  /** The point `k` m along the racket's handle axis (frame centre = RACKET_HEAD) in rig space, into `v3`. */
  function racketPoint(k: number): Vector3 {
    v3.set(0, k, 0)
    for (let i = 0; i < racketChain.length; i++) {
      racketChain[i].updateMatrix()
      v3.applyMatrix4(racketChain[i].matrix)
    }
    return v3
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

    // Whole rig: bob (2 per stride, lowest at the plants), jump, hops, a ready split-step bounce.
    let y = (stride.bob * (1 - Math.cos(4 * Math.PI * p.stride))) / 2
    y += p.jump * JUMP_H + hopO.height * (HOP_H + p.cheer * HOP_H_WIN) * happy
    y += ready * 0.025 * (1 - Math.cos(t * 9)) * 0.5
    rig.position.y = y
    rig.rotation.x = LEAN_FWD * p.fwd + p.lean + 0.12 * ready + 0.1 * p.crouch + 0.08 * sad
    rig.rotation.z = -LEAN_SIDE * p.side
    rig.rotation.y = celebrateSpin(t) * p.cheer

    // Squash / stretch about the feet (rig origin): springs, crouch, landings, breathing.
    let sq = p.squash + hopO.squash * happy + SQUASH_CROUCH * p.crouch + SQUASH_READY * ready + 0.05 * sad
    sq -= Math.sin(t * (sad ? 1.6 : 3)) * BREATHE * calm
    rig.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5)

    // Legs: scissor along the move, open/close on a side shuffle, wide in a ready / crouch, tucked mid-air.
    const mag = Math.abs(p.fwd) + Math.abs(p.side) + 1e-6
    const along = Math.abs(p.fwd) / mag
    const across = Math.abs(p.side) / mag
    const tuck = p.jump * 0.7 + hopO.height * happy * 0.4
    const splay = 0.16 * ready + 0.2 * p.crouch
    const shuffle = cycle * stride.amp * 0.45 * across
    legs[0].rotation.x = cycle * stride.amp * along - tuck
    legs[1].rotation.x = -cycle * stride.amp * along - tuck * 0.5
    legs[0].rotation.z = -splay - shuffle
    legs[1].rotation.z = splay - shuffle

    // Upper body (arm.ts): base pose (idle / run counter-swing / ready / moods) with the swing on top.
    baseIn.run = Math.min(1, p.run * 1.6)
    baseIn.stride = p.stride
    baseIn.ready = ready
    baseIn.happy = happy
    baseIn.sad = sad
    baseIn.wave = Math.sin(t * 9) * 0.25
    basePose(baseIn, base)
    swingIn.load = p.load
    swingIn.strike = p.strike
    swingIn.prev = p.prev
    swingPose(base, swingIn, p.smash, ang)
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

    // Streak: sample the racket head while it whips, draw the last STREAK.life s of it.
    const glow = p.strike >= 0 ? streakGlow(p.strike) : 0
    if (glow > 0.02) {
      if (!streak.mesh.visible) streak.clear()
      const c = racketPoint(STREAK.inner)
      const cx = c.x
      const cy = c.y
      const cz = c.z
      const r = racketPoint(RACKET_TIP)
      streak.push(t, cx, cy, cz, r.x, r.y, r.z)
      streak.draw(t, STREAK.opacity * glow)
    }
    streak.mesh.visible = glow > 0.02

    // Ground shadow shrinks as the rig leaves the ground.
    shadow.scale.setScalar(1 - Math.min(0.4, y * 0.6))

    // Face: idle glance (against the torso twist), happy squint + big smile, sad droop + frown.
    head.rotation.x = 0.35 * sad - 0.06 * ready - ang[CH.bend] * 0.5
    head.rotation.y = p.look * calm * (1 - p.ready) + HEAD_COUNTER * ang[CH.twist]
    head.rotation.z = happy * Math.sin(t * 9) * 0.08
    const squint = mix(1.1, 0.45, happy)
    eyes[0].scale.y = squint
    eyes[1].scale.y = squint
    mouth.rotation.z = sad > 0.5 ? 0 : Math.PI
    mouth.position.y = sad > 0.5 ? -0.13 : -0.11
    const grin = 0.9 + 0.5 * happy - 0.1 * sad
    mouth.scale.set(grin, grin, 1)
  }

  setPreset(preset)
  setPose(restPose(), 0)
  return { root, setPose, setPreset }
}

/**
 * Racket streak ribbon: a ring buffer of racket-head samples (time, frame centre, far rim) turned into a
 * quad strip each frame. Vertex colours fade with age (additive blending: black = invisible). Buffers
 * are allocated once per chibi.
 */
function makeStreak() {
  const N = STREAK.samples
  const times = new Float64Array(N)
  const pts = new Float64Array(N * 6)
  const pos = new Float32Array(N * 2 * 3)
  const col = new Float32Array(N * 2 * 3)
  const geo = new BufferGeometry()
  const posAttr = new BufferAttribute(pos, 3)
  const colAttr = new BufferAttribute(col, 3)
  geo.setAttribute('position', posAttr)
  geo.setAttribute('color', colAttr)
  const index: number[] = []
  for (let k = 0; k < N - 1; k++) {
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
  let head = 0
  let count = 0
  return {
    mesh,
    clear() {
      count = 0
    },
    push(t: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
      head = (head + 1) % N
      times[head] = t
      const o = head * 6
      pts[o] = ax
      pts[o + 1] = ay
      pts[o + 2] = az
      pts[o + 3] = bx
      pts[o + 4] = by
      pts[o + 5] = bz
      count = Math.min(N, count + 1)
    },
    /** Rebuild the strip from the newest sample back while younger than STREAK.life. */
    draw(t: number, opacity: number) {
      let n = 0
      for (; n < count; n++) {
        const k = (head - n + N) % N
        const age = t - times[k]
        if (n > 0 && age > STREAK.life) break
        const f = opacity * Math.max(0, 1 - age / STREAK.life)
        const o = k * 6
        const v = n * 6
        for (let j = 0; j < 6; j++) pos[v + j] = pts[o + j]
        col[v] = col[v + 1] = col[v + 2] = f * 0.35
        col[v + 3] = col[v + 4] = col[v + 5] = f
      }
      geo.setDrawRange(0, Math.max(0, n - 1) * 6)
      posAttr.needsUpdate = true
      colAttr.needsUpdate = true
    },
  }
}
