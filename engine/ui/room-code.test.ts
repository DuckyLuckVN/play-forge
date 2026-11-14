// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { codeInput, newRoomCode, parseRoomCode, ROOM_ALPHABET } from './room-code'

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

describe('codeInput', () => {
  const type = (input: HTMLInputElement, value: string) => {
    input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }

  it('shows 5 boxes that fill as you type, the next one marked', () => {
    const c = codeInput({ label: 'Room code', onComplete: () => {} })
    document.body.append(c.root)
    type(c.input, 'k7')
    const boxes = [...c.root.querySelectorAll<HTMLElement>('.pf-code-box')]
    expect(boxes.map((b) => b.textContent)).toEqual(['K', '7', '', '', ''])
    expect(boxes.map((b) => b.classList.contains('next'))).toEqual([false, false, true, false, false])
    expect(c.input.value).toBe('K7')
    expect(c.input.getAttribute('aria-label')).toBe('Room code')
  })

  it('calls onComplete once the 5th letter is in (typed or a pasted link)', () => {
    const done = vi.fn()
    const c = codeInput({ label: 'Room code', onComplete: done })
    type(c.input, 'K7QX')
    expect(done).not.toHaveBeenCalled()
    type(c.input, 'https://x.io/#room=ab2cd')
    expect(c.input.value).toBe('AB2CD')
    expect(done).toHaveBeenCalledWith('AB2CD')
  })

  it('starts from a given code without joining by itself', () => {
    const done = vi.fn()
    const c = codeInput({ label: 'Room code', value: 'K7QXP', onComplete: done })
    expect(c.value()).toBe('K7QXP')
    expect(done).not.toHaveBeenCalled()
  })
})
