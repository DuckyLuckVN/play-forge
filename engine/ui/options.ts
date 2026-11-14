import type { GameOptions, OptionDef } from '../net/session'
import { h, icon } from './dom'
import { t } from './i18n'
import { icons } from './icons'

/**
 * Segmented controls for a game's options (one row per option). Disabled
 * pickers still show the current choice, e.g. to guests in a room.
 * `blocked` returns why a choice can't be picked right now (e.g. too many
 * players for it), or null: that choice is disabled and the reason shows
 * under its row.
 */
export function optionPickers(
  defs: OptionDef[],
  values: GameOptions,
  onChange: ((id: string, value: string) => void) | null,
  blocked?: (id: string, value: string, label: string) => string | null,
): HTMLElement | null {
  if (!defs.length) return null
  return h(
    'div',
    { class: 'pf-options' },
    ...defs.map((def) => {
      const group = h('div', { class: 'pf-segmented', role: 'radiogroup' } as never)
      group.setAttribute('aria-label', def.label)
      const reasons: string[] = []
      for (const choice of def.choices) {
        const selected = values[def.id] === choice.value
        const reason = onChange && !selected ? (blocked?.(def.id, choice.value, choice.label) ?? null) : null
        const b = h('button', {
          type: 'button',
          class: `pf-segment${selected ? ' on' : ''}`,
          textContent: choice.label,
          disabled: !onChange || !!reason,
        })
        b.setAttribute('role', 'radio')
        b.setAttribute('aria-checked', String(selected))
        if (reason) {
          b.title = reason
          reasons.push(reason)
        } else if (onChange) b.onclick = () => onChange(def.id, choice.value)
        group.append(b)
      }
      return h(
        'div',
        { class: 'pf-option' },
        h('span', { class: 'pf-option-label', textContent: def.label }),
        group,
        reasons.length > 0 && h('p', { class: 'pf-option-hint', textContent: reasons.join(' ') }),
      )
    }),
  )
}

/**
 * Each option's name, small, with its current choice under it: what a player needs to know before
 * playing, at a glance. An "off" choice is faded so what is on stands out.
 */
export function optionSpecs(defs: OptionDef[], values: GameOptions): HTMLElement {
  return h(
    'span',
    { class: 'pf-specs' },
    ...defs.map((def) => {
      const choice = def.choices.find((c) => c.value === values[def.id])
      return h(
        'span',
        { class: 'pf-spec' },
        h('span', { class: 'pf-spec-k', textContent: def.label }),
        h('span', {
          class: choice?.value === 'off' ? 'pf-spec-v off' : 'pf-spec-v',
          textContent: choice?.label ?? '',
        }),
      )
    }),
  )
}

/**
 * A game's options folded into a small summary (each name with its choice), so the room stays short. The host presses it to show
 * the pickers (`open` is kept by the caller across redraws); guests just read it. A single option is
 * short enough already: its pickers come back as they are.
 */
/** One line per setting: its name on the left, the choice on the right (the "list" summary look). */
export function optionRows(defs: OptionDef[], values: GameOptions): HTMLElement {
  return h(
    'span',
    { class: 'pf-optrows' },
    ...defs.map((def) => {
      const choice = def.choices.find((c) => c.value === values[def.id])
      return h(
        'span',
        { class: 'pf-optrow' },
        h('span', { class: 'pf-optrow-k', textContent: def.label }),
        h('span', {
          class: choice?.value === 'off' ? 'pf-optrow-v off' : 'pf-optrow-v',
          textContent: choice?.label ?? '',
        }),
      )
    }),
  )
}

/**
 * How the folded summary is drawn: 'grid' (names over choices) or 'list' (one line each). Both are
 * live for now so they can be compared in the real app; the loser goes once one is picked.
 */
export type FoldLook = 'grid' | 'list'

const LOOK_KEY = 'play-forge:settings-look'

/** The look to draw: `?settings=list|grid` in the address picks one and is remembered (compare switch). */
export function foldLook(): FoldLook {
  const asked = new URLSearchParams(location.search).get('settings')
  try {
    if (asked === 'list' || asked === 'grid') localStorage.setItem(LOOK_KEY, asked)
    return localStorage.getItem(LOOK_KEY) === 'list' ? 'list' : 'grid'
  } catch {
    return asked === 'list' ? 'list' : 'grid'
  }
}

export function optionsFold(o: {
  defs: OptionDef[]
  values: GameOptions
  pickers: HTMLElement
  editable: boolean
  open: boolean
  onToggle(open: boolean): void
  look?: FoldLook
}): HTMLElement {
  if (o.defs.length <= 1) return o.pickers
  const list = o.look === 'list'
  const summary = list ? optionRows(o.defs, o.values) : optionSpecs(o.defs, o.values)
  if (!o.editable) return h('div', { class: 'pf-options-fold' }, summary)
  const toggle = h(
    'button',
    {
      class: `pf-options-toggle${list ? ' list' : ''}${o.open ? ' open' : ''}`,
      type: 'button',
      onclick: () => o.onToggle(!o.open),
    },
    summary,
    h('span', { class: 'pf-options-edit' }, icon(icons.chevronDown), o.open ? t('Done') : t('Change')),
  )
  toggle.setAttribute('aria-expanded', String(o.open))
  o.pickers.hidden = !o.open
  return h('div', { class: 'pf-options-fold' }, toggle, o.pickers)
}
