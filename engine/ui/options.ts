import type { GameOptions, OptionDef } from '../net/session'
import { h } from './dom'

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
