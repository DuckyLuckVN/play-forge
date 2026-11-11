// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { TouchPad } from './hud'

describe('TouchPad.setAbility (every frame)', () => {
  it('dims by the cooldown, ready at 0, and only touches the DOM when the shown step changes', () => {
    const pad = new TouchPad()
    pad.setAbility(0.5)
    expect(pad.actEl.style.getPropertyValue('--sp-cd')).toBe('0.50')
    expect(pad.actEl.classList.contains('cooling')).toBe(true)
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
