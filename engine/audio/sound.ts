/**
 * Tiny Web Audio synthesiser. Sounds are generated, not loaded, so games stay
 * single-file and work offline. Mute state is shared by every game.
 */

export interface Tone {
  /** Start frequency in Hz. */
  freq: number
  /** Slide to this frequency over the tone's duration. */
  to?: number
  /** Seconds. */
  dur: number
  wave?: OscillatorType | 'noise'
  /** 0..1, before the master volume. */
  vol?: number
  /** Start offset in seconds, for building short phrases. */
  at?: number
}

export type Sound = Tone | Tone[]

const MUTE_KEY = 'play-forge:muted'
const MASTER = 0.35

let ctx: AudioContext | null = null
let master: GainNode | null = null
let muted = readMuted()
const listeners = new Set<(muted: boolean) => void>()

function readMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

function audio(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null
  if (!ctx) {
    ctx = new AudioContext()
    master = ctx.createGain()
    master.gain.value = muted ? 0 : MASTER
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

// Browsers only allow audio after a user gesture; warm up on the first one.
if (typeof window !== 'undefined') {
  const unlock = () => {
    audio()
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
  }
  window.addEventListener('pointerdown', unlock)
  window.addEventListener('keydown', unlock)
}

let noiseBuffer: AudioBuffer | null = null
function noise(ac: AudioContext) {
  if (!noiseBuffer) {
    noiseBuffer = ac.createBuffer(1, ac.sampleRate, ac.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  }
  const src = ac.createBufferSource()
  src.buffer = noiseBuffer
  return src
}

export function playSound(sound: Sound, volume = 1): void {
  if (muted) return
  const ac = audio()
  if (!ac || !master) return
  const now = ac.currentTime + 0.01
  for (const t of Array.isArray(sound) ? sound : [sound]) {
    const start = now + (t.at ?? 0)
    const end = start + t.dur
    const gain = ac.createGain()
    // Short attack and exponential release avoid clicks.
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime((t.vol ?? 0.6) * volume, start + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, end)
    gain.connect(master)
    let src: AudioScheduledSourceNode
    if (t.wave === 'noise') {
      const n = noise(ac)
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

export function isMuted(): boolean {
  return muted
}

export function setMuted(value: boolean): void {
  muted = value
  try {
    localStorage.setItem(MUTE_KEY, value ? '1' : '0')
  } catch {
    // storage unavailable: mute still applies for this page
  }
  if (master && ctx) master.gain.setTargetAtTime(value ? 0 : MASTER, ctx.currentTime, 0.02)
  listeners.forEach((l) => l(value))
}

export function onMutedChange(listener: (muted: boolean) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

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
