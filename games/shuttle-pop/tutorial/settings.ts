// Tutorial card "Make it yours": the few settings most worth knowing, each with where to find it
// (the view-settings button over the court, or the top bar's More menu), plus the match options.
// Shell words are taken from the shell's own dictionaries so they read exactly as on screen.
import { h, icon } from '@forge/ui/dom'
import { t as shellT } from '@forge/ui/i18n'
import { icons } from '@forge/ui/icons'
import { t as barT } from '@forge/social/i18n'
import type { TutorialCard } from '@forge/ui/tutorial'
import { SETTING_LABELS } from '../camera-menu'
import { t } from '../i18n'

/** Where a setting lives: the button's icon and a short name. */
const place = (svg: string, name: string) =>
  h('span', { class: 'sp-tut-place' }, icon(svg), h('span', { textContent: name }))
const name = (text: string) => h('b', { class: 'sp-tut-name', textContent: text })
const chip = (text: string) => h('span', { class: 'sp-tut-chip', textContent: text })

function settingsBody(): HTMLElement {
  const view = () => place(icons.settings, t('View'))
  const row = (where: HTMLElement, ...what: (Node | string)[]) => [where, h('span', {}, ...what)]
  const list = h(
    'div',
    { class: 'sp-tut-set' },
    ...row(view(), name(t(SETTING_LABELS.ring)), ` — ${t('where the shuttle drops')}`),
    ...row(view(), name(t(SETTING_LABELS.autoSwing)), ` — ${t('jump & dive swing for you, great to start')}`),
    ...row(view(), name(t(SETTING_LABELS.graphics)), ` — ${t('Low if your device lags')}`),
    ...row(place(icons.more, barT('More')), name(t('Sound')), ' & ', name(shellT('Language'))),
  )
  const match = h(
    'p',
    { class: 'sp-tut-note' },
    `${t('Before a match:')} `,
    chip(`${t('1 vs 1')} / ${t('2 vs 2')}`),
    chip(t('Computer level')),
    chip(t('Court size')),
  )
  const replay = h('p', {
    class: 'sp-tut-note',
    textContent: t('Replay anytime: {button}', { button: shellT('How to play') }),
  })
  return h('div', { class: 'sp-tut-settings' }, list, match, replay)
}

export function settingsCard(): TutorialCard {
  return {
    id: 'settings',
    title: t('Make it yours'),
    caption: t('Change these anytime, even mid-match'),
    body: () => settingsBody(),
  }
}
