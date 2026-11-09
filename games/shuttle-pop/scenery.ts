// The park around the court at golden hour: sky dome, warm lights + fog, grass, trees, picnic
// blankets, benches, lantern strings and a small cheering crowd.
//
// Draw-call lean: every repeated thing is one InstancedMesh (or one merged geometry), so the whole
// park is ~16 draw calls. Nothing here casts or receives shadows. The background is kept soft
// (muted colours, fog) so the court, players and white shuttle pop; nothing tall stands between
// the camera and the court, and nothing pale sits behind the far baseline.
//
// Render space: the local player is near (z < 0), the camera behind them looking toward +z.

import {
  BackSide,
  BoxGeometry,
  BufferGeometry,
  CapsuleGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Euler,
  Float32BufferAttribute,
  Fog,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type Scene,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

const SKY = {
  top: '#a995d4',
  mid: '#eaa9ae',
  horizon: '#eeb08c',
  sun: '#ffb877',
}
const PARK = {
  grass: '#a3bd7c',
  hemiSky: '#ffe2c6',
  hemiGround: '#6f8a5e',
  sun: '#ffc890',
  trunk: '#8f7563',
  wood: '#8a6a52',
  pole: '#7d6a62',
  wire: '#4a3b45',
  canopies: ['#93b07c', '#a1ba86', '#86a576', '#adbf8c', '#cdb07e'],
  blankets: ['#d98b7e', '#8fa7c9', '#d6b25e', '#a990c4'],
  props: ['#b07d4f', '#e07a6a', '#e9d9bd'],
  lanterns: ['#ffad4d', '#ff7f6e', '#f58fb8', '#ffc25c'],
  shirts: ['#c98ba0', '#88a9c4', '#c9a865', '#93b49a', '#b39ac8', '#d49a7a', '#7fa3a8', '#c4a0b6'],
  hair: ['#5a3e36', '#3b2f33', '#8a5a3c', '#2f2a35', '#b0703f'],
  skin: ['#ffe0c7', '#f2c9a5', '#d9a77f', '#ffd9bd'],
  eye: '#2b2233',
}

/** Sun direction (from the scene toward the sun): low, behind the camera and to one side, so faces toward the camera are lit and shadows fall long across the court. */
const SUN_DIR = new Vector3(-9, 7, -10).normalize()
const SKY_R = 100
const FOG_NEAR = 28
const FOG_FAR = 90

/** Tiny seeded random (placement only; same park every load). */
function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

const dummy = new Object3D()
/** Write a transform into instance `i` of `mesh`. */
function place(
  mesh: InstancedMesh,
  i: number,
  x: number,
  y: number,
  z: number,
  yaw = 0,
  sx = 1,
  sy = sx,
  sz = sx,
) {
  dummy.position.set(x, y, z)
  dummy.rotation.set(0, yaw, 0)
  dummy.scale.set(sx, sy, sz)
  dummy.updateMatrix()
  mesh.setMatrixAt(i, dummy.matrix)
}

/** Yaw that turns model +z toward (tx, tz). */
const yawTo = (x: number, z: number, tx: number, tz: number) => Math.atan2(tx - x, tz - z)

function lambert(color = '#ffffff', flatShading = false): MeshLambertMaterial {
  return new MeshLambertMaterial({ color, flatShading })
}

function instanced(geo: BufferGeometry, mat: MeshLambertMaterial | MeshBasicMaterial, count: number) {
  const m = new InstancedMesh(geo, mat, count)
  m.castShadow = false
  m.receiveShadow = false
  return m
}

/** Golden-hour gradient + a soft sun glow. One draw call, no fog. */
function makeSky(): Mesh {
  const mat = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new Color(SKY.top) },
      mid: { value: new Color(SKY.mid) },
      horizon: { value: new Color(SKY.horizon) },
      sunColor: { value: new Color(SKY.sun) },
      sunDir: { value: SUN_DIR.clone() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 sunColor; uniform vec3 sunDir;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        vec3 c = mix(horizon, mid, smoothstep(0.0, 0.22, d.y));
        c = mix(c, top, smoothstep(0.22, 0.75, d.y));
        float s = max(dot(d, sunDir), 0.0);
        c += sunColor * (pow(s, 64.0) * 0.5 + pow(s, 6.0) * 0.22);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
  const sky = new Mesh(new SphereGeometry(SKY_R, 32, 16), mat)
  sky.renderOrder = -1
  sky.frustumCulled = false
  return sky
}

function makeTrees(): Group {
  const r = rng(7)
  const spots: { x: number; z: number; s: number }[] = []
  // Far row, well behind the far baseline (mid-green canopies, never pale: the white shuttle reads on them).
  for (let x = -18; x <= 18; x += 3.4)
    spots.push({ x: x + (r() - 0.5) * 1.6, z: 17 + r() * 7, s: 1 + r() * 0.5 })
  // Side rows, well outside the lanterns.
  for (const side of [-1, 1])
    for (let z = -10; z <= 14; z += 4)
      spots.push({ x: side * (12 + r() * 4), z: z + (r() - 0.5) * 2, s: 0.8 + r() * 0.4 })
  // Low bushes between the rows and the court surround.
  const bushes: { x: number; z: number; s: number }[] = []
  for (const side of [-1, 1])
    for (let z = -6; z <= 10; z += 5.5)
      bushes.push({ x: side * (8 + r() * 0.8), z: z + r() * 2, s: 0.45 + r() * 0.2 })

  const trunks = instanced(new CylinderGeometry(0.14, 0.2, 1.6, 6), lambert(PARK.trunk), spots.length)
  const canopies = instanced(
    new IcosahedronGeometry(1, 1),
    lambert('#ffffff', true),
    spots.length + bushes.length,
  )
  const tint = new Color()
  spots.forEach((t, i) => {
    place(trunks, i, t.x, 0.8 * t.s, t.z, 0, t.s)
    place(canopies, i, t.x, (1.6 + 0.9) * t.s, t.z, r() * Math.PI, 1.25 * t.s, 1.1 * t.s, 1.25 * t.s)
    canopies.setColorAt(i, tint.set(PARK.canopies[Math.floor(r() * PARK.canopies.length)]))
  })
  bushes.forEach((b, j) => {
    const i = spots.length + j
    place(canopies, i, b.x, 0.35 * b.s, b.z, r() * Math.PI, 1.4 * b.s, 0.9 * b.s, 1.2 * b.s)
    canopies.setColorAt(i, tint.set(PARK.canopies[j % 3]))
  })
  const g = new Group()
  g.add(trunks, canopies)
  return g
}

/** Blanket spots (x, z) on the grass beside the court; the crowd sits on them. */
const BLANKETS = [
  { x: -6.3, z: 1.6 },
  { x: 6.3, z: 2.4 },
  { x: -6.5, z: -5.2 },
  { x: 6.5, z: -4.6 },
]
const BENCHES = [
  { x: -6.9, z: -1.6 },
  { x: 6.9, z: -1.0 },
  { x: -7.0, z: 5.6 },
]

function makePicnic(): Group {
  const blankets = instanced(new BoxGeometry(1.7, 0.03, 1.3), lambert(), BLANKETS.length)
  // Basket, juice box, plate per blanket.
  const props = instanced(new BoxGeometry(1, 1, 1), lambert(), BLANKETS.length * 3)
  const tint = new Color()
  BLANKETS.forEach((b, i) => {
    const out = Math.sign(b.x)
    place(blankets, i, b.x, 0.015, b.z, (i - 1.5) * 0.12)
    blankets.setColorAt(i, tint.set(PARK.blankets[i]))
    place(props, i * 3, b.x + out * 0.5, 0.13, b.z - 0.35, 0.3, 0.38, 0.22, 0.26)
    place(props, i * 3 + 1, b.x + out * 0.15, 0.08, b.z - 0.45, 0, 0.08, 0.13, 0.06)
    place(props, i * 3 + 2, b.x + out * 0.55, 0.04, b.z + 0.3, 0.5, 0.26, 0.015, 0.26)
    for (let k = 0; k < 3; k++) props.setColorAt(i * 3 + k, tint.set(PARK.props[k]))
  })

  // Bench: seat, back and two legs merged into one geometry; front faces model +z.
  const part = (w: number, h: number, d: number, x: number, y: number, z: number) =>
    new BoxGeometry(w, h, d).translate(x, y, z)
  const benchGeo = mergeGeometries([
    part(1.4, 0.07, 0.42, 0, 0.45, 0),
    part(1.4, 0.3, 0.06, 0, 0.72, -0.2),
    part(0.08, 0.45, 0.38, -0.6, 0.225, 0),
    part(0.08, 0.45, 0.38, 0.6, 0.225, 0),
  ])
  const benches = instanced(benchGeo, lambert(PARK.wood), BENCHES.length)
  BENCHES.forEach((b, i) => place(benches, i, b.x, 0, b.z, yawTo(b.x, b.z, 0, b.z)))

  const g = new Group()
  g.add(blankets, props, benches)
  return g
}

/** Lantern strings on poles along both sides (outside the court, never across it). */
function makeLanterns(): Group {
  const POLE_X = 4.6
  const POLE_H = 2.6
  const POLES_Z = [-8, 0, 8]
  const PER_SPAN = 7
  const SAG = 0.4
  const poles = instanced(
    new CylinderGeometry(0.045, 0.06, POLE_H, 6),
    lambert(PARK.pole),
    POLES_Z.length * 2,
  )
  const spans = (POLES_Z.length - 1) * 2
  const lanterns = instanced(new SphereGeometry(0.09, 8, 6), new MeshBasicMaterial(), spans * PER_SPAN)
  const wire: number[] = []
  const tint = new Color()
  const STEPS = 12
  /** Height of the string at t ∈ [0, 1] along a span (a sag, lowest mid-span). */
  const hang = (t: number) => POLE_H - 0.05 - SAG * 4 * t * (1 - t)
  let p = 0
  let l = 0
  for (const side of [-1, 1]) {
    const x = side * POLE_X
    for (const z of POLES_Z) place(poles, p++, x, POLE_H / 2, z)
    for (let s = 0; s + 1 < POLES_Z.length; s++) {
      const z0 = POLES_Z[s]
      const z1 = POLES_Z[s + 1]
      for (let k = 0; k < STEPS; k++) {
        const a = k / STEPS
        const b = (k + 1) / STEPS
        wire.push(x, hang(a), z0 + (z1 - z0) * a, x, hang(b), z0 + (z1 - z0) * b)
      }
      for (let k = 0; k < PER_SPAN; k++) {
        const t = (k + 1) / (PER_SPAN + 1)
        place(lanterns, l, x, hang(t) - 0.12, z0 + (z1 - z0) * t, 0, 1, 1.2, 1)
        lanterns.setColorAt(l, tint.set(PARK.lanterns[l % PARK.lanterns.length]))
        l++
      }
    }
  }
  const wireGeo = new BufferGeometry()
  wireGeo.setAttribute('position', new Float32BufferAttribute(wire, 3))
  const g = new Group()
  g.add(poles, lanterns, new LineSegments(wireGeo, new LineBasicMaterial({ color: PARK.wire })))
  return g
}

type Seat = 'ground' | 'bench' | 'stand'
interface Fan {
  x: number
  z: number
  seat: Seat
}

/** Eight fans: two on each near/far blanket, one per bench, one standing. */
const FANS: readonly Fan[] = [
  { x: -6.0, z: 1.3, seat: 'ground' },
  { x: -6.6, z: 2.0, seat: 'ground' },
  { x: 6.0, z: 2.1, seat: 'ground' },
  { x: 6.2, z: -4.8, seat: 'ground' },
  { x: -6.8, z: -1.6, seat: 'bench' },
  { x: 6.8, z: -1.0, seat: 'bench' },
  { x: -6.9, z: 5.6, seat: 'bench' },
  { x: 5.9, z: 5.2, seat: 'stand' },
]

// Fan proportions (a simplified chibi from actors.ts: same shape, fewer parts).
const FAN_SCALE = 0.95
const HIP_Y = 0.24
const SEAT_Y: Record<Seat, number> = { ground: 0.1, bench: 0.5, stand: HIP_Y }
const LIMBS = 4

// Cheer motion.
const CHEER_FREQ = 9
const CHEER_EASE = 6
const ARM_REST = -0.25
const ARM_LAP = -0.7
const ARM_UP = -2.9
/** Arm splay at rest and extra when raised (a V clear of the big head). */
const ARM_SPLAY = 0.25
const ARM_SPLAY_UP = 0.25
/** Raised arms stretch (cartoon) so the hands wave clear above the shoulders of the big head. */
const ARM_LEN_UP = 0.9
const HOP: Record<Seat, number> = { ground: 0.1, bench: 0.12, stand: 0.26 }

/**
 * The crowd: every fan's body, head, hair, eyes and limbs are five InstancedMeshes. Matrices are
 * rewritten only while the cheer level is above zero (or easing back to rest).
 */
class Crowd {
  readonly root = new Group()
  private body: InstancedMesh
  private head: InstancedMesh
  private hair: InstancedMesh
  private eyes: InstancedMesh
  private limbs: InstancedMesh
  private base: Matrix4[]
  private phase: number[]
  private level = 0
  /** Matrices currently show the rest pose. */
  private resting = false
  // Scratch (no per-frame allocations).
  private m = new Matrix4()
  private lift = new Matrix4()
  private part = new Matrix4()
  private q = new Quaternion()
  private e = new Euler()
  private v = new Vector3()
  private s = new Vector3()

  constructor() {
    const n = FANS.length
    const skin = lambert()
    this.body = instanced(new CapsuleGeometry(0.17, 0.14, 3, 8), lambert(), n)
    this.head = instanced(new SphereGeometry(0.36, 14, 10), skin, n)
    this.hair = instanced(new SphereGeometry(0.375, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), lambert(), n)
    this.eyes = instanced(new SphereGeometry(0.055, 6, 4), new MeshBasicMaterial({ color: PARK.eye }), n * 2)
    this.limbs = instanced(new CapsuleGeometry(0.065, 0.16, 2, 6), skin, n * LIMBS)
    const r = rng(11)
    const tint = new Color()
    this.base = FANS.map((f, i) => {
      this.body.setColorAt(i, tint.set(PARK.shirts[i % PARK.shirts.length]))
      this.hair.setColorAt(i, tint.set(PARK.hair[i % PARK.hair.length]))
      const sk = PARK.skin[i % PARK.skin.length]
      this.head.setColorAt(i, tint.set(sk))
      for (let k = 0; k < LIMBS; k++) this.limbs.setColorAt(i * LIMBS + k, tint)
      // Facing the court's centre line, a little toward the net.
      this.e.set(0, yawTo(f.x, f.z, 0, f.z * 0.6), 0)
      return new Matrix4().compose(
        this.v.set(f.x, 0, f.z),
        this.q.setFromEuler(this.e),
        this.s.setScalar(FAN_SCALE),
      )
    })
    this.phase = FANS.map(() => r() * Math.PI * 2)
    for (const m of [this.body, this.head, this.hair, this.eyes, this.limbs]) {
      // Hops move instances past the first bounds; the crowd is always on screen anyway.
      m.frustumCulled = false
      this.root.add(m)
    }
    this.pose(0, 0)
  }

  /** `target` = cheer level 0..1 (eased here), `t` = seconds. */
  update(target: number, t: number, dt: number) {
    this.level += (target - this.level) * (1 - Math.exp(-CHEER_EASE * dt))
    if (target === 0 && this.level < 0.01) {
      this.level = 0
      if (this.resting) return
    }
    this.pose(this.level, t)
  }

  private pose(level: number, t: number) {
    this.resting = level === 0
    const up = Math.min(1, level * 1.8)
    for (let i = 0; i < FANS.length; i++) {
      const fan = FANS[i]
      const wave = Math.sin(t * CHEER_FREQ + this.phase[i])
      const hop = Math.abs(wave) * HOP[fan.seat] * level
      this.lift.makeTranslation(0, SEAT_Y[fan.seat] - HIP_Y + hop, 0).premultiply(this.base[i])
      this.write(this.body, i, 0, 0.42, 0, 0, 0)
      this.write(this.head, i, 0, 0.94, 0, 0, wave * 0.1 * level)
      this.write(this.hair, i, 0, 0.94, 0, -0.45, wave * 0.1 * level)
      for (let k = 0; k < 2; k++) {
        const s = k === 0 ? -1 : 1
        this.write(this.eyes, i * 2 + k, s * 0.13, 0.94, 0.32, 0, 0, 0.8, 1.1, 0.5)
        // Legs: hang when standing, straight out when seated.
        const leg = fan.seat === 'stand' ? 0 : -Math.PI / 2
        this.writeLimb(i * LIMBS + k, s * 0.09, HIP_Y, leg, 0)
        // Arms: rest (lap when seated) → overhead, waving out of step with the other arm.
        const rest = fan.seat === 'stand' ? ARM_REST : ARM_LAP
        const arm = rest + (ARM_UP + s * wave * 0.3 - rest) * up
        this.writeLimb(
          i * LIMBS + 2 + k,
          s * 0.2,
          0.56,
          arm,
          s * (ARM_SPLAY + ARM_SPLAY_UP * up),
          1 + ARM_LEN_UP * up,
        )
      }
    }
    for (const m of [this.body, this.head, this.hair, this.eyes, this.limbs])
      m.instanceMatrix.needsUpdate = true
  }

  /** Part at (x, y, z) in fan space, tilted rx (about x) and rz (about z), scaled. */
  private write(
    mesh: InstancedMesh,
    i: number,
    x: number,
    y: number,
    z: number,
    rx: number,
    rz: number,
    sx = 1,
    sy = 1,
    sz = 1,
  ) {
    this.e.set(rx, 0, rz)
    this.part.compose(this.v.set(x, y, z), this.q.setFromEuler(this.e), this.s.set(sx, sy, sz))
    mesh.setMatrixAt(i, this.m.multiplyMatrices(this.lift, this.part))
  }

  /** A limb pivoting at (x, y): swung `rx` about x, splayed `rz`, hanging below the pivot, `len` × long. */
  private writeLimb(i: number, x: number, y: number, rx: number, rz: number, len = 1) {
    this.e.set(rx, 0, rz)
    this.part.compose(this.v.set(x, y, 0), this.q.setFromEuler(this.e), this.s.set(1, len, 1))
    this.m.makeTranslation(0, -0.12, 0).premultiply(this.part).premultiply(this.lift)
    this.limbs.setMatrixAt(i, this.m)
  }
}

/** Sky, lights, fog and park scenery. Add once; call `update` every frame for the crowd. */
export class Park {
  readonly root = new Group()
  /** The low warm sun; the only shadow-casting light (players only; Court3D pauses its pass when slow). */
  private sun: DirectionalLight
  private crowd = new Crowd()

  constructor(scene: Scene) {
    scene.background = new Color(SKY.horizon)
    scene.fog = new Fog(SKY.horizon, FOG_NEAR, FOG_FAR)

    this.sun = new DirectionalLight(PARK.sun, 2.4)
    this.sun.position.copy(SUN_DIR).multiplyScalar(20)
    const cam = this.sun.shadow.camera
    cam.left = -10
    cam.right = 10
    cam.top = 10
    cam.bottom = -10
    cam.near = 1
    cam.far = 45
    this.sun.shadow.mapSize.set(1024, 1024)
    this.sun.shadow.bias = -0.0005
    this.sun.shadow.normalBias = 0.02
    this.sun.castShadow = true

    const grass = new Mesh(new CircleGeometry(SKY_R * 0.9, 48), new MeshBasicMaterial({ color: PARK.grass }))
    grass.rotation.x = -Math.PI / 2

    this.root.add(
      makeSky(),
      new HemisphereLight(PARK.hemiSky, PARK.hemiGround, 1.3),
      this.sun,
      grass,
      makeTrees(),
      makePicnic(),
      makeLanterns(),
      this.crowd.root,
    )
    scene.add(this.root)
  }

  /** `cheer` = crowd excitement 0..1 (see world.ts cheerLevel), `t` = seconds. */
  update(cheer: number, t: number, dt: number) {
    this.crowd.update(cheer, t, dt)
  }
}
