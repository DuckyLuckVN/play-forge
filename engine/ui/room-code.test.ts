// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { codeField, newRoomCode, parseRoomCode, ROOM_ALPHABET } from './room-code'

describe('parseRoomCode', () => {
  it('takes a typed code, upper-cased', () => {
    expect(parseRoomCode('k7qxp')).toBe('K7QXP')
  })
  it('takes the code out of a pasted invite link', () => {
    expect(parseRoomCode('https://x.io/games/caro/index.html#room=K7QXP')).toBe('K7QXP')
    expect(parseRoomCode('join me! …#room=ab2cd now')).toBe('AB2CD')
  })
  it('drops what can never be in a code (spaces, dashes, O/0/I/1) and keeps 5 at most', () => {
    expect(parseRoomCode(' k7-q x p ')).toBe('K7QXP')
    expect(parseRoomCode('O0I1K')).toBe('K')
    expect(parseRoomCode('ABCDEFGH')).toBe('ABCDE')
  })
  it('new codes use only the code alphabet', () => {
    const c = newRoomCode()
    expect(c).toHaveLength(5)
    for (const ch of c) expect(ROOM_ALPHABET).toContain(ch)
  })
})

describe('codeField', () => {
  const type = (input: HTMLInputElement, value: string) => {
    input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }

  it('a plain text field (the CODE box) that keeps only the code: upper-cased, from a pasted link too', () => {
    const f = codeField({ label: 'Room code', placeholder: 'CODE' })
    expect(f.classList.contains('pf-input')).toBe(true)
    expect(f.classList.contains('code')).toBe(true)
    expect(f.placeholder).toBe('CODE')
    expect(f.getAttribute('aria-label')).toBe('Room code')
    type(f, 'k7q')
    expect(f.value).toBe('K7Q')
    type(f, 'https://x.io/#room=ab2cd')
    expect(f.value).toBe('AB2CD')
  })

  it('starts from a given code', () => {
    expect(codeField({ label: 'Room code', placeholder: 'CODE', value: 'k7qxp' }).value).toBe('K7QXP')
  })
})
