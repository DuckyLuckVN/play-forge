import { describe, expect, it } from 'vitest'
import { roundRect } from './render'

/** Records roundRect radii and throws on a negative one, like a real canvas. */
function ctx() {
  const radii: number[] = []
  const c = {
    beginPath() {},
    roundRect(_x: number, _y: number, _w: number, _h: number, r: number) {
      if (r < 0) throw new RangeError('negative radius')
      radii.push(r)
    },
  }
  return { c: c as unknown as CanvasRenderingContext2D, radii }
}

describe('roundRect', () => {
  it('never passes a negative radius, even for tiny or inverted boxes (a tile popping in)', () => {
    const { c, radii } = ctx()
    expect(() => roundRect(c, 0, 0, 3, -1.2, 4)).not.toThrow()
    expect(() => roundRect(c, 0, 0, -2, 5, 4)).not.toThrow()
    roundRect(c, 0, 0, 40, 40, 6)
    expect(radii.at(-1)).toBe(6)
    expect(radii.every((r) => r >= 0)).toBe(true)
  })
})

describe('FuseRenderer', () => {
  /** A canvas context that accepts every call and records clearRect boxes. */
  function fakeView(width: number, height: number) {
    const clears: number[][] = []
    const gradient = { addColorStop: () => {} }
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (target, key) =>
        key in target
          ? target[key as string]
          : key === 'clearRect'
            ? (...a: number[]) => clears.push(a)
            : key === 'measureText'
              ? () => ({ width: 10 })
              : () => gradient,
      set: (target, key, v) => ((target[key as string] = v), true),
    })
    const view = {
      ctx: ctx as unknown as CanvasRenderingContext2D,
      canvas: {} as HTMLCanvasElement,
      width,
      height,
      setSize(w: number, h: number) {
        view.width = w
        view.height = h
      },
      destroy() {},
    }
    return { view, clears }
  }

  it('fits the canvas to the board and clears all of it, so falling sparks leave no trails', async () => {
    const { createState } = await import('./sim')
    const { FuseRenderer } = await import('./render')
    const { layoutFor } = await import('./look')
    // main.ts creates the canvas at a guessed size; a solo 5×5 board is shorter.
    const { view, clears } = fakeView(560, 668)
    const r = new FuseRenderer(view, 'p0')
    r.onState(createState([{ id: 'p0', name: 'P', slot: 0, ready: true, connected: true }], 1))
    expect(view.height).toBe(layoutFor(5, 0).height)
    r.frame(0.016, { armed: false, hover: -1, cursor: -1 })
    expect(clears.at(-1)).toEqual([0, 0, view.width, view.height])
  })
})
