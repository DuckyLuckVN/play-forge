// 3D models for everything on the rift, built from primitives. Each look is
// its rule: red spikes hurt, cyan glows are food, a shaking purple block above
// you is about to fall, the shimmering frame is the way through.

import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  EdgesGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  LatheGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  Shape,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  Vector2,
  Vector3,
  DynamicDrawUsage,
} from 'three'
import { glowTexture } from '@forge/render3d'
import type { Accessory, Character } from './characters'
import { C } from './palette'
import { LANE_W } from './world'

const glowSprite = (color: string, opacity = 1) =>
  new Sprite(
    new SpriteMaterial({
      map: glowTexture(),
      color,
      blending: AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity,
    }),
  )

/** A soft coloured glow lying on the track (lane marker under objects). */
export function groundGlow(color: string, size: number, opacity = 0.7): Mesh {
  const m = new Mesh(
    new PlaneGeometry(size, size),
    new MeshBasicMaterial({
      map: glowTexture(),
      color,
      transparent: true,
      opacity,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  )
  m.rotation.x = -Math.PI / 2
  m.position.y = 0.02
  return m
}

// ---------- Shared geometry (built once) ----------
const SHARD_CORE = new IcosahedronGeometry(0.5, 0)
const SHARD_SPIKE = new ConeGeometry(0.15, 0.95, 5)
SHARD_SPIKE.translate(0, 0.55, 0)
const SHARD_HEART = new OctahedronGeometry(0.2, 0)
const SHARDLET = new OctahedronGeometry(0.5, 0)
/** Inside-out dark shell = cheap outline. */
const OUTLINE = new MeshBasicMaterial({ color: '#12051a', side: BackSide })
const WISP_BALL = new SphereGeometry(0.28, 20, 14)
const WALL_SLAB = new BoxGeometry(LANE_W * 0.92, 1.9, 0.45)
const WALL_STRIP = new BoxGeometry(LANE_W * 0.92, 0.08, 0.5)
const GAP_FRAME = new EdgesGeometry(new BoxGeometry(LANE_W * 0.9, 1.9, 0.45))
const FALLER_BOX = new BoxGeometry(LANE_W * 0.82, 1.3, 1.3)
const FALLER_EDGES = new EdgesGeometry(FALLER_BOX)
const BEAM = new CylinderGeometry(0.45, 0.6, 1, 16, 1, true)
BEAM.translate(0, 0.5, 0)

function sawGeometry() {
  const shape = new Shape()
  const teeth = 14
  for (let i = 0; i <= teeth * 2; i++) {
    const a = (i / (teeth * 2)) * Math.PI * 2
    const r = i % 2 ? 0.55 : 0.78
    const p = new Vector2(Math.cos(a) * r, Math.sin(a) * r)
    if (i === 0) shape.moveTo(p.x, p.y)
    else shape.lineTo(p.x, p.y)
  }
  const geo = new ExtrudeGeometry(shape, {
    depth: 0.14,
    bevelEnabled: true,
    bevelSize: 0.03,
    bevelThickness: 0.03,
    bevelSegments: 1,
  })
  geo.center()
  return geo
}
const SAW = sawGeometry()
const HUB = new CylinderGeometry(0.2, 0.2, 0.3, 16).rotateX(Math.PI / 2)

// ---------- Factories ----------

export function makeShard(): Group {
  const g = new Group()
  const mat = new MeshStandardMaterial({
    color: C.shard,
    emissive: C.shard,
    emissiveIntensity: 0.9,
    flatShading: true,
    roughness: 0.25,
    metalness: 0.4,
  })
  const spin = new Group()
  spin.add(new Mesh(SHARD_CORE, mat))
  // Spikes out along the icosahedron's corners: the "don't touch" read.
  const dirs = [
    [0, 1, 0],
    [0, -1, 0],
    [1, 0.3, 0],
    [-1, 0.3, 0],
    [0, 0.3, 1],
    [0, 0.3, -1],
    [0.7, -0.5, 0.7],
    [-0.7, -0.5, -0.7],
  ]
  for (const d of dirs) {
    const spike = new Mesh(SHARD_SPIKE, mat)
    spike.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(...d).normalize())
    spin.add(spike)
  }
  const heart = new Mesh(
    SHARD_HEART,
    new MeshBasicMaterial({ color: new Color(C.shardCore).multiplyScalar(2) }),
  )
  heart.name = 'heart'
  spin.add(heart)
  // Dark outline shell: keeps the silhouette crisp against a bright daytime sky.
  const outline = new Mesh(SHARD_CORE, OUTLINE)
  outline.scale.setScalar(1.22)
  spin.add(outline)
  spin.position.y = 1
  spin.name = 'spin'
  // Smaller crystals growing out of the track beside it: a cluster.
  for (const [x, z, sc, tilt] of [
    [-0.55, 0.2, 0.45, 0.5],
    [0.5, -0.25, 0.38, -0.6],
  ]) {
    const shardlet = new Mesh(SHARDLET, mat)
    shardlet.position.set(x, sc * 0.6, z)
    shardlet.scale.set(sc, sc * 1.8, sc)
    shardlet.rotation.z = tilt
    g.add(shardlet)
  }
  const halo = glowSprite(C.shard, 0.55)
  halo.scale.setScalar(3)
  halo.position.y = 1
  g.add(spin, halo, groundGlow(C.shard, LANE_W * 0.9, 0.5))
  return g
}

export function makeWisp(): Group {
  const g = new Group()
  const ball = new Mesh(WISP_BALL, new MeshBasicMaterial({ color: new Color(C.wisp).multiplyScalar(2.2) }))
  ball.name = 'ball'
  ball.position.y = 1
  const halo = glowSprite(C.wisp, 0.9)
  halo.scale.setScalar(1.8)
  halo.name = 'halo'
  halo.position.y = 1
  // Little sparkles orbiting the orb, and a soft comet tail behind it.
  for (let i = 0; i < 3; i++) {
    const orb = glowSprite('#ffffff', 0.9)
    orb.scale.setScalar(0.32)
    orb.name = `orb${i}`
    g.add(orb)
  }
  const trail = glowSprite(C.wisp, 0.35)
  trail.name = 'trail'
  trail.scale.set(0.9, 0.9, 1)
  g.add(ball, halo, trail, groundGlow(C.wisp, 1.6, 0.45))
  return g
}

/** Holographic barrier: hazard stripes, rolling scanlines, bright edges. */
function holoMaterial(color: string): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    uniforms: { time: { value: 0 }, color: { value: new Color(color) } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float time; uniform vec3 color; varying vec2 vUv;
      void main() {
        float stripes = step(0.5, fract((vUv.x * 2.2 + vUv.y) * 3.0 - time * 0.8));
        float scan = 0.5 + 0.5 * sin(vUv.y * 70.0 - time * 10.0);
        float edge = max(smoothstep(0.1, 0.0, vUv.y), smoothstep(0.9, 1.0, vUv.y));
        edge = max(edge, max(smoothstep(0.05, 0.0, vUv.x), smoothstep(0.95, 1.0, vUv.x)));
        vec3 dark = vec3(0.07, 0.01, 0.06);
        vec3 col = mix(dark, color * 0.9, 0.35 + stripes * 0.35) + color * (scan * 0.12 + edge * 1.3);
        gl_FragColor = vec4(col, 0.82 + edge * 0.18);
      }`,
  })
}

/** A forward-pointing chevron (^) lying on the track. */
const CHEVRON = (() => {
  const w = LANE_W * 0.28
  const geo = new BufferGeometry()
  geo.setAttribute(
    'position',
    new Float32BufferAttribute([-w, 0, 0.35, 0, 0, -0.35, 0, 0, -0.35, w, 0, 0.35], 3),
  )
  return geo
})()

export function makeWall(): Group {
  const g = new Group()
  const holo = holoMaterial(C.wall)
  holo.name = 'holo'
  const stripMat = new MeshBasicMaterial({ color: new Color(C.wall).multiplyScalar(2.2) })
  const frameMat = new LineBasicMaterial({ color: new Color(C.wisp).multiplyScalar(2), transparent: true })
  for (let l = 0; l < 5; l++) {
    const slab = new Group()
    const body = new Mesh(WALL_SLAB, holo)
    body.position.y = 0.95
    const top = new Mesh(WALL_STRIP, stripMat)
    top.position.y = 1.9
    slab.add(body, top)
    slab.name = `slab${l}`
    g.add(slab)
  }
  const gap = new LineSegments(GAP_FRAME, frameMat)
  gap.position.y = 0.95
  gap.name = 'gap'
  const gapGlow = groundGlow(C.wisp, LANE_W, 0.6)
  gapGlow.name = 'gapGlow'
  // Chevrons in the gap, pointing the way through.
  const chevrons = new Group()
  chevrons.name = 'chevrons'
  for (let i = 0; i < 3; i++) {
    const c = new LineSegments(
      CHEVRON,
      new LineBasicMaterial({ color: new Color(C.wisp).multiplyScalar(2.2), transparent: true }),
    )
    c.position.set(0, 0.05, 1.6 - i * 0.9)
    c.name = `chev${i}`
    chevrons.add(c)
  }
  g.add(gap, gapGlow, chevrons)
  return g
}

export function makeSweeper(): Group {
  const g = new Group()
  const mat = new MeshStandardMaterial({
    color: C.sweeper,
    emissive: C.sweeper,
    emissiveIntensity: 0.8,
    metalness: 0.6,
    roughness: 0.25,
  })
  const saw = new Group()
  saw.add(new Mesh(SAW, mat), new Mesh(HUB, new MeshStandardMaterial({ color: '#1a1030', metalness: 0.8 })))
  saw.position.y = 0.9
  saw.name = 'saw'
  const halo = glowSprite(C.sweeper, 0.5)
  halo.scale.setScalar(2.6)
  halo.position.y = 0.9
  g.add(saw, halo)
  // Trail dots showing where it will cross the player row.
  for (let i = 0; i < 7; i++) {
    const dot = glowSprite(C.sweeper, 0.7)
    dot.scale.setScalar(0.45)
    dot.name = `dot${i}`
    g.add(dot)
  }
  return g
}

export function makeFaller(): Group {
  const g = new Group()
  const block = new Group()
  block.add(
    new Mesh(
      FALLER_BOX,
      new MeshStandardMaterial({
        color: C.faller,
        emissive: '#ffffff',
        emissiveMap: runeTexture(),
        emissiveIntensity: 1.1,
        roughness: 0.35,
        metalness: 0.5,
      }),
    ),
    new LineSegments(
      FALLER_EDGES,
      new LineBasicMaterial({ color: new Color('#ffffff').multiplyScalar(1.5) }),
    ),
  )
  block.name = 'block'
  const beam = new Mesh(
    BEAM,
    new MeshBasicMaterial({
      color: C.faller,
      transparent: true,
      opacity: 0.2,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    }),
  )
  beam.name = 'beam'
  const shadow = groundGlow(C.faller, LANE_W, 0.3)
  shadow.name = 'shadow'
  // Target brackets on the lane: "this spot, soon".
  const reticle = new LineSegments(
    RETICLE,
    new LineBasicMaterial({ color: new Color(C.faller).multiplyScalar(2.2), transparent: true }),
  )
  reticle.position.y = 0.04
  reticle.name = 'reticle'
  // Glow streak above the block while it drops.
  const trail = glowSprite(C.faller, 0)
  trail.name = 'trail'
  g.add(block, beam, shadow, reticle, trail)
  return g
}

/** Four corner brackets of a square, flat on the track. */
const RETICLE = (() => {
  const h = LANE_W * 0.42
  const k = h * 0.45
  const pts: number[] = []
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]) {
    pts.push(sx * h, 0, sz * h, sx * (h - k), 0, sz * h)
    pts.push(sx * h, 0, sz * h, sx * h, 0, sz * (h - k))
  }
  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(pts, 3))
  return geo
})()

let runeTex: CanvasTexture | null = null
/** Glowing rune lines on the falling block's faces. */
function runeTexture(): CanvasTexture {
  if (runeTex) return runeTex
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#3a0c52'
  ctx.fillRect(0, 0, 128, 128)
  ctx.strokeStyle = '#e8b8ff'
  ctx.lineWidth = 5
  ctx.lineCap = 'round'
  ctx.strokeRect(10, 10, 108, 108)
  ctx.beginPath()
  ctx.moveTo(64, 26)
  ctx.lineTo(96, 64)
  ctx.lineTo(64, 102)
  ctx.lineTo(32, 64)
  ctx.closePath()
  ctx.moveTo(64, 44)
  ctx.lineTo(64, 84)
  ctx.moveTo(48, 64)
  ctx.lineTo(80, 64)
  ctx.stroke()
  runeTex = new CanvasTexture(c)
  return runeTex
}

let crackTex: CanvasTexture | null = null
/** Procedural crack texture for slam marks. */
function crackTexture(): CanvasTexture {
  if (crackTex) return crackTex
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const ctx = c.getContext('2d')!
  ctx.strokeStyle = '#fff'
  ctx.lineCap = 'round'
  let seed = 3
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  for (let i = 0; i < 9; i++) {
    let x = 64
    let y = 64
    let a = (i / 9) * Math.PI * 2 + rnd() * 0.5
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(x, y)
    for (let j = 0; j < 5; j++) {
      a += (rnd() - 0.5) * 0.9
      x += Math.cos(a) * (8 + rnd() * 6)
      y += Math.sin(a) * (8 + rnd() * 6)
      ctx.lineTo(x, y)
      ctx.lineWidth = Math.max(1, 3 - j * 0.5)
    }
    ctx.stroke()
  }
  crackTex = new CanvasTexture(c)
  return crackTex
}

/** A glowing crack left on the track by a slam. */
export function makeCrack(): Mesh {
  const m = new Mesh(
    new PlaneGeometry(LANE_W * 1.1, LANE_W * 1.1),
    new MeshBasicMaterial({
      map: crackTexture(),
      color: new Color(C.faller).multiplyScalar(1.6),
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  )
  m.rotation.x = -Math.PI / 2
  m.position.y = 0.03
  return m
}

// ---------- The ghost ----------

/**
 * Body: a soft fake-lit glow (no real lights, so it never recompiles), a
 * glowing fresnel rim, and a tapered tail that waves like cloth, streams back
 * with speed and trails behind a slide.
 */
export function ghostMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    uniforms: {
      time: { value: 0 },
      core: { value: new Color('#6f97b0') },
      rim: { value: new Color(C.wisp) },
      opacity: { value: 1 },
      /** -1…1: how hard it is sliding (the tail swings the other way). */
      slide: { value: 0 },
      /** 0…1: rift speed (the tail streams further back). */
      speed: { value: 0 },
      /** 0…1: wave strength (0 for reduced motion). */
      motion: { value: 1 },
    },
    vertexShader: /* glsl */ `
      uniform float time; uniform float slide; uniform float speed; uniform float motion;
      varying vec3 vNormal; varying vec3 vView; varying vec3 vObjN; varying float vY;
      void main() {
        vec3 p = position;
        // 0 at the waist … 1 at the tail tip.
        float t = clamp((0.75 - p.y) / 1.07, 0.0, 1.0);
        float t2 = t * t;
        float a = atan(p.z, p.x);
        // Waves travel down the tail; the hem ripples.
        p.x += sin(p.y * 7.0 + time * 8.0) * 0.09 * t2 * motion;
        p.z += cos(p.y * 5.0 + time * 6.0) * 0.05 * t2 * motion;
        p.xz *= 1.0 + sin(a * 3.0 - time * 5.0) * 0.05 * t * motion;
        // Trails behind a slide, streams back with speed (forward is -z).
        p.x -= slide * 0.5 * t2;
        p.z += (0.12 + speed * 0.25) * t2;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        vObjN = normal;
        vY = position.y;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 core; uniform vec3 rim; uniform float opacity;
      varying vec3 vNormal; varying vec3 vView; varying vec3 vObjN; varying float vY;
      void main() {
        vec3 n = normalize(vObjN);
        float f = pow(1.0 - abs(dot(normalize(vNormal), vView)), 2.2);
        // Fake key light from the top front left, plus a soft sky term.
        float key = max(dot(n, normalize(vec3(-0.45, 0.8, 0.55))), 0.0);
        float sky = n.y * 0.5 + 0.5;
        vec3 col = core * (0.5 + 0.45 * key + 0.25 * sky);
        // Inner glow: brighter towards the head, a little highlight on top.
        col += core * 0.35 * smoothstep(0.2, 1.4, vY);
        col += vec3(1.0) * pow(key, 14.0) * 0.35;
        col = mix(col, rim * 1.15, f * 0.85);
        // The tail thins out into mist.
        float mist = mix(0.3, 1.0, smoothstep(-0.32, 0.45, vY));
        gl_FragColor = vec4(col, opacity * (0.82 + f * 0.18) * mist);
      }`,
  })
}

const GHOST_BODY = (() => {
  // Profile from the crown down to the tail tip (x = radius, y = height).
  const pts: Vector2[] = []
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * (Math.PI / 2)
    pts.push(new Vector2(Math.sin(a) * 0.62, 1.05 + Math.cos(a) * 0.62))
  }
  pts.push(
    new Vector2(0.64, 0.82),
    new Vector2(0.62, 0.58),
    new Vector2(0.55, 0.36),
    new Vector2(0.42, 0.15),
    new Vector2(0.27, -0.04),
    new Vector2(0.13, -0.2),
    new Vector2(0.02, -0.32),
  )
  return new LatheGeometry(pts, 40)
})()
const EYE = new SphereGeometry(0.09, 12, 10)
/** Wispy arm: a cone hanging from the shoulder, tip down. */
const ARM = new ConeGeometry(0.12, 0.46, 10).rotateX(Math.PI).translate(0, -0.23, 0)
const HORN = new ConeGeometry(0.09, 0.34, 10).translate(0, 0.17, 0)
const CROWN_RING = new TorusGeometry(0.3, 0.035, 6, 24).rotateX(Math.PI / 2)
const CROWN_SPIKE = new ConeGeometry(0.06, 0.22, 4).translate(0, 0.11, 0)
const PETAL = new SphereGeometry(0.1, 10, 8).scale(1, 0.45, 0.6)
const FLOWER_HEART = new SphereGeometry(0.065, 10, 8)
/** Cowl over the head, open at the front (+z) for the face. */
const HOOD = new SphereGeometry(0.7, 28, 14, Math.PI / 2 + 0.85, Math.PI * 2 - 1.7, 0, Math.PI * 0.55)
const HOOD_TIP = new ConeGeometry(0.16, 0.42, 10).translate(0, 0.21, 0)
const HALO = new TorusGeometry(0.34, 0.04, 8, 32).rotateX(Math.PI / 2)

export const SHOULDER_Y = 0.7

export interface GhostModel {
  root: Group
  /** Everything that flickers and leans: body mesh, face, arms, accessories. */
  body: Group
  mat: ShaderMaterial
  /** Eyes and blush: shift with a glance. */
  face: Group
  eyes: Mesh[]
  arms: Mesh[]
  accessories: Record<Exclude<Accessory, 'none'>, Group>
  /** Colours that follow the character (set by {@link applyLook}). */
  paint: {
    eye: MeshBasicMaterial
    blush: SpriteMaterial[]
    arm: MeshBasicMaterial
    accent: MeshBasicMaterial
    glowAccent: MeshBasicMaterial
    petal: MeshBasicMaterial
    hood: MeshBasicMaterial
  }
  /** The character's own core and rim (the uniforms get lerped each frame). */
  core: Color
  rim: Color
}

const basic = (color: string, glow = false) =>
  new MeshBasicMaterial(
    glow ? { color, transparent: true, blending: AdditiveBlending, depthWrite: false } : { color },
  )

export function makeGhost(): GhostModel {
  const root = new Group()
  const body = new Group()
  const mat = ghostMaterial()
  body.add(new Mesh(GHOST_BODY, mat))
  const paint = {
    eye: basic('#1b1240'),
    blush: [] as SpriteMaterial[],
    arm: basic(C.wisp, true),
    accent: basic('#ffffff'),
    glowAccent: basic('#ffffff', true),
    petal: basic('#ff8fc8'),
    hood: new MeshBasicMaterial({ color: '#ffffff', side: DoubleSide }),
  }
  paint.arm.opacity = 0.8

  const face = new Group()
  const eyes: Mesh[] = []
  for (const side of [-1, 1]) {
    const eye = new Mesh(EYE, paint.eye)
    eye.scale.set(1, 1.5, 0.6)
    eye.position.set(side * 0.2, 1.08, 0.56)
    eyes.push(eye)
    face.add(eye)
  }
  // Blush: tiny glows under the eyes.
  for (const side of [-1, 1]) {
    const blush = glowSprite('#ff8fc8', 0.5)
    blush.scale.setScalar(0.28)
    blush.position.set(side * 0.34, 0.9, 0.55)
    paint.blush.push(blush.material)
    face.add(blush)
  }
  body.add(face)

  const arms: Mesh[] = []
  for (const side of [-1, 1]) {
    const arm = new Mesh(ARM, paint.arm)
    arm.position.set(side * 0.56, SHOULDER_Y, 0.12)
    arms.push(arm)
    body.add(arm)
  }

  const horns = new Group()
  for (const side of [-1, 1]) {
    const horn = new Mesh(HORN, paint.accent)
    horn.position.set(side * 0.3, 1.5, 0.08)
    horn.rotation.z = -side * 0.45
    horns.add(horn)
  }
  const crown = new Group()
  crown.add(new Mesh(CROWN_RING, paint.glowAccent))
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + Math.PI / 2
    const spike = new Mesh(CROWN_SPIKE, paint.glowAccent)
    spike.position.set(Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3)
    spike.scale.setScalar(i === 0 ? 1.4 : 1)
    crown.add(spike)
  }
  crown.position.set(0, 1.6, 0)
  const flower = new Group()
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    const petal = new Mesh(PETAL, paint.petal)
    petal.position.set(Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0)
    petal.rotation.z = a
    flower.add(petal)
  }
  flower.add(new Mesh(FLOWER_HEART, paint.accent))
  flower.position.set(0.36, 1.48, 0.32)
  flower.rotation.set(-0.3, 0.5, -0.3)
  const hood = new Group()
  const cowl = new Mesh(HOOD, paint.hood)
  cowl.position.y = 1.05
  const tip = new Mesh(HOOD_TIP, paint.hood)
  tip.position.set(0, 1.62, -0.22)
  tip.rotation.x = -0.6
  hood.add(cowl, tip)
  const halo = new Group()
  halo.add(new Mesh(HALO, paint.glowAccent))
  halo.position.set(0, 1.95, 0)
  body.add(horns, crown, flower, hood, halo)

  root.add(body)
  return {
    root,
    body,
    mat,
    face,
    eyes,
    arms,
    accessories: { horns, crown, flower, hood, halo },
    paint,
    core: new Color('#6f97b0'),
    rim: new Color(C.wisp),
  }
}

/** Dress the ghost as a character: colours and accessory only, no new materials. */
export function applyLook(g: GhostModel, c: Character): void {
  const k = c.colors
  g.core.set(k.core)
  g.rim.set(k.rim)
  g.mat.uniforms.core.value.copy(g.core)
  g.mat.uniforms.rim.value.copy(g.rim)
  g.paint.eye.color.set(k.eye)
  for (const b of g.paint.blush) b.color.set(k.blush)
  g.paint.arm.color.set(k.rim)
  g.paint.accent.color.set(k.accent)
  g.paint.glowAccent.color.set(k.accent)
  g.paint.petal.color.set(k.blush)
  g.paint.hood.color.set(k.accent)
  for (const [name, obj] of Object.entries(g.accessories)) obj.visible = name === c.accessory
}

/** Show every accessory (only while warming up, so all of them get compiled). */
export function showAllAccessories(g: GhostModel): void {
  for (const obj of Object.values(g.accessories)) obj.visible = true
}

/** Faint copies trailing a slide. */
export function makeAfterimage(): Mesh {
  const m = new Mesh(
    GHOST_BODY,
    new MeshBasicMaterial({
      color: C.wisp,
      transparent: true,
      opacity: 0.2,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  )
  return m
}

/** A glowing ribbon behind the ghost: one buffer, rewritten in place each frame. */
export interface Ribbon {
  mesh: Mesh
  material: MeshBasicMaterial
  /** Points along the ribbon (head first). */
  points: number
  position: Float32BufferAttribute
}

export function makeRibbon(points = 16): Ribbon {
  const geo = new BufferGeometry()
  const position = new Float32BufferAttribute(new Float32Array(points * 2 * 3), 3)
  const color = new Float32BufferAttribute(new Float32Array(points * 2 * 3), 3)
  position.setUsage(DynamicDrawUsage)
  geo.setAttribute('position', position)
  geo.setAttribute('color', color)
  const index: number[] = []
  for (let i = 0; i < points - 1; i++) {
    const a = i * 2
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  geo.setIndex(index)
  // Fades along its length: bright at the ghost, black (= invisible, additive) at the end.
  for (let i = 0; i < points; i++) {
    const v = (1 - i / (points - 1)) ** 1.5
    color.setXYZ(i * 2, v, v, v)
    color.setXYZ(i * 2 + 1, v, v, v)
  }
  const material = new MeshBasicMaterial({
    color: C.wisp,
    vertexColors: true,
    transparent: true,
    opacity: 0.6,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  })
  const mesh = new Mesh(geo, material)
  // Its points move every frame; the bounds would always be stale.
  mesh.frustumCulled = false
  return { mesh, material, points, position }
}
