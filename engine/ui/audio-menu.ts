import {
  getAudioSettings,
  onAudioSettingsChange,
  playSound,
  setAudioSettings,
  UI_SOUNDS,
} from '../audio/sound'
import { t } from './i18n'
import { h, icon, setLabel } from './dom'
import { icons } from './icons'
import { popover } from './popover'
import { slider } from './slider'

/**
 * Music volume, effects volume and mute, kept in sync with the saved settings (shared by every game,
 * saved in localStorage). `onSync` hears the new state (e.g. a button's icon).
 */
function audioControls(onSync?: (silent: boolean) => void) {
  const volume = (label: string, key: 'music' | 'sfx') =>
    slider({
      label,
      ariaLabel: t('{label} volume', { label }),
      value: Math.round(getAudioSettings()[key] * 100),
      onInput: (v) => setAudioSettings({ [key]: v / 100, muted: false }),
      // Let people hear the new effects level.
      onChange: key === 'sfx' ? () => playSound(UI_SOUNDS.ready) : undefined,
    })
  const music = volume(t('Music'), 'music')
  const sfx = volume(t('Effects'), 'sfx')
  const mute = h('button', { class: 'pf-btn wide', type: 'button' })
  mute.onclick = () => setAudioSettings({ muted: !getAudioSettings().muted })

  const sync = () => {
    const s = getAudioSettings()
    onSync?.(s.muted || (s.music === 0 && s.sfx === 0))
    for (const [ui, v] of [
      [music, s.music],
      [sfx, s.sfx],
    ] as const) {
      ui.set(Math.round(v * 100), s.muted ? t('Off') : undefined)
      ui.row.classList.toggle('muted', s.muted)
    }
    mute.textContent = s.muted ? t('Turn sound on') : t('Mute everything')
  }
  sync()
  onAudioSettingsChange(sync)
  return { music, nodes: [music.row, sfx.row, mute] }
}

/** The sound settings as one block (the settings sheet's Sound tab). */
export function audioPanel(): HTMLElement {
  return h('div', { class: 'pf-sheet-section' }, ...audioControls().nodes)
}

/** Sound button with a popover: music volume, effects volume, mute. */
export function audioMenu(): HTMLElement {
  const button = h('button', { class: 'pf-btn icon', type: 'button' })
  setLabel(button, t('Sound settings'))
  const c = audioControls((silent) => button.replaceChildren(icon(silent ? icons.soundOff : icons.soundOn)))
  return popover(
    { button, label: t('Sound settings'), onOpen: () => c.music.input.focus() },
    ...c.nodes,
  ).root
}
