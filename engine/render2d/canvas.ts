export interface Canvas2D {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  /** Logical (game-space) size. Draw in these units; HiDPI scaling is handled. */
  width: number
  height: number
  /** Changes the logical size and refits (`smooth`: mid-animation, may keep the pixel buffer). */
  setSize(width: number, height: number, smooth?: boolean): void
  destroy(): void
}

/**
 * Creates a canvas that letterboxes a fixed logical resolution into `parent`,
 * rendering crisply on HiDPI screens.
 */
export interface Canvas2DOptions {
  /** Cap on the pixel density drawn at (e.g. 2): phones at 3× fill 2.25× the pixels for little visible gain. */
  maxDpr?: number
}

export function createCanvas2D(
  parent: HTMLElement,
  width: number,
  height: number,
  options: Canvas2DOptions = {},
): Canvas2D {
  const canvas = document.createElement('canvas')
  canvas.style.display = 'block'
  canvas.style.margin = 'auto'
  parent.appendChild(canvas)
  const ctx = canvas.getContext('2d')!

  const view: Canvas2D = {
    canvas,
    ctx,
    width,
    height,
    setSize(w, h, smooth = false) {
      view.width = w
      view.height = h
      fit(smooth)
    },
    destroy() {
      observer.disconnect()
      canvas.remove()
    },
  }

  /**
   * `smooth`: the size is animating; keep the pixel buffer unless it is more
   * than 15% off (reallocating it every frame is the costly part), and stretch it.
   */
  function fit(smooth = false) {
    // Fit inside the parent's content box (clientWidth includes padding).
    const cs = getComputedStyle(parent)
    const availW = parent.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
    const availH = parent.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
    const scale = Math.max(0, Math.min(availW / view.width, availH / view.height)) || 1
    const cssW = Math.floor(view.width * scale)
    const cssH = Math.floor(view.height * scale)
    const dpr = Math.min(options.maxDpr ?? Infinity, window.devicePixelRatio || 1)
    canvas.style.width = `${cssW}px`
    canvas.style.height = `${cssH}px`
    const bw = Math.round(cssW * dpr)
    const bh = Math.round(cssH * dpr)
    const near = (a: number, b: number) => Math.abs(a - b) <= b * 0.15
    if (!smooth || !near(canvas.width, bw) || !near(canvas.height, bh)) {
      canvas.width = bw
      canvas.height = bh
    }
    ctx.setTransform(canvas.width / view.width, 0, 0, canvas.height / view.height, 0, 0)
  }

  const observer = new ResizeObserver(() => fit())
  observer.observe(parent)
  fit()
  return view
}
