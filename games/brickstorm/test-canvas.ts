/** Node-side canvas stand-ins for drawing tests (node has no canvas, no Path2D). */

export interface CallRecord {
  name: string
  args: unknown[]
}
export type FakeCanvas = CanvasRenderingContext2D & {
  /** Method names, in call order. */
  calls: string[]
  /** Method names with their arguments, in call order. */
  log: CallRecord[]
}

/** A canvas context that accepts every call and records it, so drawing can be tested without a browser. */
export function fakeCanvas(): FakeCanvas {
  const target: Record<string, unknown> = {}
  const calls: string[] = []
  const log: CallRecord[] = []
  const gradient = { addColorStop: () => undefined }
  target.calls = calls
  target.log = log
  return new Proxy(target, {
    get: (t, k) =>
      k in t
        ? t[k as string]
        : (...args: unknown[]) => {
            calls.push(String(k))
            log.push({ name: String(k), args })
            return gradient
          },
    set: (t, k, v) => {
      t[k as string] = v
      return true
    },
  }) as unknown as FakeCanvas
}

const PATH_METHODS = [
  'moveTo',
  'lineTo',
  'quadraticCurveTo',
  'bezierCurveTo',
  'arc',
  'ellipse',
  'rect',
  'roundRect',
  'closePath',
  'addPath',
] as const

/** Stubs a global `Path2D` that records its constructor string (`d`) and method calls (`ops`). No-op if one exists. */
export function installPath2D(): void {
  const g = globalThis as { Path2D?: unknown }
  if (g.Path2D) return
  class Path2DStub {
    ops: CallRecord[] = []
    constructor(public d = '') {}
  }
  for (const m of PATH_METHODS)
    (Path2DStub.prototype as unknown as Record<string, unknown>)[m] = function (
      this: Path2DStub,
      ...args: unknown[]
    ) {
      this.ops.push({ name: m, args })
    }
  g.Path2D = Path2DStub
}
