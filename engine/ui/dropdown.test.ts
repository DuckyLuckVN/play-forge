// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { dropdown } from './dropdown'
import { guardGameKeys } from './key-guard'

const CHOICES = [
  { value: 'auto', text: 'Auto' },
  { value: 'low', text: 'Low' },
  { value: 'high', text: 'High' },
] as const

function make(value = 'auto') {
  const picked: string[] = []
  const d = dropdown({ label: 'Graphics', choices: CHOICES, value, onChange: (v) => picked.push(v) })
  document.body.append(d.root)
  return { d, picked, button: d.root.querySelector('button')!, list: d.root.querySelector('[role=listbox]')! }
}
const key = (code: string, target: EventTarget = window) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: code, code, bubbles: true, cancelable: true }))
const options = (list: Element) => [...list.querySelectorAll('[role=option]')]

afterEach(() => document.body.replaceChildren())

describe('dropdown (custom listbox)', () => {
  it('shows the current choice, closed; ARIA wires the button to the listbox', () => {
    const { button, list } = make('low')
    expect(button.textContent).toContain('Low')
    expect(button.getAttribute('aria-haspopup')).toBe('listbox')
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect((list as HTMLElement).hidden).toBe(true)
    expect(list.getAttribute('aria-label')).toBe('Graphics')
    expect(options(list).map((o) => o.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false'])
  })

  it('click opens; clicking an option picks it, closes and returns focus to the button', () => {
    const { button, list, picked } = make()
    button.click()
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect((list as HTMLElement).hidden).toBe(false)
    ;(options(list)[2] as HTMLElement).click()
    expect(picked).toEqual(['high'])
    expect((list as HTMLElement).hidden).toBe(true)
    expect(button.textContent).toContain('High')
    expect(document.activeElement).toBe(button)
  })

  it('keyboard: arrows move the active option (wrapping off), Enter picks; Home / End', () => {
    const { button, list, picked } = make('auto')
    button.focus()
    button.click()
    const active = () => list.getAttribute('aria-activedescendant')
    const idOf = (i: number) => options(list)[i].id
    expect(active()).toBe(idOf(0))
    key('ArrowDown')
    key('ArrowDown')
    key('ArrowDown') // stays on the last
    expect(active()).toBe(idOf(2))
    key('Home')
    expect(active()).toBe(idOf(0))
    key('End')
    key('ArrowUp')
    expect(active()).toBe(idOf(1))
    key('Enter')
    expect(picked).toEqual(['low'])
    expect((list as HTMLElement).hidden).toBe(true)
  })

  it('Esc closes without picking and goes no further (an outer dialog / pause menu stays)', () => {
    const { button, list, picked } = make()
    let outer = 0
    window.addEventListener('keydown', () => outer++)
    button.click()
    key('Escape', button)
    expect((list as HTMLElement).hidden).toBe(true)
    expect(picked).toEqual([])
    expect(outer).toBe(0)
  })

  it('works inside an overlay that guards game keys (its own keys still arrive)', () => {
    const unguard = guardGameKeys()
    const { button, list, picked } = make()
    button.click()
    key('ArrowDown')
    key('Enter')
    expect(picked).toEqual(['low'])
    expect((list as HTMLElement).hidden).toBe(true)
    unguard()
  })

  it('a press outside closes it; set() updates the shown choice without firing onChange', () => {
    const { d, button, list, picked } = make()
    button.click()
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect((list as HTMLElement).hidden).toBe(true)
    d.set('high')
    expect(button.textContent).toContain('High')
    expect(picked).toEqual([])
    d.destroy()
  })
})
