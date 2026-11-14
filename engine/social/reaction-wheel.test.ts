// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../audio/sound', () => ({ playSound: vi.fn() }))

import { WHEEL_REACTIONS } from './reactions'
import { reactionWheel, type ReactionWheel } from './reaction-wheel'

let host: HTMLElement
let w: ReactionWheel
let send: ReturnType<typeof vi.fn<(id: string) => boolean>>

const key = (type: string, code: string, target: EventTarget = window, init: KeyboardEventInit = {}) =>
  target.dispatchEvent(
    new KeyboardEvent(type, {
      code,
      key: code === 'Escape' ? 'Escape' : code,
      bubbles: true,
      cancelable: true,
      ...init,
    }),
  )
const q = (sel: string) => host.querySelector(sel) as HTMLElement
const overlay = () => q('.pf-rxw')
const move = (x: number, y: number) =>
  overlay().dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y, bubbles: true }))
const open = () => {
  w.setEnabled(true)
  key('keydown', 'KeyT')
}

beforeEach(() => {
  host = document.body.appendChild(document.createElement('div'))
  host.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 400 }) as DOMRect
  send = vi.fn<(id: string) => boolean>(() => true)
  w = reactionWheel({ host, send })
})
afterEach(() => {
  w.destroy()
  document.body.innerHTML = ''
})

describe('reactionWheel', () => {
  it('starts disabled: no button, T ignored', () => {
    key('keydown', 'KeyT')
    expect(w.isOpen).toBe(false)
    expect(w.button.hidden).toBe(true)
  })
  it('hold T, move up, release sends slot 0 (like)', () => {
    w.setEnabled(true)
    key('keydown', 'KeyT')
    expect(w.isOpen).toBe(true)
    move(400, 200 - 60)
    expect(q('[data-rx="like"]').classList.contains('on')).toBe(true)
    key('keyup', 'KeyT')
    expect(send).toHaveBeenCalledWith('like')
    expect(w.isOpen).toBe(false)
  })
  it('release in the dead zone cancels', () => {
    open()
    move(410, 205)
    key('keyup', 'KeyT')
    expect(send).not.toHaveBeenCalled()
    expect(w.isOpen).toBe(false)
  })
  it('T while typing in chat types', () => {
    w.setEnabled(true)
    const input = document.body.appendChild(document.createElement('input'))
    key('keydown', 'KeyT', input)
    expect(w.isOpen).toBe(false)
  })
  it('held T repeats do not reopen or send', () => {
    open()
    key('keydown', 'KeyT', window, { repeat: true })
    expect(send).not.toHaveBeenCalled()
    expect(w.isOpen).toBe(true)
  })
  it('while open: game presses blocked, V and releases pass', () => {
    const downs: string[] = []
    const ups: string[] = []
    window.addEventListener('keydown', (e) => downs.push(e.code))
    window.addEventListener('keyup', (e) => ups.push(e.code))
    open()
    downs.length = 0 // the opening T itself
    key('keydown', 'KeyW')
    key('keydown', 'KeyV')
    key('keyup', 'Space')
    expect(downs).toEqual(['KeyV'])
    expect(ups).toEqual(['Space'])
  })
  it('pointerdown is swallowed, pointerup / pointermove still bubble to the host', () => {
    const seen: string[] = []
    for (const type of ['pointerdown', 'pointerup', 'pointermove'])
      host.addEventListener(type, () => seen.push(type))
    open()
    overlay().dispatchEvent(new Event('pointerdown', { bubbles: true }))
    overlay().dispatchEvent(new Event('pointerup', { bubbles: true }))
    overlay().dispatchEvent(new Event('pointermove', { bubbles: true }))
    expect(seen).toEqual(['pointerup', 'pointermove'])
  })
  it('phone: tap button, tap an emoji', () => {
    w.setEnabled(true)
    w.button.click()
    q('[data-rx="heart"]').dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(send).toHaveBeenCalledWith('heart')
    expect(w.isOpen).toBe(false)
  })
  it('tap centre closes without sending', () => {
    w.setEnabled(true)
    w.button.click()
    q('.pf-rxw-center').dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(send).not.toHaveBeenCalled()
    expect(w.isOpen).toBe(false)
  })
  it('button toggles', () => {
    w.setEnabled(true)
    w.button.click()
    expect(w.isOpen).toBe(true)
    w.button.click()
    expect(w.isOpen).toBe(false)
  })
  it('rate-limited: closes and the button shakes', () => {
    send.mockReturnValue(false)
    open()
    move(400, 140)
    key('keyup', 'KeyT')
    expect(w.isOpen).toBe(false)
    expect(w.button.classList.contains('nope')).toBe(true)
  })
  it('Esc, blur and setEnabled(false) close without sending; guard removed', () => {
    open()
    key('keydown', 'Escape')
    expect(w.isOpen).toBe(false)
    open()
    key('keyup', 'KeyT')
    open()
    window.dispatchEvent(new Event('blur'))
    expect(w.isOpen).toBe(false)
    open()
    w.setEnabled(false)
    expect(w.isOpen).toBe(false)
    expect(w.button.hidden).toBe(true)
    const downs: string[] = []
    window.addEventListener('keydown', (e) => downs.push(e.code))
    key('keydown', 'KeyW')
    expect(downs).toEqual(['KeyW'])
    expect(send).not.toHaveBeenCalled()
  })
  it('T does not open over another open panel', () => {
    w.setEnabled(true)
    const pop = document.body.appendChild(document.createElement('div'))
    pop.className = 'pf-popover'
    key('keydown', 'KeyT')
    expect(w.isOpen).toBe(false)
    pop.hidden = true
    key('keydown', 'KeyT')
    expect(w.isOpen).toBe(true)
  })
  it('slots and centre are not tab stops', () => {
    for (const b of document.querySelectorAll<HTMLElement>('.pf-rxw-slot, .pf-rxw-center'))
      expect(b.tabIndex).toBe(-1)
  })
  it('Esc stops propagation only while open', () => {
    const seen: string[] = []
    const spy = (e: KeyboardEvent) => seen.push(e.key)
    document.addEventListener('keydown', spy)
    w.setEnabled(true)
    key('keydown', 'Escape', document.body)
    expect(seen).toEqual(['Escape'])
    key('keydown', 'KeyT')
    key('keydown', 'Escape', document.body)
    expect(w.isOpen).toBe(false)
    expect(seen).toEqual(['Escape'])
    document.removeEventListener('keydown', spy)
  })
  it('only wheel ids are rendered, with translated labels', () => {
    const slots = [...document.querySelectorAll('.pf-rxw-slot')] as HTMLElement[]
    expect(slots.map((b) => b.dataset.rx)).toEqual([...WHEEL_REACTIONS])
    expect(slots.every((b) => b.getAttribute('aria-label'))).toBe(true)
  })
  it('opens centred on the last pointer, clamped inside the host', () => {
    w.setEnabled(true)
    host.dispatchEvent(new MouseEvent('pointermove', { clientX: 5, clientY: 5 }))
    key('keydown', 'KeyT')
    const ring = q('.pf-rxw-ring')
    expect(parseFloat(ring.style.left)).toBeGreaterThan(5)
    expect(parseFloat(ring.style.top)).toBeGreaterThan(5)
  })
  it('destroy removes button, overlay and listeners', () => {
    w.setEnabled(true)
    w.destroy()
    key('keydown', 'KeyT')
    expect(host.querySelector('.pf-rxw, .pf-rxw-btn')).toBeNull()
  })
})
