// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { bindInput, ABILITY_KEYS, type TouchView } from './input'
import type { SpInput } from './sim'

function setup(withPad = false) {
  const target = document.createElement('div')
  document.body.append(target)
  const got: SpInput[] = []
  const actEl = document.createElement('div')
  const swingEl = document.createElement('div')
  target.append(actEl, swingEl)
  const pad: TouchView = {
    actEl,
    swingEl,
    enable() {},
    showStick() {},
    moveKnob() {},
    hideStick() {},
    setPressed() {},
    setAct() {},
  }
  const b = bindInput(
    target,
    (i) => got.push(i),
    () => 5,
    withPad ? pad : undefined,
  )
  const kinds = () => got.filter((i) => i.t !== 'move').map((i) => i.t)
  return { target, got, kinds, actEl, swingEl, b }
}

const key = (code: string, extra: KeyboardEventInit = {}) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, ...extra }))

function pointer(
  el: Element,
  type: string,
  init: { pointerId?: number; button?: number; pointerType?: string },
) {
  const e = new Event(type, { bubbles: true, cancelable: true }) as Event & Record<string, unknown>
  e.pointerId = init.pointerId ?? 1
  e.button = init.button ?? 0
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
  it('K and both Shifts press it; repeats do not', () => {
    expect([...ABILITY_KEYS].sort()).toEqual(['KeyK', 'ShiftLeft', 'ShiftRight'])
    const s = setup()
    cleanup = s.b.stop
    key('KeyK')
    key('ShiftLeft')
    key('ShiftRight')
    key('KeyK', { repeat: true })
    expect(s.kinds()).toEqual(['ability', 'ability', 'ability'])
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
  })

  it('a right-button release never lets go of a held left-button charge', () => {
    const s = setup()
    cleanup = s.b.stop
    pointer(s.target, 'pointerdown', { button: 0 })
    pointer(s.target, 'pointerup', { button: 2 })
    expect(s.kinds()).toEqual(['charge'])
    pointer(s.target, 'pointerup', { button: 0 })
    expect(s.kinds()).toEqual(['charge', 'swing'])
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
  })
})
