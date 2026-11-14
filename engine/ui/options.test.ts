// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { OptionDef } from '../net/session'
import { optionPickers, optionsFold, optionSpecs } from './options'

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

const court: OptionDef = {
  id: 'court',
  label: 'Court',
  default: 's',
  choices: [
    { value: 's', label: 'Small' },
    { value: 'l', label: 'Large' },
  ],
}

/** [name, value, is-off] for each spec in a summary grid. */
const specsOf = (el: HTMLElement) =>
  [...el.querySelectorAll('.pf-spec')].map((sp) => [
    sp.querySelector('.pf-spec-k')!.textContent,
    sp.querySelector('.pf-spec-v')!.textContent,
    sp.querySelector('.pf-spec-v')!.classList.contains('off'),
  ])

describe('optionSpecs', () => {
  it('names every option with its current choice under it', () => {
    expect(specsOf(optionSpecs([mode, court], { mode: 'b', court: 's' }))).toEqual([
      ['Match', 'Two', false],
      ['Court', 'Small', false],
    ])
  })

  it('an "off" choice is shown faded, so what is on stands out', () => {
    const timer: OptionDef = {
      id: 'timer',
      label: 'Turn timer',
      default: 'off',
      choices: [
        { value: 'off', label: 'Off' },
        { value: 'on', label: 'On' },
      ],
    }
    expect(specsOf(optionSpecs([mode, timer], { mode: 'a', timer: 'off' }))).toEqual([
      ['Match', 'One', false],
      ['Turn timer', 'Off', true],
    ])
  })
})

describe('optionsFold', () => {
  const pickers = () => optionPickers([mode, court], { mode: 'a', court: 'l' }, () => {})!
  const fold = (editable: boolean, open: boolean, onToggle = (_: boolean) => {}) =>
    optionsFold({
      defs: [mode, court],
      values: { mode: 'a', court: 'l' },
      pickers: pickers(),
      editable,
      open,
      onToggle,
    })

  it('host, closed: a summary button; the pickers stay hidden until it is pressed', () => {
    const seen: boolean[] = []
    const el = fold(true, false, (o) => seen.push(o))
    const toggle = el.querySelector<HTMLButtonElement>('.pf-options-toggle')!
    expect(specsOf(toggle)).toEqual([
      ['Match', 'One', false],
      ['Court', 'Large', false],
    ])
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(el.querySelector<HTMLElement>('.pf-options')!.hidden).toBe(true)
    toggle.click()
    expect(seen).toEqual([true])
  })

  it('"Change" is a small corner chevron: no visible word, but named for the tooltip and screen readers', () => {
    const toggle = fold(true, false).querySelector<HTMLButtonElement>('.pf-options-toggle')!
    const edit = toggle.querySelector<HTMLElement>('.pf-options-edit')!
    expect(edit.querySelector('.pf-icon')).not.toBeNull()
    expect(edit.querySelector('.pf-sr')!.textContent).toBe('Change')
    expect(toggle.title).toBe('Change')
    expect(fold(true, true).querySelector<HTMLButtonElement>('.pf-options-toggle')!.title).toBe('Done')
  })

  it('host, open: pickers shown, pressing again closes', () => {
    const seen: boolean[] = []
    const el = fold(true, true, (o) => seen.push(o))
    expect(el.querySelector<HTMLElement>('.pf-options')!.hidden).toBe(false)
    el.querySelector<HTMLButtonElement>('.pf-options-toggle')!.click()
    expect(seen).toEqual([false])
  })

  it('guest: the summary only, nothing to press', () => {
    const el = fold(false, true)
    expect(el.querySelector('.pf-options-toggle')).toBeNull()
    expect(el.querySelector('.pf-options')).toBeNull()
    expect(specsOf(el)).toEqual([
      ['Match', 'One', false],
      ['Court', 'Large', false],
    ])
  })

  it('a single option is not folded', () => {
    const one = optionPickers([mode], { mode: 'a' }, () => {})!
    expect(
      optionsFold({
        defs: [mode],
        values: { mode: 'a' },
        pickers: one,
        editable: true,
        open: false,
        onToggle: () => {},
      }),
    ).toBe(one)
  })
})
