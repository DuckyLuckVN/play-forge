// Screen-space ambient occlusion for Scene3D: three's GTAOPass, made safe for game scenes.
//
// GTAOPass draws the whole scene once more with a normal material to get depth + normals. Anything
// see-through (sprites, glows, nets: no depth write) would then turn into a solid wall in that buffer and
// darken what is behind it, so those are hidden for that pass only. Points / lines the pass already skips.

import type { Camera, Object3D, Scene, WebGLRenderer, WebGLRenderTarget } from 'three'
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js'

export interface AoOptions {
  /** Blend of the occlusion into the image, 0..1 (keep it low: soft contact shading, not grime). */
  intensity: number
  /** World-space sample radius (m). */
  radius: number
  /** How fast occlusion fades with distance (higher = only close contacts). */
  distanceFallOff?: number
  /** Occluder thickness (m): thin props stop casting a wide dark halo. */
  thickness?: number
}

/** True for things the AO depth pass must not see: sprites and any mesh that does not write depth. */
export function aoSkips(o: Object3D): boolean {
  if ((o as { isSprite?: boolean }).isSprite) return true
  const m = (o as { material?: { depthWrite?: boolean } | { depthWrite?: boolean }[] }).material
  if (!m) return false
  return Array.isArray(m) ? m.some((x) => x.depthWrite === false) : m.depthWrite === false
}

/** GTAO that leaves see-through objects out of its depth / normal pass. Allocates nothing per frame. */
export class SceneAoPass extends GTAOPass {
  private hidden: Object3D[] = []
  private readonly collect = (o: Object3D) => {
    if (aoSkips(o)) this.hidden.push(o)
  }

  constructor(scene: Scene, camera: Camera, opts: AoOptions) {
    super(scene, camera, 1, 1)
    this.blendIntensity = opts.intensity
    this.updateGtaoMaterial({
      radius: opts.radius,
      distanceFallOff: opts.distanceFallOff ?? 1,
      thickness: opts.thickness ?? 1,
    })
  }

  render(
    renderer: WebGLRenderer,
    writeBuffer: WebGLRenderTarget,
    readBuffer: WebGLRenderTarget,
    deltaTime: number,
    maskActive: boolean,
  ): void {
    const hidden = this.hidden
    this.scene.traverseVisible(this.collect)
    for (const o of hidden) o.visible = false
    super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive)
    for (const o of hidden) o.visible = true
    hidden.length = 0
  }
}
