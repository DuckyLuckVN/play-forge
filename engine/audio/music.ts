import { audioContext, musicOutput, noiseSource, whenUnlocked } from './sound'

/**
 * Step-sequenced background music, synthesised live.
 *
 * A track is a few parts, each a space-separated list of steps:
 *   "C4"         play a note        "C4+E4+G4"  play a chord
 *   "-"          hold the last note "."         rest
 *   "x"          hit (drum parts)
 * Parts loop independently, so a 16-step drum loop can sit under a 32-step
 * melody.
 */
export type Instrument = 'bass' | 'pluck' | 'lead' | 'pad' | 'kick' | 'snare' | 'hat'

export interface Part {
  instrument: Instrument
  steps: string
  /** 0..1 mix level. Default 1. */
  vol?: number
}

export interface Track {
  name: string
  bpm: number
  /** Steps per beat: 2 = eighth notes, 4 = sixteenths. Default 2. */
  stepsPerBeat?: number
  parts: Part[]
}

interface ParsedStep {
  /** MIDI notes; empty for a drum hit. Null for rest or hold. */
  notes: number[] | null
  /** Length in steps, including following holds. */
  len: number
}

const NOTE = /^([A-G])(#|b)?(-?\d)$/
const SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

export function noteToMidi(name: string): number {
  const m = NOTE.exec(name)
  if (!m) throw new Error(`Bad note "${name}"`)
  const accidental = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0
  return 12 * (Number(m[3]) + 1) + SEMITONE[m[1]] + accidental
}

const midiToHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12)

export function parseSteps(steps: string): ParsedStep[] {
  const tokens = steps.trim().split(/\s+/)
  const out: ParsedStep[] = []
  let last: ParsedStep | null = null
  for (const token of tokens) {
    if (token === '-') {
      if (last) last.len++
      out.push({ notes: null, len: 0 })
    } else if (token === '.') {
      last = null
      out.push({ notes: null, len: 0 })
    } else {
      last = { notes: token === 'x' ? [] : token.split('+').map(noteToMidi), len: 1 }
      out.push(last)
    }
  }
  return out
}

// ---------- Instruments ----------

function voice(
  ac: AudioContext,
  out: AudioNode,
  inst: Instrument,
  midi: number,
  t: number,
  dur: number,
  vol: number,
) {
  const env = ac.createGain()
  env.connect(out)
  const hz = midiToHz(midi)
  const osc = (type: OscillatorType, freq: number, detune = 0) => {
    const o = ac.createOscillator()
    o.type = type
    o.frequency.value = freq
    o.detune.value = detune
    return o
  }
  const adsr = (peak: number, attack: number, release: number) => {
    env.gain.setValueAtTime(0.0001, t)
    env.gain.exponentialRampToValueAtTime(peak, t + attack)
    env.gain.setValueAtTime(peak, Math.max(t + attack, t + dur - release))
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  }

  switch (inst) {
    case 'bass': {
      const o = osc('triangle', hz)
      const f = ac.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.value = 900
      o.connect(f).connect(env)
      adsr(0.9 * vol, 0.01, Math.min(0.08, dur / 2))
      o.start(t)
      o.stop(t + dur + 0.05)
      break
    }
    case 'pluck': {
      const o = osc('square', hz)
      const f = ac.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.setValueAtTime(3200, t)
      f.frequency.exponentialRampToValueAtTime(500, t + 0.25)
      o.connect(f).connect(env)
      env.gain.setValueAtTime(0.0001, t)
      env.gain.exponentialRampToValueAtTime(0.35 * vol, t + 0.005)
      env.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.25, dur))
      o.start(t)
      o.stop(t + Math.max(0.25, dur) + 0.05)
      break
    }
    case 'lead': {
      const o = osc('square', hz)
      const vib = osc('sine', 5.5)
      const vibAmt = ac.createGain()
      vibAmt.gain.value = 6
      vib.connect(vibAmt).connect(o.detune)
      const f = ac.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.value = 2400
      o.connect(f).connect(env)
      adsr(0.22 * vol, 0.02, Math.min(0.1, dur / 2))
      o.start(t)
      vib.start(t)
      o.stop(t + dur + 0.05)
      vib.stop(t + dur + 0.05)
      break
    }
    case 'pad': {
      const f = ac.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.value = 1100
      f.connect(env)
      for (const d of [-8, 8]) {
        const o = osc('sawtooth', hz, d)
        o.connect(f)
        o.start(t)
        o.stop(t + dur + 0.05)
      }
      adsr(0.12 * vol, Math.min(0.4, dur / 3), Math.min(0.5, dur / 3))
      break
    }
  }
}

