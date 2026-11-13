import { h, icon } from './dom'
import { icons } from './icons'

export interface DropdownChoice<V extends string> {
  value: V
  /** Shown text (already translated). */
  text: string
}

export interface DropdownOptions<V extends string> {
  /** Accessible name of the list (already translated). */
  label: string
  choices: readonly DropdownChoice<V>[]
  value: V
  onChange(value: V): void
}

export interface Dropdown<V extends string> {
  /** The button + its list; put this in the page. */
  root: HTMLElement
  /** Show `value` as chosen (e.g. it changed elsewhere); never calls onChange. */
  set(value: V): void
  /** Remove the document listeners (for dropdowns that live shorter than the page). */
  destroy(): void
}

let nextId = 0

/**
 * A game-styled dropdown for a setting with many choices (a few go in a segmented row instead): a button
 * showing the choice, a listbox under it. Keyboard: Enter / Space / arrows open it; arrows, Home and End
 * move; Enter / Space pick; Esc closes it (and only it: an outer dialog or pause menu stays); Tab closes.
 * Its keys are read on `window` in the capture phase while open, so an overlay's game-key guard
 * (key-guard.ts, registered earlier) never swallows them.
 */
export function dropdown<V extends string>(opts: DropdownOptions<V>): Dropdown<V> {
  const id = `pf-dd-${nextId++}`
  let value = opts.value
  let active = 0
  const text = h('span', { class: 'pf-dropdown-text' })
  const button = h('button', { type: 'button', class: 'pf-dropdown-btn' }, text, icon(icons.chevronDown))
  button.setAttribute('aria-haspopup', 'listbox')
  button.setAttribute('aria-expanded', 'false')
  button.setAttribute('aria-controls', `${id}-list`)
  const list = h('ul', { class: 'pf-dropdown-list', id: `${id}-list` })
  list.setAttribute('role', 'listbox')
  list.setAttribute('aria-label', opts.label)
  list.tabIndex = -1
  list.hidden = true
  const items = opts.choices.map((c, i) => {
    const li = h('li', { class: 'pf-dropdown-option', id: `${id}-${i}`, textContent: c.text })
    li.setAttribute('role', 'option')
    // Keep focus on the button (a pointerdown on the option would move it to the list).
    li.addEventListener('pointerdown', (e) => e.preventDefault())
    li.onclick = () => pick(i)
    li.onpointermove = () => setActive(i)
    list.append(li)
    return li
  })
  const root = h('div', { class: 'pf-dropdown' }, button, list)

  const indexOf = (v: V) =>
    Math.max(
      0,
      opts.choices.findIndex((c) => c.value === v),
    )
  const show = () => {
    const i = indexOf(value)
    text.textContent = opts.choices[i]?.text ?? ''
    items.forEach((li, j) => li.setAttribute('aria-selected', String(j === i)))
  }
  const setActive = (i: number) => {
    active = Math.min(items.length - 1, Math.max(0, i))
    items.forEach((li, j) => li.classList.toggle('active', j === active))
    list.setAttribute('aria-activedescendant', items[active].id)
    items[active].scrollIntoView?.({ block: 'nearest' })
  }
  /**
   * Room for the list under the button, inside the nearest scrolling box (else the screen)? Measured
   * after it shows (a hidden list has no height). No layout (tests): yes.
   */
  const roomBelow = () => {
    const need = list.getBoundingClientRect().height + 8
    if (need <= 8) return true
    let box: HTMLElement | null = root.parentElement
    while (box && !/(auto|scroll)/.test(getComputedStyle(box).overflowY)) box = box.parentElement
    const bottom = box ? box.getBoundingClientRect().bottom : window.innerHeight
    const top = box ? box.getBoundingClientRect().top : 0
    const r = button.getBoundingClientRect()
    return bottom - r.bottom >= need || r.top - top < need
  }
  const isOpen = () => !list.hidden
  const open = () => {
    if (isOpen()) return
    list.hidden = false
    button.setAttribute('aria-expanded', 'true')
    root.classList.add('open')
    root.classList.toggle('up', !roomBelow())
    setActive(indexOf(value))
    window.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onOutside, true)
  }
  const close = (refocus: boolean) => {
    if (!isOpen()) return
    list.hidden = true
    button.setAttribute('aria-expanded', 'false')
    root.classList.remove('open')
    window.removeEventListener('keydown', onKey, true)
    document.removeEventListener('pointerdown', onOutside, true)
    if (refocus) button.focus({ preventScroll: true })
  }
  function pick(i: number) {
    const v = opts.choices[i].value
    close(true)
    if (v === value) return
    value = v
    show()
    opts.onChange(v)
  }
  function onKey(e: KeyboardEvent) {
    const move: Record<string, number> = {
      ArrowDown: active + 1,
      ArrowUp: active - 1,
      Home: 0,
      End: items.length - 1,
    }
    if (e.key in move) setActive(move[e.key])
    else if (e.key === 'Enter' || e.key === ' ') pick(active)
    else if (e.key === 'Escape') close(true)
    else if (e.key === 'Tab') return close(false)
    else return
    e.preventDefault()
    e.stopPropagation()
  }
  function onOutside(e: PointerEvent) {
    if (!root.contains(e.target as Node)) close(false)
  }
  button.onclick = () => (isOpen() ? close(true) : open())
  // Closed: arrows open it too (Enter / Space already click the button).
  button.addEventListener('keydown', (e) => {
    if (!isOpen() && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      open()
    }
  })
  show()
  return {
    root,
    set(v) {
      value = v
      show()
    },
    destroy() {
      close(false)
      root.remove()
    },
  }
}
