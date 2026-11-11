// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { OptionDef } from '../net/session'
import { optionPickers } from './options'

const mode: OptionDef = {
  id: 'mode',
  label: 'Match',
  default: 'a',
  choices: [
    { value: 'a', label: 'One' },
    { value: 'b', label: 'Two' },
  ],
}

const segments = (el: HTMLElement) => [...el.querySelectorAll<HTMLButtonElement>('.pf-segment')]

describe('optionPickers', () => {
  it('a blocked choice is disabled with its reason as a title and a hint under the row', () => {
    const picked: string[] = []
    const el = optionPickers(
      [mode],
      { mode: 'b' },
      (_, v) => picked.push(v),
      (id, value, label) => (id === 'mode' && value === 'a' ? `${label}: too many players` : null),
    )!
    const [one, two] = segments(el)
    expect(one.disabled).toBe(true)
    expect(one.title).toBe('One: too many players')
    expect(two.disabled).toBe(false)
    expect(el.querySelector('.pf-option-hint')?.textContent).toBe('One: too many players')
    one.click()
    two.click()
    expect(picked).toEqual(['b'])
  })

  it('no blocker: every choice enabled, no hint; read-only pickers stay disabled', () => {
    const el = optionPickers([mode], { mode: 'a' }, () => {})!
    expect(segments(el).every((b) => !b.disabled)).toBe(true)
    expect(el.querySelector('.pf-option-hint')).toBe(null)
    expect(segments(optionPickers([mode], { mode: 'a' }, null)!).every((b) => b.disabled)).toBe(true)
  })
})