function drum(ac: AudioContext, out: AudioNode, inst: Instrument, t: number, vol: number) {
  const env = ac.createGain()
  env.connect(out)
  if (inst === 'kick') {
    const o = ac.createOscillator()
    o.frequency.setValueAtTime(140, t)
    o.frequency.exponentialRampToValueAtTime(42, t + 0.18)
    o.connect(env)
    env.gain.setValueAtTime(0.0001, t)
    env.gain.exponentialRampToValueAtTime(0.9 * vol, t + 0.005)
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.28)
    o.start(t)
    o.stop(t + 0.3)
    return
  }
  const n = noiseSource(ac)
  const f = ac.createBiquadFilter()
  const isHat = inst === 'hat'
  f.type = isHat ? 'highpass' : 'bandpass'
  f.frequency.value = isHat ? 7000 : 1800
  n.connect(f).connect(env)
  const len = isHat ? 0.04 : 0.14
  env.gain.setValueAtTime(0.0001, t)
  env.gain.exponentialRampToValueAtTime((isHat ? 0.18 : 0.4) * vol, t + 0.003)
  env.gain.exponentialRampToValueAtTime(0.0001, t + len)
  n.start(t)
  n.stop(t + len + 0.02)
}

// ---------- Player ----------

const LOOKAHEAD = 0.15 // seconds of audio scheduled ahead
const TICK_MS = 30

interface Playing {
  track: Track
  gain: GainNode
  timer: ReturnType<typeof setInterval>
}

let current: Playing | null = null
let wanted: Track | null = null

function start(track: Track) {
  const ac = audioContext()
  const out = musicOutput()
  if (!ac || !out) return
  const gain = ac.createGain()
  gain.gain.setValueAtTime(0.0001, ac.currentTime)
  gain.gain.exponentialRampToValueAtTime(1, ac.currentTime + 0.8)
  gain.connect(out)

  const parts = track.parts.map((p) => ({ ...p, parsed: parseSteps(p.steps) }))
  const stepDur = 60 / track.bpm / (track.stepsPerBeat ?? 2)
  let step = 0
  let nextTime = ac.currentTime + 0.05

  const timer = setInterval(() => {
    // Skip ahead rather than burst after the tab was throttled.
    if (nextTime < ac.currentTime - 0.2) nextTime = ac.currentTime + 0.05
    while (nextTime < ac.currentTime + LOOKAHEAD) {
      for (const p of parts) {
        const s = p.parsed[step % p.parsed.length]
        if (!s.notes) continue
        const vol = p.vol ?? 1
        if (s.notes.length === 0) drum(ac, gain, p.instrument, nextTime, vol)
        else for (const n of s.notes) voice(ac, gain, p.instrument, n, nextTime, s.len * stepDur, vol)
      }
      step++
      nextTime += stepDur
    }
  }, TICK_MS)

  current = { track, gain, timer }
}

function fadeOut(p: Playing) {
  const ac = audioContext()
  if (ac) {
    p.gain.gain.cancelScheduledValues(ac.currentTime)
    p.gain.gain.setTargetAtTime(0.0001, ac.currentTime, 0.2)
  }
  setTimeout(() => {
    clearInterval(p.timer)
    p.gain.disconnect()
  }, 1200)
}

/** Play a track, crossfading from the current one. Same track: no-op. */
export function playMusic(track: Track | null): void {
  wanted = track
  if (current?.track === track) return
  whenUnlocked(() => {
    if (wanted !== track || current?.track === track) return
    if (current) fadeOut(current)
    current = null
    if (track && !document.hidden) start(track)
  })
}

export function stopMusic(): void {
  playMusic(null)
}

// Silence music in background tabs; pick it back up when visible.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && current) {
      fadeOut(current)
      current = null
    } else if (!document.hidden && wanted && !current) {
      const track = wanted
      wanted = null
      playMusic(track)
    }
  })
}
