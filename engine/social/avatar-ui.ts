import './social.css'
import { h } from '../ui/dom'
import { AVATARS, avatarDef, avatarSvg } from './avatars'
import { t } from './i18n'

/** An avatar drawing. Purely visual: pair it with the player's name. */
export function avatarEl(id: string, cls = 'pf-avatar'): HTMLSpanElement {
  const el = h('span', { class: cls })
  el.innerHTML = avatarSvg(id) // trusted: built from our own constant parts
  el.dataset.avatar = avatarDef(id).id
  return el
}

/**
 * The start-screen avatar control: a big button showing your avatar that
 * opens a grid of all of them. Calls `onPick` with the new id.
 */
export function avatarPicker(
  current: string,
  onPick: (id: string) => void,
  opts: {
    /** Close the grid after a pick (rooms: an open grid hides the ready button on phones). */
    closeOnPick?: boolean
  } = {},
): HTMLElement {
  let selected = current
  const face = avatarEl(selected, 'pf-avatar')
  const toggle = h('button', { class: 'pf-avatar-btn', type: 'button' }, face)
  const grid = h('div', { class: 'pf-avatar-grid', hidden: true })
  grid.setAttribute('role', 'radiogroup')
  grid.setAttribute('aria-label', t('Choose your avatar'))

  const label = () => {
    const text = t('Change avatar ({name})', { name: t(avatarDef(selected).name) })
    toggle.title = text
    toggle.setAttribute('aria-label', text)
    toggle.setAttribute('aria-expanded', String(!grid.hidden))
  }

  const options = AVATARS.map((a) => {
    const b = h('button', { class: 'pf-avatar-opt', type: 'button', title: t(a.name) }, avatarEl(a.id))
    b.setAttribute('role', 'radio')
    b.setAttribute('aria-label', t(a.name))
    b.onclick = () => {
      selected = a.id
      face.innerHTML = avatarSvg(a.id)
      face.classList.remove('pop')
      void face.offsetWidth // restart the pop animation
      face.classList.add('pop')
      mark()
      // Start screen: stay open so players can browse and compare; the toggle or Esc closes it.
      if (opts.closeOnPick) grid.hidden = true
      label()
      ;(opts.closeOnPick ? toggle : b).focus()
      onPick(a.id)
    }
    return b
  })
  const mark = () =>
    options.forEach((b, i) => {
      const on = AVATARS[i].id === selected
      b.classList.toggle('on', on)
      b.setAttribute('aria-checked', String(on))
      b.tabIndex = on ? 0 : -1
    })

  // Arrow keys move through the grid, like any radio group.
  grid.onkeydown = (e) => {
    const i = options.indexOf(document.activeElement as HTMLButtonElement)
    if (i < 0) return
    const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length || 6
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key]
    if (step === undefined) {
      if (e.key === 'Escape') {
        grid.hidden = true
        label()
        toggle.focus()
      }
      return
    }
    e.preventDefault()
    options[(i + step + options.length) % options.length].focus()
  }

  toggle.onclick = () => {
    grid.hidden = !grid.hidden
    label()
    if (!grid.hidden) options.find((b) => b.classList.contains('on'))?.focus()
  }

  grid.append(...options)
  mark()
  label()
  return h('div', { class: 'pf-avatar-picker' }, toggle, grid)
}
