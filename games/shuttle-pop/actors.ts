// Shuttle Pop chibis: big round head (~55% of the height), tiny body, stubby limbs, a racket in the
// right hand, a hat per preset. Built from three.js primitives; every geometry and material is shared
// by all instances (materials are cached per colour). Poses are procedural and allocate nothing.
//
// Model space: feet at y = 0, facing +z, right hand on −x. Total height ≈ 1.3 m.

import {
  BackSide,
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
  type BufferGeometry,
  type Material,
  type Object3D,
} from 'three'

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

export type Mood = 'idle' | 'happy' | 'sad'

export interface ChibiPose {
  /** 0..1, share of top running speed. */
  run: number
  /** Swing progress 0..1 (0 = not swinging). */
  swing: number
  /** Jump envelope 0..1 (height share). */
  jump: number
  mood: Mood
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
const HAND_Y = -0.22
/** Shade mixed into the far twin's colours. */
const ALT_SHADE = 0.32
const ALT_SHADE_COLOR = new Color(0x4a3f5c)

// Pose tuning.
const RUN_FREQ = 14
const RUN_LEG = 0.8
const RUN_BOB = 0.06
const JUMP_H = 0.45
const ARM_IDLE = -0.25
/** Arm angles about x (0 = hanging; negative swings forward, past −π reaches behind the head). */
const ARM_WINDUP = -3.5
const ARM_FOLLOW = -0.7
const ARM_CHEER = -2.9

interface Parts {
  head: BufferGeometry
  hull: BufferGeometry
  hair: BufferGeometry
  body: BufferGeometry
  limb: BufferGeometry
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
    hand: new SphereGeometry(0.065, 8, 6),
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

/** Eased 0..1 progress of `s` through [a, b]. */
function seg(s: number, a: number, b: number): number {
  const k = Math.min(1, Math.max(0, (s - a) / (b - a)))
  return k * k * (3 - 2 * k)
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

  const body = at(new Mesh(P.body, skin), 0, 0.42, 0)
  rig.add(body)

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

  // Arms: pivot at the shoulder. [0] = right (racket) on −x, [1] = left.
  const arms = [-1, 1].map((s) => {
    const arm = new Group()
    arm.position.set(s * SHOULDER_X, SHOULDER_Y, 0)
    arm.rotation.z = s * 0.25
    arm.add(at(new Mesh(P.limb, skin), 0, -0.1, 0), at(new Mesh(P.hand, skin), 0, HAND_Y, 0))
    rig.add(arm)
    return arm
  })
  const racket = new Group()
  racket.position.set(0, HAND_Y, 0)
  racket.rotation.x = 1.1
  const frame = at(new Mesh(P.frame, skin), 0, 0.42, 0)
  racket.add(at(new Mesh(P.handle, flat(COLORS.handle)), 0, 0.13, 0), frame)
  arms[0].add(racket)

  // Head: skin ball, hair cap tipped back, face on +z.
  const head = new Group()
  head.position.y = HEAD_Y
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
  rig.add(head)

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

  function setPose(p: ChibiPose, t: number) {
    const run = p.run
    const cycle = Math.sin(t * RUN_FREQ)
    const happy = p.mood === 'happy'
    const sad = p.mood === 'sad'

    // Whole rig: run bob + lean, jump, celebration hop, slump.
    let y = Math.abs(cycle) * RUN_BOB * run + p.jump * JUMP_H
    if (happy) y += Math.abs(Math.sin(t * 9)) * 0.12
    rig.position.y = y
    rig.rotation.x = 0.12 * run + (sad ? 0.08 : 0)
    const breathe = 1 + Math.sin(t * 3) * 0.015
    rig.scale.set(1, sad ? 0.94 : breathe, 1)

    // Legs: run scissor, tucked in a jump.
    const tuck = p.jump * 0.7
    legs[0].rotation.x = cycle * RUN_LEG * run - tuck
    legs[1].rotation.x = -cycle * RUN_LEG * run - tuck * 0.5

    // Swing (right arm): wind up overhead, strike forward, recover. Torso twists with it.
    const s = p.swing
    let right = ARM_IDLE + cycle * 0.5 * run
    let twist = 0
    if (s > 0) {
      const up = seg(s, 0, 0.3)
      const strike = seg(s, 0.3, 0.6)
      const back = seg(s, 0.6, 1)
      right = ARM_IDLE + (ARM_WINDUP - ARM_IDLE) * up
      right += (ARM_FOLLOW - ARM_WINDUP) * strike
      right += (ARM_IDLE - ARM_FOLLOW) * back
      twist = 0.45 * up - 0.9 * strike + 0.45 * back
    } else if (happy) right = ARM_CHEER + Math.sin(t * 9) * 0.25
    arms[0].rotation.x = right
    rig.rotation.y = twist
    arms[1].rotation.x = happy ? ARM_CHEER - Math.sin(t * 9) * 0.25 : sad ? 0.1 : ARM_IDLE - cycle * 0.5 * run

    // Face: happy squint + big smile, sad droop + frown.
    head.rotation.x = sad ? 0.35 : 0
    head.rotation.z = happy ? Math.sin(t * 9) * 0.08 : 0
    const squint = happy ? 0.45 : 1.1
    eyes[0].scale.y = squint
    eyes[1].scale.y = squint
    mouth.rotation.z = sad ? 0 : Math.PI
    mouth.position.y = sad ? -0.13 : -0.11
    const grin = happy ? 1.4 : sad ? 0.8 : 0.9
    mouth.scale.set(grin, grin, 1)
  }

  setPreset(preset)
  setPose({ run: 0, swing: 0, jump: 0, mood: 'idle' }, 0)
  return { root, setPose, setPreset }
}
