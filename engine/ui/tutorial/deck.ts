// Step-card "How to play" deck: game-agnostic cards (title, clip, caption, hint) with Skip / Next,
// arrow keys and swipe. Games pass already-translated card text; the shell supplies the chrome strings.
import { prefersTouch } from '../../core/device'
import { button } from '../components'
import { h, icon } from '../dom'
import { t } from '../i18n'
import { inputIcons } from '../icons'

export interface ClipContext {
  reducedMotion: boolean
  touch: boolean
}
export type ClipFactory = (ctx: ClipContext) => Element

export interface TutorialCard {
  id: string
  /** Already translated by the game. */
  title: string
  caption: string
  clip?: ClipFactory
  hint?: { pc?: string; touch?: string }
  /** E.g. a settings list; shown under the clip. */
  body?: (ctx: ClipContext) => Element
  /** E.g. a key pad. */
  below?: (ctx: ClipContext) => Element
}

/** dismissed = closed by code (e.g. an online countdown starting). */
export type DeckEnd = 'done' | 'skipped' | 'dismissed'

export interface OpenTutorialOptions {
  onClose?: (end: DeckEnd) => void
  touch?: boolean
  reducedMotion?: boolean
  /** Shows "Full controls ›" on the last card when set. */
  fullControls?: () => void
}

/** Horizontal travel (px) that counts as a swipe. */
const SWIPE_MIN = 40

const defaultReducedMotion = (): boolean =>
  !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * Shows the deck as a modal over everything under the top bar. Keys pressed while it is open don't
 * reach the game or the shell (Esc skips, it doesn't pause). A backdrop tap does not close it.
 * Returns a close function (reports 'dismissed').
 */
export function openTutorial(cards: readonly TutorialCard[], o: OpenTutorialOptions = {}): () => void {
  const ctx: ClipContext = {
    reducedMotion: o.reducedMotion ?? defaultReducedMotion(),
    touch: o.touch ?? prefersTouch(),
  }
  const before = document.activeElement as HTMLElement | null
  let index = 0
  let closed = false

  const end = (how: DeckEnd) => {
    if (closed) return
    closed = true
    window.removeEventListener('keydown', onKey, true)
    layer.remove()
    before?.focus?.({ preventScroll: true })
    o.onClose?.(how)
  }
  const go = (to: number) => {
    const next = Math.max(0, Math.min(cards.length - 1, to))
    if (next === index) return
    index = next
    render()
  }
  const onKey = (e: KeyboardEvent) => {
    // A dialog opened over the deck (the guide from "Full controls") owns the keys; it swallows them.
    const layers = document.querySelectorAll('.pf-guide-layer')
    if (layers[layers.length - 1] !== layer) return
    e.stopPropagation()
    if (e.code === 'Escape') {
      e.preventDefault()
      end('skipped')
    } else if (e.code === 'ArrowRight') {
      e.preventDefault()
      go(index + 1)
    } else if (e.code === 'ArrowLeft') {
      e.preventDefault()
      go(index - 1)
    }
  }

  const panel = h('div', { class: 'pf-panel pf-tut-panel enter' })
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-modal', 'true')
  panel.setAttribute('aria-label', t('How to play'))
  const layer = h('div', { class: 'pf-guide-layer pf-tut-layer' }, panel)

  // Swipe on the card: left = next, right = back.
  let downX: number | null = null
  panel.addEventListener('pointerdown', (e) => {
    downX = e.clientX
  })
  panel.addEventListener('pointerup', (e) => {
    if (downX === null) return
    const dx = e.clientX - downX
    downX = null
    if (Math.abs(dx) >= SWIPE_MIN) go(index + (dx < 0 ? 1 : -1))
  })
  panel.addEventListener('pointercancel', () => {
    downX = null
  })

  function render(): void {
    const card = cards[index]
    const last = index === cards.length - 1
    const hint = ctx.touch ? card.hint?.touch : card.hint?.pc
    const body = h('div', { class: 'pf-tut-card' })
    body.append(
      h('p', {
        class: 'pf-tut-step',
        textContent: t('Step {n} of {total}', { n: index + 1, total: cards.length }),
      }),
      h('h2', { class: 'pf-tut-title', textContent: card.title }),
    )
    if (card.clip) body.append(h('div', { class: 'pf-tut-clip' }, card.clip(ctx)))
    body.append(h('p', { class: 'pf-tut-caption', textContent: card.caption }))
    if (hint) {
      const el = h('p', { class: 'pf-tut-hint' })
      el.append(icon(ctx.touch ? inputIcons.tap : inputIcons.keyboard), document.createTextNode(hint))
      body.append(el)
    }
    if (card.body) body.append(card.body(ctx))
    if (card.below) body.append(card.below(ctx))

    const dots = h(
      'div',
      { class: 'pf-tut-dots' },
      ...cards.map((_, i) => h('i', { class: i === index ? 'on' : '' })),
    )
    dots.setAttribute('aria-hidden', 'true')

    const row = h('div', { class: 'pf-tut-row' })
    row.append(button(t('Skip'), () => end('skipped'), 'quiet'))
    if (index > 0) row.append(button(t('Back'), () => go(index - 1)))
    const primary = last
      ? button(t("Let's play!"), () => end('done'), 'primary')
      : button(t('Next'), () => go(index + 1), 'primary')
    primary.classList.add('pf-tut-primary')
    row.append(primary)

    panel.replaceChildren(body, dots, row)
    if (last && o.fullControls) {
      const fc = o.fullControls
      panel.append(button(`${t('Full controls')} ›`, () => fc(), 'quiet sm pf-tut-full'))
    }
    primary.focus({ preventScroll: true })
  }

  render()
  document.body.append(layer)
  window.addEventListener('keydown', onKey, true)
  ;(panel.querySelector('.pf-tut-primary') as HTMLElement).focus({ preventScroll: true })
  return () => end('dismissed')
}

/** A "How to play" button that opens the deck. */
export function tutorialButton(open: () => void): HTMLButtonElement {
  const b = h('button', { class: 'pf-btn sm pf-guide-btn', type: 'button', onclick: open })
  b.append(icon(inputIcons.keyboard), h('span', { textContent: t('How to play') }))
  return b
}
