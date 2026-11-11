import './social.css'
import { playSound } from '../audio/sound'
import { h, iconButton } from '../ui/dom'
import { icons } from '../ui/icons'
import { popover } from '../ui/popover'
import { avatarEl } from './avatar-ui'
import { t } from './i18n'
import { reactionSvg } from './reaction-art'
import { REACTIONS, reactionDef } from './reactions'

/** The drawing for one reaction, as an element. */
export function reactionEl(id: string, cls = 'pf-rx-art'): HTMLSpanElement {
  const el = h('span', { class: cls })
  el.innerHTML = reactionSvg(id) // trusted: our own constant markup
  return el
}

/**
 * Top-bar button plus a tray of reactions. The tray stays open so players
 * can fire a few in a row; the button, Esc or a click elsewhere closes it.
 * `onPick` returns false when the reaction was rate-limited.
 */
export function reactionPicker(onPick: (id: string) => boolean): HTMLElement {
  const options = REACTIONS.map((r) => {
    const b = h('button', { class: 'pf-rx-opt', type: 'button', title: t(r.name) }, reactionEl(r.id))
    b.setAttribute('aria-label', t(r.name))
    b.onclick = () => {
      if (onPick(r.id)) return
      // Rate-limited: a quick shake says "slow down" without a wall of toasts.
      menu.panel.classList.remove('nope')
      void menu.panel.offsetWidth
      menu.panel.classList.add('nope')
      menu.panel.title = t('Slow down a little')
    }
    return b
  })
  const menu = popover(
    {
      button: iconButton(icons.react, t('Send a reaction')),
      label: t('Reactions'),
      class: 'pf-rx-tray',
      role: 'group',
      onOpen: () => options[0].focus(),
    },
    ...options,
  )
  menu.panel.addEventListener('animationend', (e) => {
    if (e.target !== menu.panel) return
    menu.panel.classList.remove('nope')
    menu.panel.title = ''
  })
  return menu.root
}

export interface ReactionSender {
  avatar: string
  color: string
}

const MAX_LIVE = 14

/**
 * Floats reactions up from the sender: their seat in the lobby or their score
 * chip in game (any element with `data-player="<id>"`), else from the corner.
 */
export class ReactionLayer {
  private layer = h('div', { class: 'pf-rx-layer' })

  constructor(parent: HTMLElement = document.body) {
    this.layer.setAttribute('aria-hidden', 'true')
    parent.append(this.layer)
  }

  /** `soundOnly`: play the sound, float nothing (the game draws it itself). */
  show(
    playerId: string,
    reactionId: string,
    sender: ReactionSender,
    opts: { soundOnly?: boolean } = {},
  ): void {
    const def = reactionDef(reactionId)
    if (!def) return
    playSound(def.sound, 0.8)
    if (opts.soundOnly || document.hidden || this.layer.childElementCount >= MAX_LIVE) return

    const { x, y, dir } = this.origin(playerId)
    const bubble = h(
      'div',
      { class: 'pf-rx' },
      reactionEl(reactionId, `pf-rx-art ${def.motion}`),
      h('span', { class: 'pf-rx-who' }, avatarEl(sender.avatar)),
    )
    bubble.style.left = `${x + (Math.random() - 0.5) * 28}px`
    bubble.style.top = `${y}px`
    bubble.style.setProperty('--c', sender.color)
    bubble.style.setProperty('--dir', String(dir))
    bubble.style.setProperty('--drift', `${(Math.random() - 0.5) * 40}px`)
    bubble.addEventListener('animationend', (e) => {
      if (e.target === bubble) bubble.remove()
    })
    this.layer.append(bubble)
  }

  /** Where to start, and which way to float: up (-1), or down (1) from the top bar. */
  private origin(playerId: string): { x: number; y: number; dir: 1 | -1 } {
    const anchors = document.querySelectorAll<HTMLElement>(`[data-player="${CSS.escape(playerId)}"]`)
    for (const el of anchors) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      const nearTop = r.top < innerHeight * 0.2
      return { x: r.left + r.width / 2, y: nearTop ? r.bottom : r.top, dir: nearTop ? 1 : -1 }
    }
    return { x: innerWidth - 64, y: innerHeight - 40, dir: -1 }
  }

  dispose(): void {
    this.layer.remove()
  }
}
