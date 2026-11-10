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

  it('Space / J typed in the open panel are not game input', () => {
    const sent = vi.fn()
    const stop = bindInput(view, sent, () => 0)
    button().click()
    const slider = panel().querySelector('input')!
    for (const code of ['Space', 'KeyJ', 'ArrowLeft']) {
      key('keydown', { code, key: code }, slider)
      key('keyup', { code, key: code }, slider)
    }
    key('keydown', { code: 'Space', key: ' ' }, button())
    expect(sent).not.toHaveBeenCalled()
    key('keydown', { code: 'ArrowLeft', key: 'ArrowLeft' })
    expect(sent).toHaveBeenCalled() // control: the same key on the page does move
    stop.stop()
  })
})

describe('camera strings', () => {
  it('have Vietnamese', () => {
    for (const k of ['Camera view', 'Height', 'Tilt', 'Camera height', 'Camera tilt', 'Reset view'])
      expect(VI[k]).toBeTruthy()
    expect(VI['Only changes your own screen.']).toBeTruthy()
  })
})
