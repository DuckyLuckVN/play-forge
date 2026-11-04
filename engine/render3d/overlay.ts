import { pickDpr } from './quality'

/**
 * A transparent 2D canvas stacked over a 3D view, for HUDs and floating text.
 * Draw in CSS pixels; HiDPI is handled (capped by the same pixel budget as
 * the 3D view, since clearing + compositing it costs fill every frame).
 */
export interface Overlay2D {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  /** Clears and resets the transform; call at the start of each frame. */
  begin(): void
  resize(width: number, height: number): void
  destroy(): void
}

export function createOverlay2D(parent: HTMLElement, maxDpr = 2): Overlay2D {
  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none'
  parent.appendChild(canvas)
  const ctx = canvas.getContext('2d')!
  let dpr = 1
  const overlay: Overlay2D = {
    canvas,
    ctx,
    width: 1,
    height: 1,
    begin() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, overlay.width, overlay.height)
    },
    resize(w, h) {
      dpr = pickDpr(window.devicePixelRatio, maxDpr, w, h)
      overlay.width = w
      overlay.height = h
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
    },
    destroy: () => canvas.remove(),
  }
  return overlay
}
