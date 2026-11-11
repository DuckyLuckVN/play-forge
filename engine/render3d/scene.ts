import {
  HalfFloatType,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
  ACESFilmicToneMapping,
  type ToneMapping,
} from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { prefersReducedMotion } from '../fx/tween'
import { SceneAoPass, type AoOptions } from './ao'
import { pickDpr, QualityGovernor, type QualityLevel } from './quality'

export interface Scene3DOptions {
  fov?: number
  far?: number
  /** Cap on pixel density (phones at 3× cost a lot for little gain). */
  maxDpr?: number
  bloom?: { strength: number; radius: number; threshold: number }
  /** Quality ladder, best first (default `QUALITY_LEVELS`). Games add their own extras via `QualityLevel.shadows`. */
  levels?: readonly QualityLevel[]
  /** Ladder index to start at (default 0, the best). Clean frames still probe back up. */
  startLevel?: number
  /** Tone mapping (default ACES filmic) and its exposure (default 1). */
  toneMapping?: ToneMapping
  exposure?: number
  /** Screen-space ambient occlusion, on for levels with `ao: true` (default: none built). */
  ao?: AoOptions
  /** Colour grade in the punch pass (frames that use post only; default: none, the shader is unchanged). */
  grade?: ColorGrade
}

/**
 * A light colour grade on the linear, pre-tone-mapping image: saturation around luma, contrast around
 * mid grey (a power curve, so HDR highlights stay intact) and an rgb tint (1,1,1 = none).
 */
export interface ColorGrade {
  saturation: number
  contrast: number
  tint: readonly [number, number, number]
}

export interface Scene3D {
  renderer: WebGLRenderer
  scene: Scene
  camera: PerspectiveCamera
  /** Wrapper element filling the parent; add overlays here. */
  root: HTMLElement
  /** CSS pixel size of the view. */
  width: number
  height: number
  /** 0..1 screen punch: colour split + dark vignette (hits). */
  glitch: number
  /** Current quality level; `onResize` listeners fire on every change. */
  readonly quality: QualityLevel
  /** Glow strength right now (e.g. softer in daylight). No-op without bloom. */
  setBloom(strength: number): void
  /** Swap the quality ladder (e.g. a player-picked graphics tier), starting at `start`; refits at once. */
  setLevels(levels: readonly QualityLevel[], start?: number): void
  /** Draw one frame through every post pass the view has (bloom, AO), so their shaders compile now. */
  warmPasses(): void
  render(dt: number): void
  onResize(listener: (w: number, h: number) => void): () => void
  destroy(): void
}

/** True when this browser can make a WebGL2 context (three.js needs WebGL2). */
export function webglAvailable(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2')
    // Free the probe context now; browsers cap live contexts and GPU memory.
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
    return !!gl
  } catch {
    return false
  }
}

