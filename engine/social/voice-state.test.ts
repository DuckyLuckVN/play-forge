import { describe, expect, it } from 'vitest'
import {
  clampPlayerVolume,
  clearVoiceRejoin,
  loadVoiceRejoin,
  parseVoiceRejoin,
  saveVoiceRejoin,
  shouldAutoJoin,
  VOICE_REJOIN_TTL_MS,
  voiceRejoinKey,
  inVoiceCount,
  parseAnnounce,
  parseVoiceSettings,
  PLAYER_VOLUME_MAX,
  SpeakingDetector,
  transmitting,
  VOICE_DEFAULTS,
  VoiceRoster,
  type VoiceRejoin,
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

describe('voice rejoin memory', () => {
  const memoryStore = () => {
    const data = new Map<string, string>()
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
      data,
    }
  }
  const broken = {
    getItem: (): string | null => {
      throw new Error('denied')
    },
    setItem: () => {
      throw new Error('denied')
    },
    removeItem: () => {
      throw new Error('denied')
    },
  }
  const T0 = 1_800_000_000_000
  const KEY = 'play-forge:voice-room:shuttle-pop:K7QXP'

  it('saves per game and room under play-forge:voice-room:<game>:<room>', () => {
    const store = memoryStore()
    expect(voiceRejoinKey('shuttle-pop', 'K7QXP')).toBe(KEY)
    saveVoiceRejoin('shuttle-pop', 'K7QXP', true, T0, store)
    expect(JSON.parse(store.data.get(KEY)!)).toEqual({ joined: true, muted: true, at: T0 })
    expect(loadVoiceRejoin('shuttle-pop', 'K7QXP', T0 + 1000, store)).toEqual({
      joined: true,
      muted: true,
      at: T0,
    })
    expect(loadVoiceRejoin('shuttle-pop', 'AAAAA', T0, store)).toBeNull()
    expect(loadVoiceRejoin('caro', 'K7QXP', T0, store)).toBeNull()
    clearVoiceRejoin('shuttle-pop', 'K7QXP', store)
    expect(store.data.has(KEY)).toBe(false)
  })

  it('drops stale, corrupt or wrongly shaped entries', () => {
    const store = memoryStore()
    saveVoiceRejoin('shuttle-pop', 'K7QXP', false, T0, store)
    expect(loadVoiceRejoin('shuttle-pop', 'K7QXP', T0 + VOICE_REJOIN_TTL_MS + 1, store)).toBeNull()
    expect(store.data.has(KEY)).toBe(false)
    for (const raw of [
      '{oops',
      '"hi"',
      'null',
      '{"joined":false,"muted":false,"at":1}',
      `{"joined":true,"muted":"no","at":${T0}}`,
    ]) {
      store.data.set(KEY, raw)
      expect(loadVoiceRejoin('shuttle-pop', 'K7QXP', T0, store)).toBeNull()
      expect(store.data.has(KEY)).toBe(false)
    }
  })

  it('validates shape and age', () => {
    expect(parseVoiceRejoin({ joined: true, muted: false, at: T0 }, T0)).toEqual({
      joined: true,
      muted: false,
      at: T0,
    })
    expect(parseVoiceRejoin({ joined: true, muted: false, at: T0, extra: 1 }, T0)).toEqual({
      joined: true,
      muted: false,
      at: T0,
    })
    expect(parseVoiceRejoin({ joined: true, muted: false }, T0)).toBeNull()
    expect(parseVoiceRejoin({ joined: true, muted: false, at: Number.NaN }, T0)).toBeNull()
    // A clock far in the future is as suspect as a stale entry.
    expect(parseVoiceRejoin({ joined: true, muted: false, at: T0 + VOICE_REJOIN_TTL_MS + 1 }, T0)).toBeNull()
  })

  it('storage that throws or is missing: no crash, nothing remembered', () => {
    expect(() => saveVoiceRejoin('g', 'R', false, T0, broken)).not.toThrow()
    expect(loadVoiceRejoin('g', 'R', T0, broken)).toBeNull()
    expect(() => clearVoiceRejoin('g', 'R', broken)).not.toThrow()
    expect(loadVoiceRejoin('g', 'R', T0, undefined)).toBeNull()
  })
})

describe('shouldAutoJoin', () => {
  const saved: VoiceRejoin = { joined: true, muted: false, at: 0 }
  it('rejoins silently only when the mic is already allowed', () => {
    expect(shouldAutoJoin(saved, 'granted', true)).toBe('join')
    expect(shouldAutoJoin(saved, 'prompt', true)).toBe('ask')
    expect(shouldAutoJoin(saved, 'unknown', true)).toBe('ask')
  })
  it('does nothing when blocked, unsupported or nothing was saved', () => {
    expect(shouldAutoJoin(saved, 'denied', true)).toBe('none')
    expect(shouldAutoJoin(saved, 'granted', false)).toBe('none')
    expect(shouldAutoJoin(null, 'granted', true)).toBe('none')
  })
})
