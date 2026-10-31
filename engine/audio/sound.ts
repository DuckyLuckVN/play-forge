/**
 * Tiny Web Audio synthesiser. Sounds and music are generated, not loaded, so
 * games stay single-file and work offline.
 *
 * Signal path: sources → sfx / music bus → master → speakers.
 * Volume settings are shared by every game and remembered in localStorage.
 */

export interface Tone {
  /** Start frequency in Hz (for 'noise', the low-pass cutoff). */
  freq: number
  /** Slide to this frequency over the tone's duration. */
  to?: number
  /** Seconds. */
  dur: number
  wave?: OscillatorType | 'noise'
  /** 0..1, before the effects volume. */
  vol?: number
  /** Start offset in seconds, for building short phrases. */
  at?: number
}

export type Sound = Tone | Tone[]

export interface AudioSettings {
  /** 0..1 */
  music: number
  /** 0..1 */
  sfx: number
  muted: boolean
}

const SETTINGS_KEY = 'play-forge:audio'
const DEFAULTS: AudioSettings = { music: 0.45, sfx: 0.8, muted: false }

let ctx: AudioContext | null = null
let master: GainNode | null = null
let sfxBus: GainNode | null = null
let musicBus: GainNode | null = null
let settings = readSettings()
let unlocked = false
const settingsListeners = new Set<(s: AudioSettings) => void>()
const unlockListeners = new Set<() => void>()

function readSettings(): AudioSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}')
    const num = (v: unknown, d: number) => (typeof v === 'number' && v >= 0 && v <= 1 ? v : d)
    return {
      music: num(raw.music, DEFAULTS.music),
      sfx: num(raw.sfx, DEFAULTS.sfx),
      muted: raw.muted === true,
    }
  } catch {
    return { ...DEFAULTS }
  }
}

// Perceived loudness is roughly logarithmic; squaring makes sliders feel even.
const curve = (v: number) => v * v

function applyLevels() {
  if (!ctx || !master || !sfxBus || !musicBus) return
  const t = ctx.currentTime
  master.gain.setTargetAtTime(settings.muted ? 0 : 1, t, 0.03)
  sfxBus.gain.setTargetAtTime(curve(settings.sfx) * 0.5, t, 0.03)
  musicBus.gain.setTargetAtTime(curve(settings.music) * 0.35, t, 0.03)
}

/** The shared AudioContext, created on first use. Null if unsupported. */
export function audioContext(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null
  if (!ctx) {
    ctx = new AudioContext()
    master = ctx.createGain()
    sfxBus = ctx.createGain()
    musicBus = ctx.createGain()
    sfxBus.connect(master)
    musicBus.connect(master)
    master.connect(ctx.destination)
    applyLevels()
  }
  if (ctx.state === 'suspended' && unlocked) void ctx.resume()
  return ctx
}

/** Output node for music; null until audio exists. */
export function musicOutput(): GainNode | null {
  audioContext()
  return musicBus
}

export function isUnlocked(): boolean {
  return unlocked
}

/** Runs `fn` once audio is allowed (immediately if it already is). */
export function whenUnlocked(fn: () => void): void {
  if (unlocked) fn()
  else unlockListeners.add(fn)
}

// Browsers only allow audio after a user gesture; unlock on the first one.
if (typeof window !== 'undefined') {
  const unlock = () => {
    unlocked = true
    const ac = audioContext()
    void ac?.resume()
    window.removeEventListener('pointerdown', unlock, true)
    window.removeEventListener('keydown', unlock, true)
    unlockListeners.forEach((fn) => fn())
    unlockListeners.clear()
  }
  window.addEventListener('pointerdown', unlock, true)
  window.addEventListener('keydown', unlock, true)
}

let noiseBuffer: AudioBuffer | null = null
/** A looping white-noise source (shared buffer). */
export function noiseSource(ac: AudioContext): AudioBufferSourceNode {
  if (!noiseBuffer) {
    noiseBuffer = ac.createBuffer(1, ac.sampleRate, ac.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  }
  const src = ac.createBufferSource()
  src.buffer = noiseBuffer
  src.loop = true
  return src
}

export function playSound(sound: Sound, volume = 1): void {
  if (settings.muted || !unlocked) return
  const ac = audioContext()
  if (!ac || !sfxBus) return
  const now = ac.currentTime + 0.01
  for (const t of Array.isArray(sound) ? sound : [sound]) {
    const start = now + (t.at ?? 0)
    const end = start + t.dur
    const gain = ac.createGain()
    // Short attack and exponential release avoid clicks.
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, (t.vol ?? 0.6) * volume), start + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, end)
    gain.connect(sfxBus)
    let src: AudioScheduledSourceNode
    if (t.wave === 'noise') {
      const n = noiseSource(ac)
      const filter = ac.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.setValueAtTime(t.freq, start)
      if (t.to) filter.frequency.exponentialRampToValueAtTime(t.to, end)
      n.connect(filter).connect(gain)
      src = n
    } else {
      const osc = ac.createOscillator()
      osc.type = t.wave ?? 'square'
      osc.frequency.setValueAtTime(t.freq, start)
      if (t.to) osc.frequency.exponentialRampToValueAtTime(t.to, end)
      osc.connect(gain)
      src = osc
    }
    src.start(start)
    src.stop(end + 0.02)
  }
}

export function getAudioSettings(): AudioSettings {
  return { ...settings }
}

export function setAudioSettings(patch: Partial<AudioSettings>): void {
  settings = { ...settings, ...patch }
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // storage unavailable: settings still apply to this page
  }
  applyLevels()
  settingsListeners.forEach((l) => l({ ...settings }))
}

export function onAudioSettingsChange(listener: (s: AudioSettings) => void): () => void {
  settingsListeners.add(listener)
  return () => settingsListeners.delete(listener)
}

export const isMuted = () => settings.muted
export const setMuted = (muted: boolean) => setAudioSettings({ muted })

/** Shared interface sounds, so every game sounds like part of one set. */
export const UI_SOUNDS = {
  click: { freq: 520, to: 680, dur: 0.06, wave: 'triangle', vol: 0.35 },
  join: [
    { freq: 523, dur: 0.09, wave: 'triangle' },
    { freq: 784, dur: 0.14, wave: 'triangle', at: 0.08 },
  ],
  leave: [
    { freq: 523, dur: 0.09, wave: 'triangle' },
    { freq: 349, dur: 0.16, wave: 'triangle', at: 0.08 },
  ],
  ready: { freq: 660, to: 990, dur: 0.12, wave: 'triangle' },
  unready: { freq: 660, to: 440, dur: 0.12, wave: 'triangle', vol: 0.4 },
  tick: { freq: 440, dur: 0.12, wave: 'square', vol: 0.35 },
  go: { freq: 880, dur: 0.3, wave: 'square', vol: 0.4 },
  win: [
    { freq: 523, dur: 0.12, wave: 'square', vol: 0.4 },
    { freq: 659, dur: 0.12, wave: 'square', vol: 0.4, at: 0.11 },
    { freq: 784, dur: 0.12, wave: 'square', vol: 0.4, at: 0.22 },
    { freq: 1047, dur: 0.35, wave: 'square', vol: 0.4, at: 0.33 },
  ],
  lose: [
    { freq: 392, dur: 0.18, wave: 'triangle' },
    { freq: 330, dur: 0.18, wave: 'triangle', at: 0.16 },
    { freq: 262, dur: 0.4, wave: 'triangle', at: 0.32 },
  ],
  error: { freq: 220, to: 160, dur: 0.2, wave: 'sawtooth', vol: 0.3 },
} satisfies Record<string, Sound>
