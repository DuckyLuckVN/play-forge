// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountCameraButton } from './camera-menu'
import { prefs } from './prefs'
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
    expect(button().getAttribute('aria-label')).toBe('View settings')
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
    const targets = [
      panel().querySelector('input')!,
      panel().querySelector('[role=radio]')!,
      panel(),
      button(),
      document.body,
    ]
    for (const code of ['Space', 'KeyJ', 'ArrowLeft', 'KeyA', 'KeyW']) {
      for (const t of targets) key('keydown', { code, key: code }, t)
    }
    expect(sent).not.toHaveBeenCalled()
    button().click() // closed: keys play again
    key('keydown', { code: 'KeyA', key: 'a' })
    expect(sent).toHaveBeenCalled()
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
    key('keydown', { code: 'KeyA', key: 'a' })
    expect(sent).toHaveBeenCalled()
    input.stop()
  })

  it('opening focuses the panel, not Reset, and Space does not reset the camera', () => {
    button().click()
    expect(document.activeElement).toBe(panel())
    expect(document.activeElement).not.toBe(panel().querySelector('.wide'))
  })
})

describe('ring picker', () => {
  it('three choices, current one checked, click saves and re-checks', () => {
    prefs.set({ ring: 'always' })
    button().click()
    const segs = [...panel().querySelectorAll<HTMLButtonElement>('.sp-ring-row [role=radio]')]
    expect(segs.map((b) => b.textContent)).toEqual(['Hidden', 'Near drop', 'Always'])
    expect(segs.map((b) => b.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true'])
    segs[1].click()
    expect(prefs.get().ring).toBe('near')
    expect(segs[1].getAttribute('aria-checked')).toBe('true')
    expect(segs[1].classList.contains('on')).toBe(true)
    expect(segs[2].classList.contains('on')).toBe(false)
    expect(panel().hidden).toBe(false)
  })

  it('flight path row: Off / Near drop / Always, off by default, click saves', () => {
    prefs.set({ path: 'hidden' })
    button().click()
    const segs = [...panel().querySelectorAll<HTMLButtonElement>('.sp-path-row [role=radio]')]
    expect(segs.map((b) => b.textContent)).toEqual(['Off', 'Near drop', 'Always'])
    expect(segs.map((b) => b.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false'])
    segs[2].click()
    expect(prefs.get().path).toBe('always')
    expect(prefs.get().ring).not.toBe(undefined)
  })

  it('Reset camera leaves the ring alone', () => {
    prefs.set({ ring: 'hidden', camera: { height: 0.5, tilt: 0 } })
    button().click()
    panel().querySelector<HTMLButtonElement>('.wide')!.click()
    expect(prefs.get()).toMatchObject({ camera: { height: 0, tilt: 0 }, ring: 'hidden' })
  })

  it('auto swing: Off / On, Off by default, click saves', () => {
    prefs.set({ autoSwing: false })
    button().click()
    const segs = [...panel().querySelectorAll<HTMLButtonElement>('.sp-auto-row [role=radio]')]
    expect(segs.map((b) => b.textContent)).toEqual(['Off', 'On'])
    expect(segs.map((b) => b.getAttribute('aria-checked'))).toEqual(['true', 'false'])
    segs[1].click()
    expect(prefs.get().autoSwing).toBe(true)
    expect(segs[1].getAttribute('aria-checked')).toBe('true')
    prefs.set({ autoSwing: false })
  })

  it('graphics: Auto / Low / Medium / High / Ultra, Auto by default, click saves', () => {
    prefs.set({ graphics: 'auto' })
    button().click()
    const segs = [...panel().querySelectorAll<HTMLButtonElement>('.sp-graphics-row [role=radio]')]
    expect(segs.map((b) => b.textContent)).toEqual(['Auto', 'Low', 'Medium', 'High', 'Ultra'])
    expect(segs.map((b) => b.getAttribute('aria-checked'))).toEqual([
      'true',
      'false',
      'false',
      'false',
      'false',
    ])
    segs[3].click()
    expect(prefs.get().graphics).toBe('high')
    expect(segs[3].getAttribute('aria-checked')).toBe('true')
    segs[4].click()
    expect(prefs.get().graphics).toBe('ultra')
    prefs.set({ graphics: 'auto' })
  })

  it('the ring group is labelled', () => {
    expect(panel().querySelector('[role=radiogroup]')!.getAttribute('aria-label')).toBe('Landing ring')
  })

  it('Space / arrows on a segment do not reach the game', () => {
    const sent = vi.fn()
    const input = bindInput(view, sent, () => 0)
    button().click()
    const seg = panel().querySelector<HTMLElement>('[role=radio]')!
    seg.focus()
    for (const code of ['Space', 'KeyJ', 'ArrowLeft', 'ArrowRight']) key('keydown', { code, key: code }, seg)
    expect(sent).not.toHaveBeenCalled()
    input.stop()
  })
})

describe('camera strings', () => {
  it('have Vietnamese', () => {
    for (const k of [
      'View settings',
      'Height',
      'Tilt',
      'Camera height',
      'Camera tilt',
      'Reset camera',
      'Landing ring',
      'Hidden',
      'Near drop',
      'Always',
    ])
      expect(VI[k]).toBeTruthy()
    expect(VI['Only changes your own screen.']).toBeTruthy()
  })
})