/** Chromatic split + vignette, driven by `amount`; with the GRADE define, the colour grade first. */
const PunchShader = {
  uniforms: {
    tDiffuse: { value: null },
    amount: { value: 0 },
    saturation: { value: 1 },
    contrast: { value: 1 },
    tint: { value: new Vector3(1, 1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float amount; varying vec2 vUv;
    uniform float saturation; uniform float contrast; uniform vec3 tint;
    void main() {
      vec2 d = (vUv - 0.5) * amount * 0.03;
      vec4 c = texture2D(tDiffuse, vUv);
      c.r = texture2D(tDiffuse, vUv + d).r;
      c.b = texture2D(tDiffuse, vUv - d).b;
      #ifdef GRADE
        vec3 g = max(c.rgb, 0.0) * tint;
        g = 0.18 * pow(g / 0.18, vec3(contrast));
        float l = dot(g, vec3(0.2126, 0.7152, 0.0722));
        c.rgb = max(mix(vec3(l), g, saturation), 0.0);
      #endif
      float v = smoothstep(0.85, 0.2, length(vUv - 0.5));
      c.rgb *= mix(1.0, v, 0.25 + amount * 0.5);
      gl_FragColor = c;
    }`,
}

/** MSAA samples where it is on (WebGL2; tile-based phone GPUs resolve 4× cheaply). */
const MSAA_SAMPLES = 4

/**
 * Hardware antialiasing below 2 device pixels per CSS pixel: there jagged edges are plain to see (desktops,
 * budget phones). Sharper phone screens (DPR 2+) hide them and would pay the most for MSAA, so they skip it.
 */
export function wantsMsaa(deviceDpr: number): boolean {
  return (deviceDpr || 1) < 2
}

/**
 * Whether a frame needs the composer (render target, punch, output passes). Without bloom and with
 * no glitch the punch pass only adds its vignette, which the static VIGNETTE layer draws instead:
 * the scene then renders straight to the canvas (the renderer applies the same tone mapping and
 * sRGB output as OutputPass), two full-screen passes fewer per frame. Phones are fill-bound.
 */
export function needsPost(glitch: number, effectsOn: boolean): boolean {
  return effectsOn || glitch > 0
}

/**
 * The punch shader's vignette at amount 0 (rgb × mix(1, smoothstep(0.85, 0.2, r), 0.25), r in uv
 * units) as a CSS overlay: black at alpha 1 − m^(1/2.2) per stop, the ellipse following the canvas.
 */
const VIGNETTE =
  'radial-gradient(ellipse 100% 100% at 50% 50%, transparent 20%, rgb(0 0 0 / 0.007) 30%, rgb(0 0 0 / 0.026) 40%, rgb(0 0 0 / 0.052) 50%, rgb(0 0 0 / 0.08) 60%, rgb(0 0 0 / 0.106) 70.7%)'

/**
 * A full-size three.js view inside `parent`: renderer, camera, optional bloom
 * and a hit "punch" pass. Pixels are capped to a budget, and quality steps
 * down (fewer pixels, then no bloom) whenever frames miss the refresh rate.
 */
export function createScene3D(parent: HTMLElement, opts: Scene3DOptions = {}): Scene3D {
  const root = document.createElement('div')
  root.className = 'pf-scene3d'
  root.style.cssText = 'position:absolute;inset:0 16px 16px;border-radius:14px;overflow:hidden'
  parent.appendChild(root)

  // MSAA where edges visibly stair-step (see wantsMsaa): on the canvas for frames drawn straight to it,
  // and on the composer's scene target for frames with post effects.
  const msaa = wantsMsaa(window.devicePixelRatio)
  const renderer = new WebGLRenderer({ antialias: msaa, powerPreference: 'high-performance' })
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = opts.toneMapping ?? ACESFilmicToneMapping
  renderer.toneMappingExposure = opts.exposure ?? 1
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%'
  root.appendChild(renderer.domElement)
  // The punch pass's resting vignette (amount 0), as a static layer: frames without post effects
  // draw straight to the canvas and skip two full-screen passes (see needsPost).
  const vignette = document.createElement('div')
  vignette.style.cssText = `position:absolute;inset:0;pointer-events:none;background:${VIGNETTE}`
  root.appendChild(vignette)

  const scene = new Scene()
  const camera = new PerspectiveCamera(opts.fov ?? 60, 1, 0.1, opts.far ?? 400)
  const maxDpr = opts.maxDpr ?? 2
  let quality = new QualityGovernor(opts.levels, opts.startLevel)

  const composer = new EffectComposer(
    renderer,
    msaa ? new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: MSAA_SAMPLES }) : undefined,
  )
  composer.addPass(new RenderPass(scene, camera))
  const ao = opts.ao ? new SceneAoPass(scene, camera, opts.ao) : null
  if (ao) {
    // At no more than CSS resolution, like bloom: the occlusion is soft and denoised anyway.
    const setSize = ao.setSize.bind(ao)
    ao.setSize = (w, h) => {
      const k = Math.min(1, 1 / renderer.getPixelRatio())
      setSize(Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k)))
    }
    ao.enabled = false
    composer.addPass(ao)
  }
  const bloom =
    opts.bloom && !prefersReducedMotion()
      ? new UnrealBloomPass(new Vector2(1, 1), opts.bloom.strength, opts.bloom.radius, opts.bloom.threshold)
      : null
  if (bloom) {
    // Blur at no more than CSS resolution (the pass halves it again): retina
    // detail is invisible in a glow, and this is the most fill-heavy pass.
    const setSize = bloom.setSize.bind(bloom)
    bloom.setSize = (w, h) => {
      const k = Math.min(1, 1 / renderer.getPixelRatio())
      setSize(Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k)))
    }
    composer.addPass(bloom)
  }
  const punch = new ShaderPass(PunchShader)
  if (opts.grade) {
    const g = opts.grade
    punch.material.defines.GRADE = ''
    punch.uniforms.saturation.value = g.saturation
    punch.uniforms.contrast.value = g.contrast
    punch.uniforms.tint.value.set(g.tint[0], g.tint[1], g.tint[2])
  }
  composer.addPass(punch)
  composer.addPass(new OutputPass())

  const listeners = new Set<(w: number, h: number) => void>()
  const view: Scene3D = {
    renderer,
    scene,
    camera,
    root,
    width: 1,
    height: 1,
    glitch: 0,
    setBloom(strength) {
      if (bloom) bloom.strength = strength
    },
    setLevels(levels, start = 0) {
      quality = new QualityGovernor(levels, start)
      fit()
    },
    warmPasses() {
      const bloomWas = bloom?.enabled ?? false
      const aoWas = ao?.enabled ?? false
      if (bloom) bloom.enabled = true
      if (ao) ao.enabled = true
      composer.render(0)
      if (bloom) bloom.enabled = bloomWas
      if (ao) ao.enabled = aoWas
    },
    render,
    onResize(l) {
      listeners.add(l)
      l(view.width, view.height)
      return () => listeners.delete(l)
    },
    get quality() {
      return quality.current
    },
    destroy() {
      observer.disconnect()
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.removeEventListener('webglcontextrestored', fit)
      ao?.dispose()
      composer.dispose()
      renderer.dispose()
      root.remove()
    },
  }

  let lastLevel: QualityLevel | undefined
  function fit() {
    const w = Math.max(1, root.clientWidth)
    const h = Math.max(1, root.clientHeight)
    view.width = w
    view.height = h
    const level = quality.current
    const dpr = pickDpr(window.devicePixelRatio, Math.min(maxDpr, level.dpr), w, h)
    if (import.meta.env.DEV && level !== lastLevel) {
      lastLevel = level
      // eslint-disable-next-line no-console
      console.info('[render3d] quality', quality.level, 'dpr', dpr)
    }
    if (bloom) bloom.enabled = level.bloom
    if (ao) ao.enabled = level.ao === true
    renderer.setPixelRatio(dpr)
    renderer.setSize(w, h, false)
    composer.setPixelRatio(dpr)
    composer.setSize(w, h)
    quality.restart()
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    for (const l of listeners) l(w, h)
  }

  function render(dt: number) {
    if (quality.sample(dt)) fit()
    const post = needsPost(view.glitch, !!bloom?.enabled || !!ao?.enabled)
    vignette.hidden = post
    if (!post) return renderer.render(scene, camera)
    punch.uniforms.amount.value = view.glitch
    composer.render(dt)
  }

  // The GPU dropped our context (usually memory pressure). three.js keeps the
  // scene and re-uploads it on restore; we come back one quality level lower
  // so it is less likely to happen again, with buffers sized for that level.
  const canvas = renderer.domElement
  const onLost = () => quality.stepDown()
  canvas.addEventListener('webglcontextlost', onLost)
  canvas.addEventListener('webglcontextrestored', fit)

  const observer = new ResizeObserver(fit)
  observer.observe(root)
  fit()
  return view
}
