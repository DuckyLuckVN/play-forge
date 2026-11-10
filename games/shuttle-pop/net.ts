// The badminton net: weighted posts, a fine dark see-through mesh that sags a little between them, the
// white top tape (the height reference), white side tapes and a bottom cord. A shuttle into the net
// sends a damped ripple across it (a vertex offset driven by two uniforms: no per-frame allocation).
//
// Pure helpers first (tested: net.test.ts); the three.js build is `Net`. The ripple is analytic in the
// time since the hit, so it looks the same at any frame rate.

import {
  CylinderGeometry,
  DataTexture,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  BoxGeometry,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  type BufferGeometry,
  type Material,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

/** Net look (m). Real nets: 0.76 deep, a 75 mm tape, and the top dips ~25 mm mid-span. */
export const NET = {
  depth: 0.76,
  tape: 0.075,
  tapeThick: 0.022,
  sideTape: 0.04,
  cord: 0.014,
  /** Top / bottom sag mid-span. */
  sagTop: 0.025,
  sagBottom: 0.05,
  /** Mesh cell on screen (bigger than real, so the far net doesn't shimmer) and the texture tile. */
  cell: 0.055,
  tile: 32,
  thread: 2,
  /** Thread colour (dark plum, like the shuttle rim) and opacity. */
  threadRgb: [43, 36, 54] as const,
  threadAlpha: 225,
  postR: 0.045,
  baseR: 0.18,
  colors: { tape: '#ffffff', post: '#6b5b73' },
} as const

/**
 * Ripple feel: `amp` (m) at the hit, `decay` (1/s) of the envelope, `omega` (rad/s) of the wobble,
 * `k` (rad/m) of the wave travelling out along the net, `fall` (1/m) of its reach, `life` (s) until rest, `lift` = rise per metre of swing (reads from the
 * camera behind the baseline).
 */
export const RIPPLE = { amp: 0.12, decay: 3.6, omega: 24, k: 5, fall: 0.9, life: 1.4, lift: 0.45 } as const
/** How much the stiff top tape moves compared with the bottom of the mesh. */
const TAPE_WOBBLE = 0.35

/** Sag along the span, u ∈ [0, 1] post to post: 0 at the posts, 1 mid-span. */
export const sagAt = (u: number) => 4 * u * (1 - u)

/** How far a point of the net may move: 0 at the posts, the tape (v = 0) stiffer than the bottom (v = 1). */
export const wobbleWeight = (u: number, v: number) =>
  Math.sin(Math.PI * u) * (TAPE_WOBBLE + (1 - TAPE_WOBBLE) * v)

/**
 * Net offset (m, along z; × wobbleWeight) at `dx` m from the hit, for a ripple at envelope `env` and
 * phase `phase` (NetRipple). The vertex shader computes the same thing.
 */
export function rippleOffset(env: number, phase: number, dx: number): number {
  const d = Math.abs(dx)
  return env * Math.sin(phase - RIPPLE.k * d) * Math.exp(-RIPPLE.fall * d)
}

/**
 * Full vertex displacement for a point with wobble weight `w` at `dx` from the hit: z = the swing
 * (rippleOffset × w), y = the pendulum lift. Written into `out`. RIPPLE_GLSL is the same in the shader.
 */
export function rippleDisplace(
  env: number,
  phase: number,
  dx: number,
  w: number,
  out: { y: number; z: number },
): { y: number; z: number } {
  const off = w * rippleOffset(env, phase, dx)
  out.z = off
  out.y = RIPPLE.lift * Math.abs(off)
  return out
}

const f = (n: number) => n.toFixed(4)
/**
 * The vertex shader's ripple (inputs: position, aWobble, uNetEnv, uNetPhase, uNetHitX; output:
 * transformed). net.test.ts checks it against rippleDisplace.
 */
export const RIPPLE_GLSL = `
float d = abs(position.x - uNetHitX);
float off = aWobble * uNetEnv * sin(uNetPhase - ${f(RIPPLE.k)} * d) * exp(-${f(RIPPLE.fall)} * d);
transformed.z += off;
transformed.y += ${f(RIPPLE.lift)} * abs(off);
`

/** The ripple's state: kicked by a net hit, read every frame (env, phase). Pure. */
export class NetRipple {
  /** Signed envelope (m): + pushes toward +z. 0 = at rest. */
  env = 0
  phase = 0
  hitX = 0
  private amp = 0
  private age = 0

  /** The shuttle hit the net at x, travelling toward `dir` (+1 = +z). */
  kick(x: number, dir: 1 | -1) {
    this.amp = dir * Math.max(RIPPLE.amp, Math.abs(this.env))
    this.age = 0
    this.hitX = x
    this.env = this.amp
    this.phase = 0
  }

  update(dt: number) {
    if (this.amp === 0) return
    this.age += dt
    if (this.age >= RIPPLE.life) return this.reset()
    this.env = this.amp * Math.exp(-RIPPLE.decay * this.age)
    this.phase = RIPPLE.omega * this.age
  }

  reset() {
    this.amp = this.env = this.phase = this.age = 0
  }
}

/**
 * One RGBA tile of square mesh, `size` px, threads `line` px wide along the top and left edges. Every
 * pixel has the thread colour (only alpha differs), so mipmaps fade to a light tint, never a dark rim.
 */
export function meshTile(size: number, line: number): Uint8Array {
  const px = new Uint8Array(size * size * 4)
  const [r, g, b] = NET.threadRgb
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      px[i] = r
      px[i + 1] = g
      px[i + 2] = b
      px[i + 3] = x < line || y < line ? NET.threadAlpha : 0
    }
  return px
}

