import { describe, expect, it } from 'vitest'
import {
  clampPlayerVolume,
  inVoiceCount,
  parseAnnounce,
  parseVoiceSettings,
  PLAYER_VOLUME_MAX,
  SpeakingDetector,
  transmitting,
  VOICE_DEFAULTS,
  VoiceRoster,
} from './voice-state'

describe('voice settings', () => {
  it('falls back to defaults for missing or bad values', () => {
    expect(parseVoiceSettings(null)).toEqual(VOICE_DEFAULTS)
    expect(parseVoiceSettings({ mode: 'shout', volume: 7 })).toEqual(VOICE_DEFAULTS)
    expect(parseVoiceSettings({ mode: 'ptt', volume: 0.3 })).toEqual({ mode: 'ptt', volume: 0.3 })
  })

  it('keeps per-player volume between silent and a boost', () => {
    expect(clampPlayerVolume(-1)).toBe(0)
    expect(clampPlayerVolume(9)).toBe(PLAYER_VOLUME_MAX)
    expect(clampPlayerVolume(Number.NaN)).toBe(1)
    expect(clampPlayerVolume(0.5)).toBe(0.5)
  })
})

describe('transmitting', () => {
  it('sends audio only when in voice, unmuted and (for push-to-talk) holding', () => {
    expect(transmitting({ joined: false, muted: false, mode: 'open', holding: false })).toBe(false)
    expect(transmitting({ joined: true, muted: false, mode: 'open', holding: false })).toBe(true)
    expect(transmitting({ joined: true, muted: true, mode: 'open', holding: false })).toBe(false)
    expect(transmitting({ joined: true, muted: false, mode: 'ptt', holding: false })).toBe(false)
    expect(transmitting({ joined: true, muted: false, mode: 'ptt', holding: true })).toBe(true)
    // Muting wins over holding the talk key.
    expect(transmitting({ joined: true, muted: true, mode: 'ptt', holding: true })).toBe(false)
  })
})

describe('voice announcements', () => {
  it('accepts well-formed packets only', () => {
    expect(parseAnnounce({ p: 'abc', mic: true, m: false })).toEqual({ p: 'abc', mic: true, m: false })
    expect(parseAnnounce({ p: 'abc', mic: 'yes' })).toEqual({ p: 'abc', mic: false, m: false })
    expect(parseAnnounce({ p: '', mic: true })).toBeNull()
    expect(parseAnnounce({ p: 'x'.repeat(41), mic: true })).toBeNull()
    expect(parseAnnounce('hi')).toBeNull()
  })

  it('maps peers to players and forgets peers that leave', () => {
    const roster = new VoiceRoster()
    roster.set('peer1', { p: 'alice', mic: true, m: false })
    roster.set('peer2', { p: 'bob', mic: true, m: true })
    expect(roster.playerOf('peer1')).toBe('alice')
    expect(roster.get('bob')).toEqual({ mic: true, muted: true })
    // Alice reloads: new peer id, same player.
    roster.set('peer3', { p: 'alice', mic: false, m: false })
    expect(roster.playerOf('peer1')).toBeUndefined()
    expect(roster.get('alice')).toEqual({ mic: false, muted: false })
    roster.remove('peer2')
    expect(roster.get('bob')).toBeUndefined()
  })
})

describe('SpeakingDetector', () => {
  it('turns on above the threshold and holds briefly through pauses', () => {
    const d = new SpeakingDetector()
    expect(d.update(0.001, 0)).toBe(false)
    expect(d.update(0.2, 100)).toBe(true)
    // A short gap between words keeps the ring lit.
    expect(d.update(0.001, 200)).toBe(true)
    expect(d.update(0.001, 100 + SpeakingDetector.HOLD_MS + 1)).toBe(false)
  })
})

describe('inVoiceCount', () => {
  it('counts us and room players sharing a mic, not strangers or mic-less listeners', () => {
    const roster = new VoiceRoster()
    roster.set('p1', { p: 'alice', mic: true, m: true }) // muted still counts as in voice
    roster.set('p2', { p: 'bob', mic: false, m: false }) // only listening
    roster.set('p3', { p: 'stranger', mic: true, m: false }) // not in the room
    const peerState = (id: string) => roster.get(id)
    const others = [{ id: 'alice' }, { id: 'bob' }]
    expect(inVoiceCount({ joined: false, peerState }, others)).toBe(1)
    expect(inVoiceCount({ joined: true, peerState }, others)).toBe(2)
    expect(inVoiceCount({ joined: false, peerState }, [])).toBe(0)
  })
})
