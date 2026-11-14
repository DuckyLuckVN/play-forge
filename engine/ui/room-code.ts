// Room codes: making them, reading one out of whatever a player types or pastes (a code, a whole
// invite link), and the code field on the start screen.
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

/**
 * The room code field: a plain text box that keeps only the code as you type, upper-cased, and takes
 * the code out of a pasted invite link. No maxLength: it would cut a pasted link before we read it.
 */
export function codeField(opts: { label: string; placeholder: string; value?: string }): HTMLInputElement {
  const input = h('input', {
    class: 'pf-input code',
    placeholder: opts.placeholder,
    value: parseRoomCode(opts.value ?? ''),
    spellcheck: false,
    autocomplete: 'off',
  })
  input.setAttribute('aria-label', opts.label)
  input.setAttribute('autocapitalize', 'characters')
  input.setAttribute('enterkeyhint', 'go')
  input.addEventListener('input', () => {
    const v = parseRoomCode(input.value)
    if (v !== input.value) input.value = v
  })
  return input
}
