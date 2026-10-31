export interface Canvas2D {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  /** Logical (game-space) size. Draw in these units; HiDPI scaling is handled. */
  width: number
  height: number
  /** Changes the logical size and refits. */
  setSize(width: number, height: number): void
  destroy(): void
}

/**
 * Creates a canvas that letterboxes a fixed logical resolution into `parent`,
 * rendering crisply on HiDPI screens.
 */
export function createCanvas2D(parent: HTMLElement, width: number, height: number): Canvas2D {
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
    setSize(w, h) {
      view.width = w
      view.height = h
      fit()
    },
    destroy() {
      observer.disconnect()
      canvas.remove()
    },
  }

  function fit() {
    const scale = Math.min(parent.clientWidth / view.width, parent.clientHeight / view.height) || 1
    const cssW = Math.floor(view.width * scale)
    const cssH = Math.floor(view.height * scale)
    const dpr = window.devicePixelRatio || 1
    canvas.style.width = `${cssW}px`
    canvas.style.height = `${cssH}px`
    canvas.width = Math.round(cssW * dpr)
    canvas.height = Math.round(cssH * dpr)
    ctx.setTransform(canvas.width / view.width, 0, 0, canvas.height / view.height, 0, 0)
  }

  const observer = new ResizeObserver(fit)
  observer.observe(parent)
  fit()
  return view
}
