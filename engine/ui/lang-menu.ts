import { getLang, LANGS, setLang, translator } from '../core/i18n'
import { h } from './dom'

const t = translator({ Language: 'Ngôn ngữ', 'Language: {name}': 'Ngôn ngữ: {name}' })

/**
 * Header button showing the current language ("EN"), with a popover to pick
 * another. Picking reloads the page in it; the choice is shared by every game.
 */
export function langMenu(): HTMLElement {
  const current = LANGS.find((l) => l.id === getLang()) ?? LANGS[0]
  const label = t('Language: {name}', { name: current.label })
  const button = h('button', {
    class: 'pf-btn icon pf-lang-btn',
    type: 'button',
    textContent: current.id.toUpperCase(),
  })
  button.title = label
  button.setAttribute('aria-label', label)
  button.setAttribute('aria-haspopup', 'dialog')
  button.setAttribute('aria-expanded', 'false')

  const options = LANGS.map((l) => {
    const on = l.id === current.id
    const b = h('button', {
      class: `pf-btn wide${on ? ' primary' : ''}`,
      type: 'button',
      textContent: l.label,
      onclick: () => setLang(l.id),
    })
    b.lang = l.id
    if (on) b.setAttribute('aria-current', 'true')
    return b
  })
  const pop = h(
    'div',
    { class: 'pf-popover pf-lang-pop', role: 'dialog' } as never,
    h('span', { class: 'pf-option-label', textContent: t('Language') }),
    ...options,
  )
  pop.setAttribute('aria-label', t('Language'))
  pop.hidden = true
  const root = h('div', { class: 'pf-popover-anchor' }, button, pop)

  const close = () => {
    pop.hidden = true
    button.setAttribute('aria-expanded', 'false')
  }
  button.onclick = () => {
    pop.hidden = !pop.hidden
    button.setAttribute('aria-expanded', String(!pop.hidden))
    if (!pop.hidden) (options.find((o) => o.hasAttribute('aria-current')) ?? options[0]).focus()
  }
  document.addEventListener('pointerdown', (e) => {
    if (!root.contains(e.target as Node)) close()
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !pop.hidden) {
      e.stopPropagation()
      close()
      button.focus()
    }
  })
  return root
}
