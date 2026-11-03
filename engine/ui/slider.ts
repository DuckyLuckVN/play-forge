import { h } from './dom'

export interface SliderOptions {
  /** Visible label. */
  label: string
  /** Accessible name if it should differ from the label, e.g. "Music volume". */
  ariaLabel?: string
  min?: number
  max?: number
  step?: number
  value: number
  /** Text shown next to the label. Default: the value as a percentage. */
  format?(value: number): string
  /** While dragging. */
  onInput(value: number): void
  /** Once released, e.g. to play a preview sound. */
  onChange?(value: number): void
}

export interface Slider {
  row: HTMLLabelElement
  input: HTMLInputElement
  /** Update without firing callbacks; `text` overrides the formatted value. */
  set(value: number, text?: string): void
}

/** A labelled range input with its value shown, styled like the sound menu. */
export function slider(opts: SliderOptions): Slider {
  const format = opts.format ?? ((v: number) => `${Math.round(v)}%`)
  const input = h('input', {
    type: 'range',
    min: String(opts.min ?? 0),
    max: String(opts.max ?? 100),
    step: String(opts.step ?? 5),
    class: 'pf-range',
  })
  input.setAttribute('aria-label', opts.ariaLabel ?? opts.label)
  const value = h('span', { class: 'pf-range-value' })
  const row = h('label', { class: 'pf-slider' }, h('span', { textContent: opts.label }), value, input)
  const set = (v: number, text?: string) => {
    input.value = String(v)
    value.textContent = text ?? format(v)
  }
  input.oninput = () => {
    const v = Number(input.value)
    value.textContent = format(v)
    opts.onInput(v)
  }
  if (opts.onChange) input.onchange = () => opts.onChange!(Number(input.value))
  set(opts.value)
  return { row, input, set }
}
