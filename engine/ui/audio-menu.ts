import { getAudioSettings, onAudioSettingsChange, playSound, setAudioSettings, UI_SOUNDS } from '../audio/sound'
import { h, icon } from './dom'
import { icons } from './icons'

/**
 * Sound button with a popover: music volume, effects volume, mute.
 * Settings are shared by every game and saved in localStorage.
 */
export function audioMenu(): HTMLElement {
  const button = h('button', { class: 'pf-btn icon', type: 'button' })
  button.setAttribute('aria-haspopup', 'dialog')
  button.setAttribute('aria-expanded', 'false')

  const slider = (label: string, key: 'music' | 'sfx') => {
    const input = h('input', { type: 'range', min: '0', max: '100', step: '5', class: 'pf-range' })
    input.setAttribute('aria-label', `${label} volume`)
    input.oninput = () => setAudioSettings({ [key]: Number(input.value) / 100, muted: false })
    // Let people hear the new effects level.
    if (key === 'sfx') input.onchange = () => playSound(UI_SOUNDS.ready)
    const value = h('span', { class: 'pf-range-value' })
    const row = h('label', { class: 'pf-slider' }, h('span', { textContent: label }), value, input)
    return { row, input, value }
  }
  const music = slider('Music', 'music')
  const sfx = slider('Effects', 'sfx')
  const mute = h('button', { class: 'pf-btn wide', type: 'button' })
  mute.onclick = () => setAudioSettings({ muted: !getAudioSettings().muted })

  const pop = h('div', { class: 'pf-popover', role: 'dialog' } as never, music.row, sfx.row, mute)
  pop.setAttribute('aria-label', 'Sound settings')
  pop.hidden = true
  const root = h('div', { class: 'pf-popover-anchor' }, button, pop)

  const sync = () => {
    const s = getAudioSettings()
    const silent = s.muted || (s.music === 0 && s.sfx === 0)
    button.replaceChildren(icon(silent ? icons.soundOff : icons.soundOn))
    const label = 'Sound settings'
    button.title = label
    button.setAttribute('aria-label', label)
    for (const [ui, v] of [
      [music, s.music],
      [sfx, s.sfx],
    ] as const) {
      ui.input.value = String(Math.round(v * 100))
      ui.value.textContent = s.muted ? 'Off' : `${Math.round(v * 100)}%`
      ui.row.classList.toggle('muted', s.muted)
    }
    mute.textContent = s.muted ? 'Turn sound on' : 'Mute everything'
  }
  sync()
  onAudioSettingsChange(sync)

  const close = () => {
    pop.hidden = true
    button.setAttribute('aria-expanded', 'false')
  }
  button.onclick = () => {
    pop.hidden = !pop.hidden
    button.setAttribute('aria-expanded', String(!pop.hidden))
    if (!pop.hidden) music.input.focus()
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
