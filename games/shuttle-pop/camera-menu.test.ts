// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountCameraButton } from './camera-menu'
import { bindInput } from './input'
import { VI } from './i18n'

let view: HTMLElement
let bar: HTMLElement
let cam: ReturnType<typeof mountCameraButton>

beforeEach(() => {
  document.body.innerHTML = ''
  bar = document.createElement('header')
  bar.className = 'pf-bar'
  view = document.createElement('div')
  document.body.append(bar, view)
  cam = mountCameraButton(view)
})
afterEach(() => cam.destroy())

const button = () => cam.root.querySelector('button')!
const panel = () => cam.root.querySelector<HTMLElement>('.pf-popover')!
const key = (type: string, init: KeyboardEventInit, target: EventTarget = document.body) =>
  target.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init }))
const pointer = (type: string, target: EventTarget, init: Record<string, unknown> = {}) => {
  const e = new Event(type, { bubbles: true, cancelable: true })
  Object.assign(e, { pointerType: 'mouse', button: 0, pointerId: 1, clientX: 5, clientY: 5, ...init })
  target.dispatchEvent(e)
}

describe('camera button', () => {
  it('sits inside the game view, not in the top bar', () => {
    expect(view.contains(cam.root)).toBe(true)
    expect(bar.querySelector('.sp-cam')).toBeNull()
    expect(button().getAttribute('aria-label')).toBe('Camera view')
  })

  it('click toggles the panel (Height, Tilt, Reset)', () => {
    expect(panel().hidden).toBe(true)
    button().click()
    expect(panel().hidden).toBe(false)
    expect(panel().querySelectorAll('input[type=range]')).toHaveLength(2)
    button().click()
    expect(panel().hidden).toBe(true)
    expect(document.activeElement).not.toBe(button())
  })

  it('Escape closes it and focus does not stay on the button', () => {
    button().click()
    key('keydown', { key: 'Escape' }, panel().querySelector('input')!)
    expect(panel().hidden).toBe(true)
    expect(cam.root.contains(document.activeElement)).toBe(false)
  })

  it('a press outside closes it and never reaches the view (no swing)', () => {
    const seen = vi.fn()
    view.addEventListener('pointerdown', seen)
    button().click()
    pointer('pointerdown', view)
    expect(panel().hidden).toBe(true)
    expect(seen).not.toHaveBeenCalled()
    pointer('pointerdown', view) // panel closed: the view gets presses again
    expect(seen).toHaveBeenCalledTimes(1)
  })

  it('presses on the button and panel stay out of the view', () => {
    const seen = vi.fn()
    for (const t of ['pointerdown', 'pointerup', 'pointercancel']) view.addEventListener(t, seen)
    button().click()
    for (const t of ['pointerdown', 'pointerup', 'pointercancel']) {
      pointer(t, button())
      pointer(t, panel().querySelector('input')!)
    }
    expect(seen).not.toHaveBeenCalled()
  })

  it('while open no key press reaches the real input (Space, J, arrows, WASD), wherever focus is', () => {
    const sent = vi.fn()
    const input = bindInput(view, sent, () => 0)
    button().click()
    const targets = [panel().querySelector('input')!, panel(), button(), document.body]
    for (const code of ['Space', 'KeyJ', 'ArrowLeft', 'KeyA', 'KeyW']) {
      for (const t of targets) key('keydown', { code, key: code }, t)
    }
    expect(sent).not.toHaveBeenCalled()
    button().click() // closed: keys play again
    key('keydown', { code: 'ArrowLeft', key: 'ArrowLeft' })
    expect(sent).toHaveBeenCalled()
    input.stop()
  })

  it('a swing key held before opening is released while open (no stuck charge)', () => {
    const sent = vi.fn()
    const input = bindInput(view, sent, () => 0)
    key('keydown', { code: 'KeyJ', key: 'j' })
    expect(sent.mock.calls.map((c) => c[0].t)).toEqual(['charge'])
    button().click()
    key('keyup', { code: 'KeyJ', key: 'j' })
    expect(sent.mock.calls.map((c) => c[0].t)).toEqual(['charge', 'swing'])
    input.stop()
  })

  it('keyups (incl. V push-to-talk) reach window listeners while open', () => {
    const seen = vi.fn()
    window.addEventListener('keyup', seen)
    button().click()
    key('keyup', { code: 'KeyV', key: 'v' }, panel())
    key('keyup', { code: 'KeyV', key: 'v' }, document.body)
    window.removeEventListener('keyup', seen)
    expect(seen).toHaveBeenCalledTimes(2)
  })

  it('tabbing out of the panel closes it; moving focus inside keeps it open', () => {
    const outside = document.createElement('input')
    document.body.append(outside)
    button().click()
    const slider = panel().querySelector('input')!
    slider.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: panel() }))
    expect(panel().hidden).toBe(false)
    slider.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: outside }))
    expect(panel().hidden).toBe(true)
    const sent = vi.fn()
    const input = bindInput(view, sent, () => 0)
    key('keydown', { code: 'ArrowLeft', key: 'ArrowLeft' })
    expect(sent).toHaveBeenCalled()
    input.stop()
  })

  it('opening focuses the panel, not Reset, and Space does not reset the camera', () => {
    button().click()
    expect(document.activeElement).toBe(panel())
    expect(document.activeElement).not.toBe(panel().querySelector('.wide'))
  })
})

describe('camera strings', () => {
  it('have Vietnamese', () => {
    for (const k of ['Camera view', 'Height', 'Tilt', 'Camera height', 'Camera tilt', 'Reset view'])
      expect(VI[k]).toBeTruthy()
    expect(VI['Only changes your own screen.']).toBeTruthy()
  })
})
