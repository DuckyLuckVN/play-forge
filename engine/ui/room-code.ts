// Room codes: making them, reading one out of whatever a player types or pastes (a code, a whole
// invite link), and the 5-box code field on the start screen.
import { h } from './dom'

/** No O/0 or I/1: codes are read aloud and typed from a friend's screen. */
export const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const ROOM_CODE_LENGTH = 5

export function newRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH))
  return Array.from(bytes, (b) => ROOM_ALPHABET[b % ROOM_ALPHABET.length]).join('')
}

/** The code in a typed code or a pasted invite link ("…#room=K7QXP"), upper-cased, at most 5 letters. */
export function parseRoomCode(text: string): string {
  const fromLink = /room=([A-Za-z0-9]+)/.exec(text)?.[1]
  return [...(fromLink ?? text).toUpperCase()]
    .filter((ch) => ROOM_ALPHABET.includes(ch))
    .join('')
    .slice(0, ROOM_CODE_LENGTH)
}

export interface CodeInput {
  root: HTMLElement
  /** The real field (focus, keys, screen readers); the boxes only draw it. */
  input: HTMLInputElement
  value(): string
}

/**
 * One letter per box. A single real input sits over the boxes, so typing, pasting a link and phone
 * keyboards all just work. `onComplete` runs when the 5th letter goes in.
 */
export function codeInput(opts: {
  label: string
  value?: string
  onComplete(code: string): void
}): CodeInput {
  const input = h('input', {
    class: 'pf-code-input',
    value: parseRoomCode(opts.value ?? ''),
    spellcheck: false,
    autocomplete: 'off',
  })
  input.setAttribute('aria-label', opts.label)
  input.setAttribute('autocapitalize', 'characters')
  input.setAttribute('enterkeyhint', 'go')
  const boxes = Array.from({ length: ROOM_CODE_LENGTH }, () => h('span', { class: 'pf-code-box' }))
  const root = h('div', { class: 'pf-code' }, ...boxes, input)
  root.onclick = () => input.focus()

  const draw = () => {
    const v = input.value
    boxes.forEach((b, i) => {
      b.textContent = v[i] ?? ''
      b.classList.toggle('filled', i < v.length)
      b.classList.toggle('next', i === v.length)
    })
  }
  input.addEventListener('input', () => {
    const before = input.value
    const v = parseRoomCode(before)
    input.value = v
    draw()
    if (v.length === ROOM_CODE_LENGTH && before !== '') opts.onComplete(v)
  })
  draw()
  return { root, input, value: () => input.value }
}
