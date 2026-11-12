// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { TouchPad, touchFirst } from './hud'

describe('TouchPad.setAbility (every frame)', () => {
  it('dims by the cooldown, ready at 0, and only touches the DOM when the shown step changes', () => {
    const pad = new TouchPad()
    pad.setAbility(0.5)
    expect(pad.actEl.style.getPropertyValue('--sp-cd')).toBe('0.50')
    expect(pad.actEl.classList.contains('cooling')).toBe(true)
    // One shared cooldown: the Dive button dims the same.
    expect(pad.diveEl.style.getPropertyValue('--sp-cd')).toBe('0.50')
    expect(pad.diveEl.classList.contains('cooling')).toBe(true)
    let writes = 0
    const set = pad.actEl.style.setProperty.bind(pad.actEl.style)
    pad.actEl.style.setProperty = (...a: Parameters<typeof set>) => {
      writes++
      set(...a)
    }
    pad.setAbility(0.501)
    expect(writes).toBe(0)
    pad.setAbility(0.2)
    expect(writes).toBe(1)
    pad.setAbility(0)
    expect(pad.actEl.style.getPropertyValue('--sp-cd')).toBe('0.00')
    expect(pad.actEl.classList.contains('cooling')).toBe(false)
    pad.setAbility(Number.NaN)
    expect(pad.actEl.classList.contains('cooling')).toBe(false)
  })
})

describe('touchFirst (touch pad vs key chips)', () => {
  const media = (on: string[]) => (q: string) => on.includes(q)
  it('phones: a coarse primary pointer', () => {
    expect(touchFirst(media(['(pointer: coarse)']), 5)).toBe(true)
  })
  it('touch screens reporting a fine primary pointer but nothing that hovers', () => {
    expect(touchFirst(media([]), 5)).toBe(true)
    expect(touchFirst(media(['(any-pointer: coarse)']), 0)).toBe(true)
  })
  it('desktops and touch laptops (a mouse / trackpad hovers) keep the key chips', () => {
    expect(touchFirst(media(['(any-hover: hover)']), 0)).toBe(false)
    expect(touchFirst(media(['(any-hover: hover)', '(any-pointer: coarse)']), 10)).toBe(false)
    expect(touchFirst(media([]), 0)).toBe(false)
  })
  it('the pad starts shown on a touch-first device, hidden otherwise (first touch enables it)', () => {
    expect(new TouchPad(true).root.hidden).toBe(false)
    const pad = new TouchPad(false)
    expect(pad.root.hidden).toBe(true)
    pad.enable()
    expect(pad.root.hidden).toBe(false)
  })
})
