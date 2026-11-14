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
  it.each([
    ['phones: a coarse primary pointer', ['(pointer: coarse)'], 5, true],
    ['a fine primary pointer, touch points, nothing that hovers', [], 5, true],
    ['a coarse extra pointer, nothing that hovers', ['(any-pointer: coarse)'], 0, true],
    ['desktop (a mouse hovers)', ['(any-hover: hover)'], 0, false],
    ['touch laptop (a trackpad hovers)', ['(any-hover: hover)', '(any-pointer: coarse)'], 10, false],
    ['no touch, no hover info', [], 0, false],
  ])('%s → %s', (_, on, touches, want) => {
    expect(touchFirst(media(on), touches)).toBe(want)
  })
  it('the pad starts shown on a touch-first device, hidden otherwise (first touch enables it)', () => {
    expect(new TouchPad(true).root.hidden).toBe(false)
    const pad = new TouchPad(false)
    expect(pad.root.hidden).toBe(true)
    pad.enable()
    expect(pad.root.hidden).toBe(false)
  })
})
