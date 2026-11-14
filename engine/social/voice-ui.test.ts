// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

vi.mock('../audio/sound', () => ({ playSound: vi.fn() }))

import type { VoiceChat } from './voice'
import { voiceControls } from './voice-ui'

/** Just enough of VoiceChat for the controls to draw. */
function fakeChat(joined = false) {
  return {
    joined,
    mode: 'open',
    volume: 1,
    live: false,
    isMuted: false,
    on: () => () => {},
    peerState: () => undefined,
    isSpeaking: () => false,
    playerVolume: () => 1,
    isPlayerMuted: () => false,
  } as unknown as VoiceChat
}

const players = () => [{ id: 'b', name: 'Bo', avatar: 'cat', color: '#f00' }]

describe('voice panel', () => {
  it('lists players first and puts join / leave at the bottom', () => {
    const v = voiceControls(fakeChat(), players)
    const body = v.panel().querySelector('.pf-voice-body')!
    const kids = [...body.children] as HTMLElement[]
    const list = kids.findIndex((el) => el.classList.contains('pf-voice-list'))
    const volume = kids.findIndex((el) => el.classList.contains('pf-slider'))
    const join = kids.findIndex((el) => el.dataset.k === 'join')
    expect(list).toBeGreaterThanOrEqual(0)
    expect(list).toBeLessThan(volume)
    expect(join).toBe(kids.length - 1)
    expect(kids[join].textContent).toBe('Join voice chat')
    v.destroy()
  })

  it('shows Leave when already in voice', () => {
    const v = voiceControls(fakeChat(true), players)
    const join = v.panel().querySelector<HTMLElement>('[data-k="join"]')!
    expect(join.textContent).toBe('Leave voice chat')
    v.destroy()
  })
})

describe('who is in voice', () => {
  it('the mic button counts the others in voice (the fan button lights up with it)', () => {
    const chat = fakeChat()
    ;(chat as unknown as { peerState: () => unknown }).peerState = () => ({ mic: true, muted: false })
    const v = voiceControls(chat, players)
    const count = v.mic.querySelector<HTMLElement>('.pf-count')!
    expect(count.hidden).toBe(false)
    expect(count.textContent).toBe('1')
    v.destroy()
  })
})
