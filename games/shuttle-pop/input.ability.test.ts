// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { bindInput, ABILITY_KEYS, DIVE_KEYS, JUMP_KEYS, type TouchView } from './input'
import type { SpInput } from './sim'

function setup(withPad = false) {
  const target = document.createElement('div')
  document.body.append(target)
  const got: SpInput[] = []
  const actEl = document.createElement('div')
  const diveEl = document.createElement('div')
  const swingEl = document.createElement('div')
  target.append(actEl, diveEl, swingEl)
  const pad: TouchView = {
    actEl,
    diveEl,
    swingEl,
    enable() {},
    showStick() {},
    moveKnob() {},
    hideStick() {},
    setPressed() {},
    setAct() {},
    setDive() {},
  }
  const b = bindInput(
    target,
    (i) => got.push(i),
    () => 5,
    withPad ? pad : undefined,
  )
  const kinds = () => got.filter((i) => i.t !== 'move').map((i) => i.t)
  /** The forced move of each ability press ('-' = none: the sim picks). */
  const moves = () => got.flatMap((i) => (i.t === 'ability' ? [i.k ?? '-'] : []))
  return { target, got, kinds, moves, actEl, diveEl, swingEl, b }
}

const key = (code: string, extra: KeyboardEventInit = {}) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, ...extra }))

function pointer(
  el: Element,
  type: string,
  init: { pointerId?: number; button?: number; buttons?: number; pointerType?: string },
) {
  const e = new Event(type, { bubbles: true, cancelable: true }) as Event & Record<string, unknown>
  e.pointerId = init.pointerId ?? 1
  e.button = init.button ?? 0
  e.buttons = init.buttons ?? 0
  e.pointerType = init.pointerType ?? 'mouse'
  e.clientX = 0
  e.clientY = 0
  el.dispatchEvent(e)
  return e
}

let cleanup: (() => void) | null = null
afterEach(() => {
  cleanup?.()
  document.body.replaceChildren()
})

describe('ability bindings', () => {
  it('Space jumps, both Shifts dive; repeats do not; J / K / P / arrows do nothing', () => {
    expect([...JUMP_KEYS].sort()).toEqual(['Space'])
    expect([...DIVE_KEYS].sort()).toEqual(['ShiftLeft', 'ShiftRight'])
    expect([...ABILITY_KEYS].sort()).toEqual(['ShiftLeft', 'ShiftRight', 'Space'])
    const s = setup()
    cleanup = s.b.stop
    expect(key('Space')).toBe(false) // default prevented: no page scroll
    key('ShiftLeft')
    key('ShiftRight')
    key('Space', { repeat: true })
    for (const code of ['KeyJ', 'KeyK', 'KeyP', 'ArrowUp']) key(code)
    expect(s.kinds()).toEqual(['ability', 'ability', 'ability'])
    expect(s.moves()).toEqual(['jump', 'lunge', 'lunge'])
  })

  it('a dive carries the held direction (the way the player is moving)', () => {
    const s = setup()
    cleanup = s.b.stop
    key('KeyD')
    key('ShiftLeft')
    expect(s.got.find((i) => i.t === 'ability')).toMatchObject({
      t: 'ability',
      k: 'lunge',
      x: 1,
      z: 0,
      tick: 5,
    })
  })

  it('ignores keys typed in a field', () => {
    const s = setup()
    cleanup = s.b.stop
    const input = document.createElement('input')
    document.body.append(input)
    input.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyK', bubbles: true }))
    expect(s.kinds()).toEqual([])
  })

  it('a right click on the court presses it, with no menu and no swing', () => {
    const s = setup()
    cleanup = s.b.stop
    const down = pointer(s.target, 'pointerdown', { button: 2 })
    expect(down.defaultPrevented).toBe(true)
    pointer(s.target, 'pointerup', { button: 2 })
    expect(s.kinds()).toEqual(['ability'])
    expect(s.moves()).toEqual(['lunge'])
  })

  it('a right-button release never lets go of a held left-button charge', () => {
    const s = setup()
    cleanup = s.b.stop
    pointer(s.target, 'pointerdown', { button: 0 })
    pointer(s.target, 'pointerdown', { button: 2, buttons: 3 })
    pointer(s.target, 'pointerup', { button: 2, buttons: 1 })
    expect(s.kinds()).toEqual(['charge', 'ability'])
    pointer(s.target, 'pointerup', { button: 0 })
    expect(s.kinds()).toEqual(['charge', 'ability', 'swing'])
  })

  it('hold left, press right, release left (a pointermove in browsers) still swings', () => {
    const s = setup()
    cleanup = s.b.stop
    pointer(s.target, 'pointerdown', { button: 0, buttons: 1 })
    pointer(s.target, 'pointerdown', { button: 2, buttons: 3 })
    pointer(s.target, 'pointermove', { button: -1, buttons: 2 })
    expect(s.kinds()).toEqual(['charge', 'ability', 'swing'])
    pointer(s.target, 'pointerup', { button: 2, buttons: 0 })
    expect(s.kinds()).toEqual(['charge', 'ability', 'swing'])
  })

  it('plain mouse moves with the left held do not swing', () => {
    const s = setup()
    cleanup = s.b.stop
    pointer(s.target, 'pointerdown', { button: 0, buttons: 1 })
    pointer(s.target, 'pointermove', { button: -1, buttons: 1 })
    expect(s.kinds()).toEqual(['charge'])
  })

  it('the context menu is suppressed on the court even without a pad', () => {
    const s = setup(false)
    cleanup = s.b.stop
    const e = new Event('contextmenu', { bubbles: true, cancelable: true })
    s.target.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(true)
  })

  it('the phone button presses it once, never starting a swing; a second finger does not repeat', () => {
    const s = setup(true)
    cleanup = s.b.stop
    pointer(s.actEl, 'pointerdown', { pointerId: 3, pointerType: 'touch' })
    pointer(s.actEl, 'pointerdown', { pointerId: 4, pointerType: 'touch' })
    expect(s.kinds()).toEqual(['ability'])
    pointer(s.actEl, 'pointerup', { pointerId: 3, pointerType: 'touch' })
    pointer(s.actEl, 'pointerdown', { pointerId: 6, pointerType: 'touch' })
    expect(s.kinds()).toEqual(['ability', 'ability'])
    expect(s.moves()).toEqual(['jump', 'jump'])
  })

  it('the phone dive button dives once per finger, never swinging', () => {
    const s = setup(true)
    cleanup = s.b.stop
    pointer(s.diveEl, 'pointerdown', { pointerId: 3, pointerType: 'touch' })
    pointer(s.diveEl, 'pointerdown', { pointerId: 4, pointerType: 'touch' })
    expect(s.moves()).toEqual(['lunge'])
    pointer(s.diveEl, 'pointerup', { pointerId: 3, pointerType: 'touch' })
    pointer(s.diveEl, 'pointerdown', { pointerId: 6, pointerType: 'touch' })
    expect(s.moves()).toEqual(['lunge', 'lunge'])
    expect(s.kinds()).not.toContain('charge')
  })
})
