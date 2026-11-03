// Pure voice-chat logic: settings, who-is-who, and speaking detection.
// No browser APIs here, so it is unit tested; voice.ts wires it to WebRTC.

export type VoiceMode = 'open' | 'ptt'

export interface VoiceSettings {
  mode: VoiceMode
  /** Everyone's voices, 0..1. */
  volume: number
}

export const VOICE_DEFAULTS: VoiceSettings = { mode: 'open', volume: 0.8 }
/** Per-player volume goes up to 150% to lift a quiet microphone. */
export const PLAYER_VOLUME_MAX = 1.5

export function parseVoiceSettings(raw: unknown): VoiceSettings {
  const r = (raw ?? {}) as Partial<VoiceSettings>
  return {
    mode: r.mode === 'open' || r.mode === 'ptt' ? r.mode : VOICE_DEFAULTS.mode,
    volume: typeof r.volume === 'number' && r.volume >= 0 && r.volume <= 1 ? r.volume : VOICE_DEFAULTS.volume,
  }
}

export function clampPlayerVolume(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(PLAYER_VOLUME_MAX, v)) : 1
}

const SETTINGS_KEY = 'play-forge:voice'

export function loadVoiceSettings(): VoiceSettings {
  try {
    return parseVoiceSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null'))
  } catch {
    return { ...VOICE_DEFAULTS }
  }
}

export function saveVoiceSettings(s: VoiceSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    // storage unavailable: settings last for this page
  }
}

/** Whether our microphone should be live right now. */
export function transmitting(s: {
  joined: boolean
  muted: boolean
  mode: VoiceMode
  holding: boolean
}): boolean {
  return s.joined && !s.muted && (s.mode === 'open' || s.holding)
}

/** Voice status each player broadcasts, so others can map peer → player. */
export interface VoiceAnnounce {
  /** Player id. */
  p: string
  /** Sharing a microphone. */
  mic: boolean
  /** Microphone muted. */
  m: boolean
}

export function parseAnnounce(raw: unknown): VoiceAnnounce | null {
  const r = raw as Partial<VoiceAnnounce> | null
  if (!r || typeof r !== 'object' || typeof r.p !== 'string' || !r.p || r.p.length > 40) return null
  return { p: r.p, mic: r.mic === true, m: r.m === true }
}

export interface VoicePeerState {
  mic: boolean
  muted: boolean
}

/** Who is behind each peer connection, and their mic state. */
export class VoiceRoster {
  private byPeer = new Map<string, string>()
  private states = new Map<string, VoicePeerState>()

  set(peerId: string, a: VoiceAnnounce): void {
    // A player who reconnected has a new peer id; drop the old mapping.
    for (const [peer, player] of this.byPeer) if (player === a.p && peer !== peerId) this.byPeer.delete(peer)
    this.byPeer.set(peerId, a.p)
    this.states.set(a.p, { mic: a.mic, muted: a.m })
  }

  remove(peerId: string): void {
    const player = this.byPeer.get(peerId)
    this.byPeer.delete(peerId)
    if (player && ![...this.byPeer.values()].includes(player)) this.states.delete(player)
  }

  playerOf(peerId: string): string | undefined {
    return this.byPeer.get(peerId)
  }

  get(playerId: string): VoicePeerState | undefined {
    return this.states.get(playerId)
  }
}

/**
 * People sharing a mic: us (if joined) plus room players who announced one.
 * Only `others` count, so peers who aren't seated (or left) are ignored.
 */
export function inVoiceCount(
  self: { joined: boolean; peerState(playerId: string): VoicePeerState | undefined },
  others: { id: string }[],
): number {
  return (self.joined ? 1 : 0) + others.filter((p) => self.peerState(p.id)?.mic).length
}

/**
 * Turns microphone loudness (RMS, 0..1) into "is speaking", with a short hold
 * so the ring doesn't flicker between words.
 */
export class SpeakingDetector {
  static readonly THRESHOLD = 0.03
  static readonly HOLD_MS = 350
  private lastLoud = -Infinity

  update(level: number, now: number): boolean {
    if (level >= SpeakingDetector.THRESHOLD) this.lastLoud = now
    return now - this.lastLoud <= SpeakingDetector.HOLD_MS
  }
}
