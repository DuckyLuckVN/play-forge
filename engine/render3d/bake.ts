// Cooked static lighting for a fixed sun: bake the static scenery's sun shadows and contact occlusion
// onto the ground once (at load / on a layout change) instead of every frame. The bake is one shading
// texture over a ground area; `groundShadeOverlay` multiplies it over whatever ground lies beneath (any
// number of ground meshes, any materials). Static casters can then stop casting live shadows: the
// per-frame shadow map only has the moving things left, and no screen-space AO pass is needed.
//
// How: the casters (marked on a layer) are drawn twice with a projecting shader, no lights or camera:
//   1. shadow: each vertex slid along the sun ray down to y = 0 (groundShadowPoint), drawn black on white;
//   2. contact: straight down, the lowest height over each texel kept (min blending), as height / aoHeight.
// Both are blurred (soft penumbra, wide contact falloff) and combined into the shade (shadeOf).

import {
  Color,
  CustomBlending,
  DoubleSide,
  MinEquation,
  Mesh,
  NoBlending,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  ShaderMaterial,
  SrcColorFactor,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  ZeroFactor,
  LinearFilter,
  type Material,
  type Object3D,
  type Scene,
  type Texture,
  type WebGLRenderer,
} from 'three'
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js'

/** The ground rectangle (world x / z, m) the bake covers. */
export interface BakeArea {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export interface GroundBakeOptions {
  area: BakeArea
  /** Direction from the scene toward the sun (need not be normalized; y > 0). */
  sun: { x: number; y: number; z: number }
  /** Texture edge (px). */
  res?: number
  /** Darkening in full shadow, 0..1 (the sky light keeps the rest: 0.6 → shade 0.4). */
  shadow?: number
  /** Darkening right under an occluder, 0..1. */
  ao?: number
  /** Occluders at or above this height (m) add no contact darkening. */
  aoHeight?: number
  /** Blur radii (m): shadow penumbra and contact falloff. */
  shadowBlur?: number
  aoBlur?: number
  /** Which objects under the casters take part (default: those that cast shadows). */
  filter?: (o: Object3D) => boolean
}

/** Layer the casters are put on for the bake (cleared after). */
export const BAKE_LAYER = 31

/** Where world point `p` casts onto the ground (y = 0), along the ray away from the sun. */
export function groundShadowPoint(
  p: { x: number; y: number; z: number },
  sun: { x: number; y: number; z: number },
): { x: number; z: number } {
  return { x: p.x - (p.y * sun.x) / sun.y, z: p.z - (p.y * sun.z) / sun.y }
}

/** The bake texture coordinate of world (x, z): 0..1 across the area, u along +x, v along +z. */
export function areaUv(x: number, z: number, a: BakeArea): [number, number] {
  return [(x - a.minX) / (a.maxX - a.minX), (z - a.minZ) / (a.maxZ - a.minZ)]
}

/**
 * The shade multiplier: `lit` = 1 in open sun .. 0 in full shadow, `open` = 1 with nothing low above ..
 * 0 right under an occluder. 1 = unchanged.
 */
export function shadeOf(lit: number, open: number, o: { shadow: number; ao: number }): number {
  return (1 - o.shadow * (1 - lit)) * (1 - o.ao * (1 - open))
}

const PROJECT_VERT = /* glsl */ `
#include <common>
uniform vec3 sunSlope;  // (sun.x / sun.y, 0, sun.z / sun.y); zero = straight down
uniform vec2 areaMin;
uniform vec2 areaSize;
varying float vHeight;
void main() {
  vec4 p = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    p = instanceMatrix * p;
  #endif
  vec4 w = modelMatrix * p;
  vHeight = w.y;
  vec2 g = w.xz - w.y * sunSlope.xz;
  vec2 uv = (g - areaMin) / areaSize;
  gl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0);
}`

const SHADOW_FRAG = /* glsl */ `
void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); }`

const HEIGHT_FRAG = /* glsl */ `
uniform float aoHeight;
varying float vHeight;
void main() { gl_FragColor = vec4(vec3(clamp(vHeight / aoHeight, 0.0, 1.0)), 1.0); }`

const BLUR_FRAG = /* glsl */ `
uniform sampler2D src;
uniform vec2 step;  // texel offset per tap (one axis)
varying vec2 vUv;
void main() {
  // 9-tap Gaussian (sigma ~ 2 taps).
  float w[5] = float[](0.2270, 0.1945, 0.1216, 0.0541, 0.0162);
  float s = texture2D(src, vUv).r * w[0];
  for (int i = 1; i < 5; i++) {
    s += texture2D(src, vUv + step * float(i)).r * w[i];
    s += texture2D(src, vUv - step * float(i)).r * w[i];
  }
  gl_FragColor = vec4(vec3(s), 1.0);
}`

const COMBINE_FRAG = /* glsl */ `
uniform sampler2D litMap;
uniform sampler2D openMap;
uniform float shadow;
uniform float ao;
varying vec2 vUv;
void main() {
  float lit = texture2D(litMap, vUv).r;
  float open = texture2D(openMap, vUv).r;
  float shade = (1.0 - shadow * (1.0 - lit)) * (1.0 - ao * (1.0 - open));
  gl_FragColor = vec4(vec3(shade), 1.0);
}`

const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`

const target = (res: number) =>
  new WebGLRenderTarget(res, res, {
    format: RGBAFormat,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    depthBuffer: false,
  })

/** A baked ground shade (a texture over `area`); dispose when the layout changes. */
export interface GroundBake {
  texture: Texture
  area: BakeArea
  dispose(): void
}

/**
 * Bake `casters`' (static scenery in `scene`; their visible meshes passing `filter`) sun shadows and
 * contact occlusion onto the ground `area`.
 * GPU work once (a few ms); renderer state (target, clear colour, autoClear, scene background / override
 * material) is restored. The casters' own visibility, materials and shadow flags are untouched.
 */
export function bakeGround(
  renderer: WebGLRenderer,
  scene: Scene,
  casters: readonly Object3D[],
  opts: GroundBakeOptions,
): GroundBake {
  const res = opts.res ?? 1024
  const { area, sun } = opts
  const size = new Vector2(area.maxX - area.minX, area.maxZ - area.minZ)
  const min = new Vector2(area.minX, area.minZ)
  const sunSlope = new Vector3(sun.x / sun.y, 0, sun.z / sun.y)
  const aoHeight = opts.aoHeight ?? 1.5

  const shadowMat = new ShaderMaterial({
    vertexShader: PROJECT_VERT,
    fragmentShader: SHADOW_FRAG,
    uniforms: { sunSlope: { value: sunSlope }, areaMin: { value: min }, areaSize: { value: size } },
    side: DoubleSide,
    depthTest: false,
    depthWrite: false,
  })
  const heightMat = new ShaderMaterial({
    vertexShader: PROJECT_VERT,
    fragmentShader: HEIGHT_FRAG,
    uniforms: {
      sunSlope: { value: new Vector3() },
      areaMin: { value: min },
      areaSize: { value: size },
      aoHeight: { value: aoHeight },
    },
    side: DoubleSide,
    depthTest: false,
    depthWrite: false,
    blending: CustomBlending,
    blendEquation: MinEquation,
  })

  // Any camera works for the projecting shader; this one only has to keep everything inside its frustum.
  const cam = new OrthographicCamera(-2000, 2000, 2000, -2000, -2000, 2000)
  cam.layers.set(BAKE_LAYER)
  const takes = opts.filter ?? ((o: Object3D) => o.castShadow)
  for (const c of casters) c.traverse((o) => takes(o) && o.layers.enable(BAKE_LAYER))

  const prevTarget = renderer.getRenderTarget()
  const prevAutoClear = renderer.autoClear
  const prevClear = renderer.getClearColor(new Color())
  const prevAlpha = renderer.getClearAlpha()
  const prevBg = scene.background
  const prevOverride = scene.overrideMaterial
  scene.background = null
  renderer.autoClear = true

  const lit = target(res)
  const open = target(res)
  const tmp = target(res)
  const out = target(res)
  const draw = (rt: WebGLRenderTarget, mat: Material) => {
    scene.overrideMaterial = mat
    renderer.setRenderTarget(rt)
    renderer.setClearColor(0xffffff, 1)
    renderer.clear()
    renderer.render(scene, cam)
  }
  draw(lit, shadowMat)
  draw(open, heightMat)
  scene.overrideMaterial = prevOverride
  scene.background = prevBg
  for (const c of casters) c.traverse((o) => o.layers.disable(BAKE_LAYER))

  const blurMat = new ShaderMaterial({
    vertexShader: QUAD_VERT,
    fragmentShader: BLUR_FRAG,
    uniforms: { src: { value: null }, step: { value: new Vector2() } },
    blending: NoBlending,
    depthTest: false,
    depthWrite: false,
  })
  const quad = new FullScreenQuad(blurMat)
  /** Separable blur of `rt` in place: the 4 taps each side span `metres`. */
  const blur = (rt: WebGLRenderTarget, metres: number) => {
    const texel = metres / 4 / (size.x / res)
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
    ] as const) {
      const from = dx ? rt : tmp
      const to = dx ? tmp : rt
      blurMat.uniforms.src.value = from.texture
      blurMat.uniforms.step.value.set((dx * texel) / res, (dy * texel) / res)
      renderer.setRenderTarget(to)
      quad.render(renderer)
    }
  }
  blur(lit, opts.shadowBlur ?? 0.25)
  blur(open, opts.aoBlur ?? 0.8)

  quad.material = new ShaderMaterial({
    vertexShader: QUAD_VERT,
    fragmentShader: COMBINE_FRAG,
    uniforms: {
      litMap: { value: lit.texture },
      openMap: { value: open.texture },
      shadow: { value: opts.shadow ?? 0.6 },
      ao: { value: opts.ao ?? 0.3 },
    },
    blending: NoBlending,
    depthTest: false,
    depthWrite: false,
  })
  renderer.setRenderTarget(out)
  quad.render(renderer)

  renderer.setRenderTarget(prevTarget)
  renderer.setClearColor(prevClear, prevAlpha)
  renderer.autoClear = prevAutoClear
  for (const m of [shadowMat, heightMat, blurMat, quad.material]) m.dispose()
  quad.dispose()
  for (const rt of [lit, open, tmp]) rt.dispose()
  return { texture: out.texture, area, dispose: () => out.dispose() }
}

const OVERLAY_VERT = /* glsl */ `
varying vec2 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`

const OVERLAY_FRAG = /* glsl */ `
uniform sampler2D shadeMap;
uniform vec2 areaMin;
uniform vec2 areaSize;
varying vec2 vWorld;
void main() {
  vec2 uv = (vWorld - areaMin) / areaSize;
  float shade = texture2D(shadeMap, uv).r;
  gl_FragColor = vec4(vec3(shade), 1.0);
  #include <colorspace_fragment>
}`

/**
 * A flat quad over the bake's area at height `y` that multiplies the ground beneath by the baked shade
 * (drawn after the opaque ground; players and props in front of it hide it by depth). One draw call.
 */
export function groundShadeOverlay(bake: GroundBake, y = 0.01): Mesh {
  const a = bake.area
  const w = a.maxX - a.minX
  const d = a.maxZ - a.minZ
  const mat = new ShaderMaterial({
    vertexShader: OVERLAY_VERT,
    fragmentShader: OVERLAY_FRAG,
    uniforms: {
      shadeMap: { value: bake.texture },
      areaMin: { value: new Vector2(a.minX, a.minZ) },
      areaSize: { value: new Vector2(w, d) },
    },
    transparent: true,
    depthWrite: false,
    blending: CustomBlending,
    blendSrc: ZeroFactor,
    blendDst: SrcColorFactor,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  })
  const mesh = new Mesh(new PlaneGeometry(w, d), mat)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set((a.minX + a.maxX) / 2, y, (a.minZ + a.maxZ) / 2)
  mesh.renderOrder = -1
  mesh.name = 'groundShade'
  return mesh
}