/**
 * Bend a net part into the sag and tag each vertex with its wobble weight (`aWobble`). The geometry is
 * in net space: x ∈ [−half, half] post to post, y from `top` (the tape) down `depth`.
 */
function bend(geo: BufferGeometry, half: number, top: number): BufferGeometry {
  const pos = geo.getAttribute('position')
  const w = new Float32Array(pos.count)
  for (let i = 0; i < pos.count; i++) {
    const u = Math.min(1, Math.max(0, (pos.getX(i) + half) / (2 * half)))
    const v = Math.min(1, Math.max(0, (top - pos.getY(i)) / NET.depth))
    pos.setY(i, pos.getY(i) - sagAt(u) * (NET.sagTop + (NET.sagBottom - NET.sagTop) * v))
    w[i] = wobbleWeight(u, v)
  }
  geo.setAttribute('aWobble', new Float32BufferAttribute(w, 1))
  return geo
}

/** Uniforms the ripple patch reads (shared by the mesh and the tapes). */
interface RippleUniforms {
  uNetEnv: { value: number }
  uNetPhase: { value: number }
  uNetHitX: { value: number }
}

/** Patch a built-in material with RIPPLE_GLSL (same maths as rippleDisplace). */
function addRipple(mat: Material, uniforms: RippleUniforms) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms)
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float uNetEnv;\nuniform float uNetPhase;\nuniform float uNetHitX;\nattribute float aWobble;',
      )
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n{${RIPPLE_GLSL}}`)
  }
  mat.customProgramCacheKey = () => 'sp-net-ripple'
}

/** The net in the scene (centred on x = 0, z = 0). `span` = post x; `top` = net height. */
export class Net {
  readonly group = new Group()
  readonly ripple = new NetRipple()
  private uniforms: RippleUniforms = {
    uNetEnv: { value: 0 },
    uNetPhase: { value: 0 },
    uNetHitX: { value: 0 },
  }

  constructor(span: number, top: number, anisotropy: number) {
    const half = span - NET.postR
    const W = half * 2

    // Mesh: a repeating tile with mipmaps + anisotropy (fine up close, an even light tint far away).
    const tex = new DataTexture(meshTile(NET.tile, NET.thread), NET.tile, NET.tile)
    tex.wrapS = tex.wrapT = RepeatWrapping
    tex.magFilter = LinearFilter
    tex.minFilter = LinearMipmapLinearFilter
    tex.generateMipmaps = true
    tex.anisotropy = Math.min(8, anisotropy)
    tex.colorSpace = SRGBColorSpace
    tex.repeat.set(W / NET.cell, NET.depth / NET.cell)
    tex.needsUpdate = true
    const meshMat = new MeshBasicMaterial({
      map: tex,
      transparent: true,
      side: DoubleSide,
      depthWrite: false,
    })
    addRipple(meshMat, this.uniforms)
    const mesh = bend(new PlaneGeometry(W, NET.depth, 48, 6).translate(0, top - NET.depth / 2, 0), half, top)
    const meshObj = new Mesh(mesh, meshMat)
    meshObj.renderOrder = 1

    // Tapes + cord (one white, slightly glossy mesh; a touch of glow keeps the tape a clear white line).
    const tapes = [
      new BoxGeometry(W, NET.tape, NET.tapeThick, 48, 1, 1).translate(0, top - NET.tape / 2, 0),
      new BoxGeometry(W, NET.cord, NET.cord, 48, 1, 1).translate(0, top - NET.depth + NET.cord / 2, 0),
    ]
    for (const s of [-1, 1])
      tapes.push(
        new BoxGeometry(NET.sideTape, NET.depth, NET.tapeThick * 0.8).translate(
          s * (half - NET.sideTape / 2),
          top - NET.depth / 2,
          0,
        ),
      )
    const tapeMat = new MeshStandardMaterial({
      color: NET.colors.tape,
      roughness: 0.32,
      emissive: NET.colors.tape,
      emissiveIntensity: 0.35,
    })
    addRipple(tapeMat, this.uniforms)
    const tape = new Mesh(mergeGeometries(tapes.map((g) => bend(g, half, top))), tapeMat)

    // Posts: rounded caps, weighted dome bases (toy style, one merged mesh).
    const posts: BufferGeometry[] = []
    for (const s of [-1, 1]) {
      const x = s * span
      posts.push(
        new CylinderGeometry(NET.postR, NET.postR * 1.15, top, 14).translate(x, top / 2, 0),
        new SphereGeometry(NET.postR * 1.35, 14, 8).translate(x, top + 0.01, 0),
        new CylinderGeometry(NET.baseR, NET.baseR * 1.1, 0.06, 22).translate(x, 0.03, 0),
        new SphereGeometry(NET.baseR, 22, 8, 0, Math.PI * 2, 0, Math.PI / 2)
          .scale(1, 0.45, 1)
          .translate(x, 0.06, 0),
      )
    }
    const post = new Mesh(
      mergeGeometries(posts),
      new MeshStandardMaterial({ color: NET.colors.post, roughness: 0.45 }),
    )

    this.group.add(post, tape, meshObj)
  }

  /** The shuttle hit the net at render x, travelling toward `dir` (+1 = +z). */
  hit(x: number, dir: 1 | -1) {
    this.ripple.kick(x, dir)
    this.sync()
  }

  update(dt: number) {
    this.ripple.update(dt)
    this.sync()
  }

  reset() {
    this.ripple.reset()
    this.sync()
  }

  private sync() {
    const u = this.uniforms
    u.uNetEnv.value = this.ripple.env
    u.uNetPhase.value = this.ripple.phase
    u.uNetHitX.value = this.ripple.hitX
  }
}
