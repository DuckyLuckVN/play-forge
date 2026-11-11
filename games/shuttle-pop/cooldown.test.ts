// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { cooldownTicksLeft, type Act } from './ability'
import { CooldownBadge, cooldownText } from './cooldown'
import { AbilityChips, TouchPad } from './hud'

describe('cooldownText', () => {
  it('blank when ready, rounded up: tenths under 10 s, whole seconds above', () => {
    expect(cooldownText(0)).toBe('')
    expect(cooldownText(-1)).toBe('')
    expect(cooldownText(Number.NaN)).toBe('')
    expect(cooldownText(1.23)).toBe('1.3')
    expect(cooldownText(0.04)).toBe('0.1')
    expect(cooldownText(12.2)).toBe('13')
  })
})

describe('cooldownTicksLeft', () => {
  it('counts down from the press to its cooldown', () => {
    const a: Act = { k: 'lunge', at: 10, dx: 0, dz: 1, free: true }
    expect(cooldownTicksLeft(a, 10)).toBe(90)
    expect(cooldownTicksLeft(a, 70)).toBe(30)
    expect(cooldownTicksLeft(a, 200)).toBe(0)
    expect(cooldownTicksLeft(null, 5)).toBe(0)
  })
})

describe('CooldownBadge', () => {
  it('sweep + seconds while cooling, a ready flash on the edge to ready', () => {
    const el = document.createElement('div')
    const b = new CooldownBadge(el)
    b.set(0.5, 1.15)
    expect(el.style.getPropertyValue('--sp-cd')).toBe('0.50')
    expect(el.classList.contains('cooling')).toBe(true)
    expect(el.querySelector('.sp-cd-num')!.textContent).toBe('1.2')
    expect(el.classList.contains('ready')).toBe(false)
    b.set(0, 0)
    expect(el.classList.contains('cooling')).toBe(false)
    expect(el.querySelector('.sp-cd-num')!.textContent).toBe('')
    expect(el.classList.contains('ready')).toBe(true)
  })

  it('no flash when it was never cooling', () => {
    const el = document.createElement('div')
    new CooldownBadge(el).set(0, 0)
    expect(el.classList.contains('ready')).toBe(false)
  })
})

describe('touch buttons and desktop chips show the seconds', () => {
  it('TouchPad: both buttons count down', () => {
    const pad = new TouchPad()
    pad.setAbility(0.5, 0.75)
    for (const el of [pad.actEl, pad.diveEl]) expect(el.querySelector('.sp-cd-num')!.textContent).toBe('0.8')
  })

  it('AbilityChips: Jump [Space] and Dive [Shift], counting down together', () => {
    const chips = new AbilityChips()
    const keys = [...chips.root.querySelectorAll('kbd')].map((k) => k.textContent)
    expect(keys).toEqual(['Space', 'Shift'])
    chips.set(0.3, 2)
    const nums = [...chips.root.querySelectorAll('.sp-cd-num')].map((n) => n.textContent)
    expect(nums).toEqual(['2.0', '2.0'])
  })
})
