import {
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
  ACESFilmicToneMapping,
} from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { prefersReducedMotion } from '../fx/tween'

export interface Scene3DOptions {
  fov?: number
  far?: number
  /** Cap on pixel density (phones at 3× cost a lot for little gain). */
  maxDpr?: number
  bloom?: { strength: number; radius: number; threshold: number }
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
  /** Glow strength right now (e.g. softer in daylight). No-op without bloom. */
  setBloom(strength: number): void
  render(dt: number): void
  onResize(listener: (w: number, h: number) => void): () => void
  destroy(): void
}

/** True when this browser can make a WebGL2 context (three.js needs WebGL2). */
export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!c.getContext('webgl2')
  } catch {
    return false
  }
}

/** Chromatic split + vignette, driven by `amount`. */
const PunchShader = {
  uniforms: { tDiffuse: { value: null }, amount: { value: 0 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float amount; varying vec2 vUv;
    void main() {
      vec2 d = (vUv - 0.5) * amount * 0.03;
      vec4 c = texture2D(tDiffuse, vUv);
      c.r = texture2D(tDiffuse, vUv + d).r;
      c.b = texture2D(tDiffuse, vUv - d).b;
      float v = smoothstep(0.85, 0.2, length(vUv - 0.5));
      c.rgb *= mix(1.0, v, 0.25 + amount * 0.5);
      gl_FragColor = c;
    }`,
}

/** Frames measured before deciding whether this device can afford bloom. */
const PROBE_FRAMES = 90
const SLOW_FRAME = 1 / 42

/**
 * A full-size three.js view inside `parent`: renderer, camera, optional bloom
 * and a hit "punch" pass. Quality drops automatically (no bloom, 1× pixels)
 * when the device can't keep up.
 */
export function createScene3D(parent: HTMLElement, opts: Scene3DOptions = {}): Scene3D {
  const root = document.createElement('div')
  root.style.cssText = 'position:absolute;inset:0 16px 16px;border-radius:14px;overflow:hidden'
  parent.appendChild(root)

  const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%'
  root.appendChild(renderer.domElement)

  const scene = new Scene()
  const camera = new PerspectiveCamera(opts.fov ?? 60, 1, 0.1, opts.far ?? 400)
  let maxDpr = opts.maxDpr ?? 2

  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  const bloom =
    opts.bloom && !prefersReducedMotion()
      ? new UnrealBloomPass(new Vector2(1, 1), opts.bloom.strength, opts.bloom.radius, opts.bloom.threshold)
      : null
  if (bloom) composer.addPass(bloom)
  const punch = new ShaderPass(PunchShader)
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
    render,
    onResize(l) {
      listeners.add(l)
      l(view.width, view.height)
      return () => listeners.delete(l)
    },
    destroy() {
      observer.disconnect()
      composer.dispose()
      renderer.dispose()
      root.remove()
    },
  }

  function fit() {
    const w = Math.max(1, root.clientWidth)
    const h = Math.max(1, root.clientHeight)
    view.width = w
    view.height = h
    const dpr = Math.min(maxDpr, window.devicePixelRatio || 1)
    renderer.setPixelRatio(dpr)
    renderer.setSize(w, h, false)
    composer.setPixelRatio(dpr)
    composer.setSize(w, h)
    // Bloom at half resolution: it's blurry anyway.
    bloom?.resolution.set(w / 2, h / 2)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    for (const l of listeners) l(w, h)
  }

  let frames = 0
  let slowTime = 0
  function render(dt: number) {
    if (frames < PROBE_FRAMES) {
      frames++
      slowTime += dt
      if (frames === PROBE_FRAMES && slowTime / PROBE_FRAMES > SLOW_FRAME) {
        if (bloom) bloom.enabled = false
        maxDpr = 1
        fit()
      }
    }
    punch.uniforms.amount.value = view.glitch
    composer.render(dt)
  }

  const observer = new ResizeObserver(fit)
  observer.observe(root)
  fit()
  return view
}
