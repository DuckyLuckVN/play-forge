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
