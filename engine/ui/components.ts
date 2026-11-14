// Builders for the shared components in engine/ui/styles/components (see docs/styling.md).
// Each has a pure class-name builder, so markup and tests agree on the classes.
import { h, icon, setLabel, type Child } from './dom'

/** Button modifiers; combine with spaces, e.g. 'primary wide', 'sm danger'. */
export type ButtonVariant = 'primary' | 'quiet' | 'icon' | 'wide' | 'sm' | 'danger' | 'loading'
/** Card modifiers: sunken (pit background, no lift), raised (lifts on hover), sm (notice size). */
export type CardVariant = 'sunken' | 'raised' | 'sm'
/** Pill modifiers: an accent colour, and/or a leading dot. */
export type PillVariant = 'mint' | 'common' | 'rare' | 'epic' | 'dot'

/** Joins class names, skipping empty ones. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts
    .flatMap((p) => (p ? p.split(/\s+/) : []))
    .filter(Boolean)
    .join(' ')
}

export const buttonClass = (variant = '') => cx('pf-btn', variant)
export const cardClass = (variant = '') => cx('pf-card', variant)
export const pillClass = (variant = '') => cx('pf-pill', variant)
export const noteClass = (error = false) => cx('pf-note', error && 'error')

/** A chunky text button. `variant` takes space-separated `ButtonVariant`s (or game classes). */
export function button(text: string, onclick: () => void, variant = ''): HTMLButtonElement {
  return h('button', { class: buttonClass(variant), textContent: text, onclick, type: 'button' })
}

/**
 * A big start-screen choice (Play solo / Create room / Join): an icon, a title and one line under it.
 * `icon` is trusted inline SVG from icons.ts.
 */
export function actionButton(o: {
  title: string
  sub?: string
  icon?: string
  onclick: () => void
  primary?: boolean
}): HTMLButtonElement {
  const art = h('span', { class: 'pf-action-icon' })
  if (o.icon) art.innerHTML = o.icon // trusted: our own icon markup
  return h(
    'button',
    { class: cx('pf-btn', 'pf-action', o.primary && 'primary'), type: 'button', onclick: o.onclick },
    o.icon && art,
    h(
      'span',
      { class: 'pf-action-text' },
      h('span', { class: 'pf-action-title', textContent: o.title }),
      o.sub && h('span', { class: 'pf-action-sub', textContent: o.sub }),
    ),
  )
}

/**
 * A small toolbar button (`.pf-btn.sm`): icon plus a `.pf-btn-label` text that
 * games may hide on phones. The label is also its tooltip and accessible name.
 */
export function toolButton(
  label: string,
  svgIcon: string,
  onclick: () => void,
  variant = '',
): HTMLButtonElement {
  const b = h('button', { class: buttonClass(cx('sm', variant)), type: 'button', onclick })
  b.append(icon(svgIcon), h('span', { class: 'pf-btn-label', textContent: label }))
  setLabel(b, label)
  return b
}

/** A modal card for an overlay (start, room and results screens). */
export function panel(...children: Child[]): HTMLDivElement {
  return h('div', { class: 'pf-panel' }, ...children)
}

/** A content card: felt surface, rim border, raised edge. */
export function card(...children: Child[]): HTMLDivElement {
  return h('div', { class: cardClass() }, ...children)
}

/** A small rounded label, e.g. a price, a level, "NEW". */
export function pill(text: string, variant = ''): HTMLSpanElement {
  return h('span', { class: pillClass(variant), textContent: text })
}

/** A quiet centred line of help text, or an error message. */
export function note(text: string, error = false): HTMLParagraphElement {
  return h('p', { class: noteClass(error), textContent: text })
}
