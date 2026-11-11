import { h, icon, setLabel } from '@forge/ui/dom'
import { icons } from '@forge/ui/icons'
import { popover } from '@forge/ui/popover'
import {
  applyBackdropChoice,
  BACKDROP_CHOICES,
  DEFAULT_BACKDROP,
  getBackdropChoice,
  saveBackdropChoice,
  THEMES,
  type BackdropChoice,
} from '../scripts/backdrop.mjs'
import { t } from './i18n'

/** English names (translated in launcher/i18n.ts). */
export const BACKDROP_NAMES: Record<BackdropChoice, string> = {
  random: 'Random',
  sunset: 'Sunset',
  autumn: 'Autumn',
  canyon: 'Canyon',
  candy: 'Candy',
  day: 'Day',
  night: 'Night',
}

const KEYS = Object.keys(THEMES)

/** A little sky swatch for a choice: the theme's sky, or a stripe of every horizon for Random. */
function swatch(choice: BackdropChoice): HTMLElement {
  const bands =
    choice === 'random'
      ? Object.values(THEMES).map((th) => th.sky[th.sky.length - 2][0])
      : THEMES[choice].sky.map(([c]) => c)
  const dir = choice === 'random' ? '90deg' : '180deg'
  const step = 100 / bands.length
  const stops = bands.map((c, i) => `${c} ${i * step}% ${(i + 1) * step}%`).join(',')
  return h('span', { class: 'lc-bd-swatch', style: `background:linear-gradient(${dir},${stops})` })
}

/**
 * Top-bar button to pick the background: one theme (canyon until the player
 * picks) or Random (a new theme each visit). Applies at once and is saved, so the game loading
 * screens use it too (scripts/backdrop.mjs).
 */
export function backdropMenu(backdrop: Element | null): HTMLElement {
  const button = h('button', { class: 'pf-btn icon', type: 'button' })
  button.append(icon(icons.scene))

  const options = BACKDROP_CHOICES.map((choice) =>
    h(
      'button',
      {
        class: 'pf-btn wide lc-bd-option',
        type: 'button',
        onclick: () => pick(choice),
      },
      swatch(choice),
      h('span', { textContent: t(BACKDROP_NAMES[choice]) }),
    ),
  )

  const sync = () => {
    const current = getBackdropChoice()
    setLabel(button, t('Background: {name}', { name: t(BACKDROP_NAMES[current]) }))
    BACKDROP_CHOICES.forEach((choice, i) => {
      const on = choice === current
      options[i].classList.toggle('primary', on)
      if (on) options[i].setAttribute('aria-current', 'true')
      else options[i].removeAttribute('aria-current')
    })
  }

  const pick = (choice: BackdropChoice) => {
    saveBackdropChoice(choice)
    applyBackdropChoice(backdrop, KEYS, DEFAULT_BACKDROP)
    sync()
  }

  sync()
  return popover(
    {
      button,
      label: t('Background'),
      class: 'lc-bd-pop',
      onOpen: () => (options.find((o) => o.hasAttribute('aria-current')) ?? options[0]).focus(),
    },
    h('span', { class: 'pf-option-label', textContent: t('Background') }),
    ...options,
  ).root
}
