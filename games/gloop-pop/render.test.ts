import { describe, expect, it, vi } from 'vitest'
import type { InputEvent, PlayerInfo } from '@forge/net/session'
import { choosePlan } from './ai'
import { layout } from './look'
import { GloopRenderer } from './render'
import { boardOf, createState, step, type GloopInput, type GloopState } from './sim'

// Confetti needs a DOM; the jar clear still runs every other effect.
vi.mock('@forge/fx/confetti', () => ({ celebrate: () => {} }))

/** A view whose context accepts every call, and throws on a negative corner radius like a real canvas. */
function fakeView() {
  const gradient = { addColorStop: () => {} }
  const bad: unknown[] = []
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (target, key) =>
      key in target
        ? target[key as string]
        : key === 'roundRect'
          ? (...a: unknown[]) => {
              const r = a[4]
              const radii = Array.isArray(r) ? r : [r ?? 0]
              if (radii.some((v) => typeof v !== 'number' || v < 0 || !Number.isFinite(v))) bad.push(a)
            }
          : key === 'measureText'
            ? () => ({ width: 10 })
            : () => gradient,
    set: (target, key, v) => ((target[key as string] = v), true),
  })
  const view = {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    canvas: {} as HTMLCanvasElement,
    width: 520,
    height: 620,
    setSize(w: number, h: number) {
      view.width = w
      view.height = h
    },
    destroy() {},
  }
  return { view, bad }
}

const player = (id: string, slot = 0) => ({ id, name: id, slot, ready: true, connected: true }) as PlayerInfo

/** Plays `id` with the computer's brain, one button a tick. */
const bot = (s: GloopState, id: string): InputEvent<GloopInput>[] => {
  const b = boardOf(s, id)!
  if (b.phase !== 'fall' || !b.piece) return []
  const plan = choosePlan(b.cells, b.piece, 'hard', { seed: 1 })
  const p = b.piece
  if (!plan) return [{ player: id, input: { t: 'drop' } }]
  const input: GloopInput =
    p.r !== plan.r
      ? { t: 'rot', dir: 1 }
      : p.x !== plan.x
        ? { t: 'move', dx: plan.x > p.x ? 1 : -1 }
        : { t: 'drop' }
  return [{ player: id, input }]
}

describe('GloopRenderer', () => {
  it('sizes the canvas to the layout', () => {
    const { view } = fakeView()
    new GloopRenderer(view, 'me', () => 0)
    expect([view.width, view.height]).toEqual([layout().width, layout().height])
  })

  it.each([
    ['solo', () => createState([player('me')], 3, {})],
    ['vs computer', () => createState([player('me')], 3, { rival: 'hard' })],
    [
      '4-player race',
      () => createState([player('me'), player('b', 1), player('c', 2), player('d', 3)], 3, {}),
    ],
  ])('draws a whole %s match without a bad call', (_name, make) => {
    const { view, bad } = fakeView()
    const r = new GloopRenderer(view, 'me', () => 1234)
    const s = make()
    for (let i = 0; i < 3000 && !s.over; i++) {
      step(s, bot(s, 'me'))
      r.onState(s)
      if (i % 3 === 0) r.frame(1 / 20)
    }
    for (let i = 0; i < 60; i++) {
      step(s, [])
      r.onState(s)
      r.frame(1 / 20)
    }
    expect(bad).toEqual([])
  })
})
