import { h, icon, setLabel } from '@forge/ui/dom'
import { icons } from '@forge/ui/icons'
import { popover } from '@forge/ui/popover'
import { slider } from '@forge/ui/slider'
import { t } from './i18n'
import { fromStep, prefs, stepLabel, toStep, TWEAK_STEPS } from './prefs'
import { NO_TWEAK } from './world'

/**
 * Camera button with a popover: height and tilt of the player's own view. Saved in this browser
 * (prefs.ts) and applied live by the renderer; sliders show the raw saved value, the court-framing
 * clamp is applied at render time.
 */
export function cameraMenu(): HTMLElement {
  const button = h('button', { class: 'pf-btn icon', type: 'button' })
  setLabel(button, t('Camera view'))
  button.append(icon(icons.camera))

  const axis = (key: 'height' | 'tilt', label: string, ariaLabel: string) =>
    slider({
      label,
      ariaLabel,
      min: -TWEAK_STEPS,
      max: TWEAK_STEPS,
      step: 1,
      value: toStep(prefs.get().camera[key]),
      format: stepLabel,
      onInput: (s) => prefs.set({ camera: { ...prefs.get().camera, [key]: fromStep(s) } }),
    })
  const height = axis('height', t('Height'), t('Camera height'))
  const tilt = axis('tilt', t('Tilt'), t('Camera tilt'))
  const note = h('p', { class: 'pf-note', textContent: t('Only changes your own screen.') })
  const reset = h('button', { class: 'pf-btn wide', type: 'button', textContent: t('Reset view') })
  reset.onclick = () => prefs.set({ camera: { ...NO_TWEAK } })

  const menu = popover(
    { button, label: t('Camera view'), onOpen: () => height.input.focus() },
    height.row,
    tilt.row,
    note,
    reset,
  )
  prefs.onChange((p) => {
    height.set(toStep(p.camera.height))
    tilt.set(toStep(p.camera.tilt))
  })
  return menu.root
}
