import { getLang, LANGS, setLang, translator } from '../core/i18n'
import { h, setLabel } from './dom'
import { popover } from './popover'

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
  setLabel(button, label)

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
  return popover(
    {
      button,
      label: t('Language'),
      class: 'pf-lang-pop',
      onOpen: () => (options.find((o) => o.hasAttribute('aria-current')) ?? options[0]).focus(),
    },
    h('span', { class: 'pf-option-label', textContent: t('Language') }),
    ...options,
  ).root
}
