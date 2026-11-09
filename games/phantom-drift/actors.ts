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
  LinearFilter,
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
  SRGBColorSpace,
  Vector2,
  Vector3,
  DynamicDrawUsage,
} from 'three'
import { glowTexture } from '@forge/render3d'
import { drawGhost2D, type GhostLook, type GhostPose } from './ghost2d'
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

/** The HUD's heart, extruded and bevelled (same curves, y up). */
function heartGeometry() {
  const k = 0.05
  const shape = new Shape()
  shape.moveTo(0, -9 * k)
  shape.bezierCurveTo(-14 * k, 1 * k, -8 * k, 12 * k, 0, 5 * k)
  shape.bezierCurveTo(8 * k, 12 * k, 14 * k, 1 * k, 0, -9 * k)
  const geo = new ExtrudeGeometry(shape, {
    depth: 0.18,
    bevelEnabled: true,
    bevelSize: 0.07,
    bevelThickness: 0.08,
    bevelSegments: 4,
    curveSegments: 18,
  })
  geo.center()
  return geo
}
const HEART = heartGeometry()
const HEART_SHINE = new SphereGeometry(0.09, 10, 8)
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

/**
 * Heart pickup: the HUD's glossy heart in 3D, with a dark outline shell, a
 * shine, a soft pink glow and orbiting sparkles so it never reads as a hazard.
 */
export function makeHeart(): Group {
  const g = new Group()
  const body = new Group()
  body.name = 'body'
  body.position.y = 1.1
  const mat = new MeshStandardMaterial({
    color: C.heart,
    emissive: C.heart,
    emissiveIntensity: 0.55,
    roughness: 0.18,
    metalness: 0.1,
  })
  const outline = new Mesh(HEART, OUTLINE)
  outline.scale.setScalar(1.12)
  const shine = new Mesh(HEART_SHINE, new MeshBasicMaterial({ color: '#ffffff' }))
  shine.scale.set(1.4, 0.8, 0.6)
  shine.position.set(-0.22, 0.2, 0.2)
  shine.rotation.z = 0.7
  body.add(new Mesh(HEART, mat), outline, shine)
  body.scale.setScalar(1.25)
  const halo = glowSprite('#ff8fa6', 0.75)
  halo.scale.setScalar(2.4)
  halo.name = 'halo'
  halo.position.y = 1.1
  for (let i = 0; i < 2; i++) {
    const orb = glowSprite('#ffffff', 0.9)
    orb.scale.setScalar(0.3)
    orb.name = `orb${i}`
    g.add(orb)
  }
  g.add(body, halo, groundGlow(C.heart, 1.8, 0.5))
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
//
// The ghost is the picker's 2D drawing ({@link drawGhost2D}) on a card that
// always faces the camera: one look everywhere, kept in sync for free. The
// canvas is redrawn each frame (pose, blink, peek, tint) and re-uploaded.

/** Canvas pixels across the ghost card (square). */
const GHOST_PX = 384
/** Design units (ghost2d) across the card: the ghost plus room to lean, glow and wear a halo. */
const GHOST_SPAN = 104
/** World units per design unit: the size the old 3D ghost had on screen. */
const GHOST_UNIT = 0.025
/** World size of the card. */
export const GHOST_SIZE = GHOST_SPAN * GHOST_UNIT
/** The card's centre (the drawing's pivot) above the ghost's base (its skirt hem). */
export const GHOST_PIVOT = 38 * GHOST_UNIT
/** Head centre above the base (where its light hangs). */
export const GHOST_HEAD = 44 * GHOST_UNIT
const PX_PER_UNIT = GHOST_PX / GHOST_SPAN
/**
 * The card's colour multiplier: the frame is tone-mapped and bloomed after
 * drawing, which would wash the picker's colours out to near white.
 */
export const GHOST_BRIGHTNESS = 0.75

export interface GhostModel {
  sprite: Sprite
  material: SpriteMaterial
  texture: CanvasTexture
  ctx: CanvasRenderingContext2D | null
}

/** Built once; `canvas` is injectable for tests. */
export function makeGhost(canvas: HTMLCanvasElement = document.createElement('canvas')): GhostModel {
  canvas.width = canvas.height = GHOST_PX
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  // Redrawn every frame: skip rebuilding mipmaps each time.
  texture.generateMipmaps = false
  texture.minFilter = LinearFilter
  const material = new SpriteMaterial({ map: texture, transparent: true, depthWrite: false })
  material.color.setScalar(GHOST_BRIGHTNESS)
  const sprite = new Sprite(material)
  sprite.scale.set(GHOST_SIZE, GHOST_SIZE, 1)
  return { sprite, material, texture, ctx: canvas.getContext('2d') }
}

/** Redraw the card: the same drawing as the picker, in `pose`. */
export function paintGhost(g: GhostModel, look: GhostLook, pose: GhostPose, tint?: string): void {
  const { ctx } = g
  if (!ctx) return
  ctx.clearRect(0, 0, GHOST_PX, GHOST_PX)
  drawGhost2D(ctx, GHOST_PX / 2, GHOST_PX / 2 + 38 * PX_PER_UNIT, look, pose, PX_PER_UNIT, tint)
  g.texture.needsUpdate = true
}

/** Faint copies trailing a slide: the ghost's own card, tinted and additive. */
export function makeAfterimage(texture: CanvasTexture): Sprite {
  return new Sprite(
    new SpriteMaterial({
      map: texture,
      color: C.wisp,
      transparent: true,
      opacity: 0.2,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  )
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
