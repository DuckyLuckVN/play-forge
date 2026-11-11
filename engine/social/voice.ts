import { audioContext, setMusicDuck } from '../audio/sound'
import { Emitter } from '../core/emitter'
import type { MediaChannel, Transport } from '../net/transport'
import {
  clampPlayerVolume,
  loadVoiceSettings,
  parseAnnounce,
  saveVoiceSettings,
  SpeakingDetector,
  transmitting,
  VoiceRoster,
  type VoiceAnnounce,
  type VoiceMode,
  type VoicePeerState,
} from './voice-state'

const CHANNEL = 'vc'
const POLL_MS = 100
/** Music level while someone talks, so voices stay clear. */
const MUSIC_DUCK = 0.35

export type JoinResult = 'ok' | 'denied' | 'no-mic' | 'error'

/**
 * Microphone permission without asking for it. 'unknown' where the browser
 * can't tell (older Firefox / Safari throw on the 'microphone' name).
 */
export async function micPermission(): Promise<PermissionState | 'unknown'> {
  try {
    const status = await navigator.permissions.query({ name: 'microphone' as PermissionName })
    return status.state
  } catch {
    return 'unknown'
  }
}

interface Remote {
  stream: MediaStream
  /** Chrome only feeds remote WebRTC audio to Web Audio while an element plays it. */
  sink: HTMLAudioElement
  source: MediaStreamAudioSourceNode
  gain: GainNode
  analyser: AnalyserNode
  detector: SpeakingDetector
}

interface VoiceEvents {
  /** Joined/left, muted, mode, or someone else's voice status changed. */
  change: []
  speaking: [playerId: string, speaking: boolean]
}

/**
 * Voice chat for one room. Everyone hears whoever shares a microphone; you
 * share yours only after `join()` (which asks for permission). Muting and
 * push-to-talk switch the track off rather than renegotiating, so they are
 * instant. Volumes run through Web Audio, which allows a per-player boost.
 */
export class VoiceChat {
  /** Voice needs a media-capable transport and microphone access (https). */
  static supported(transport: Transport): transport is Transport & { media: MediaChannel } {
    return (
      !!transport.media &&
      typeof window !== 'undefined' &&
      window.isSecureContext &&
      !!navigator.mediaDevices?.getUserMedia
    )
  }

  private events = new Emitter<VoiceEvents>()
  private settings = loadVoiceSettings()
  private roster = new VoiceRoster()
  private remotes = new Map<string, Remote>()
  private playerVolumes = new Map<string, number>()
  private mutedPlayers = new Set<string>()
  private speakingNow = new Set<string>()
  private local: { stream: MediaStream; analyser: AnalyserNode; detector: SpeakingDetector } | null = null
  private bus: GainNode | null = null
  private holding = false
  private muted = false
  private joining = false
  private disposed = false
  private offs: (() => void)[] = []
  private timer: ReturnType<typeof setInterval>

  constructor(
    private transport: Transport & { media: MediaChannel },
    readonly selfId: string,
  ) {
    const t = transport
    this.offs.push(
      t.on(CHANNEL, (raw, peer) => {
        const a = parseAnnounce(raw)
        // Not filtered by the lobby: newcomers hear from peers before the
        // lobby arrives. The UI only shows players who are in the room.
        if (!a || a.p === selfId) return
        this.roster.set(peer, a)
        if (!a.mic) this.dropRemote(peer)
        this.applyGains()
        this.events.emit('change')
      }),
      t.media.onPeerStream((stream, peer) => this.addRemote(peer, stream)),
      t.onPeerJoin((peer) => {
        // Tell newcomers who we are, and give them our voice if we're in.
        t.send(CHANNEL, this.announce(), peer)
        if (this.local) t.media.addStream(this.local.stream, peer)
      }),
      t.onPeerLeave((peer) => {
        this.dropRemote(peer)
        this.roster.remove(peer)
        this.events.emit('change')
      }),
    )
    this.timer = setInterval(() => this.pollSpeaking(), POLL_MS)
  }

  // ---------- State ----------

  get joined(): boolean {
    return this.local !== null
  }
  get isMuted(): boolean {
    return this.muted
  }
  get mode(): VoiceMode {
    return this.settings.mode
  }
  get volume(): number {
    return this.settings.volume
  }
  /** Our mic is live right now. */
  get live(): boolean {
    return transmitting({ joined: this.joined, muted: this.muted, mode: this.mode, holding: this.holding })
  }
  /** Voice status of another player, if they announced one. */
  peerState(playerId: string): VoicePeerState | undefined {
    return this.roster.get(playerId)
  }
  isSpeaking(playerId: string): boolean {
    return this.speakingNow.has(playerId)
  }
  playerVolume(playerId: string): number {
    return this.playerVolumes.get(playerId) ?? 1
  }
  isPlayerMuted(playerId: string): boolean {
    return this.mutedPlayers.has(playerId)
  }

  on<K extends keyof VoiceEvents>(event: K, handler: (...args: VoiceEvents[K]) => void): () => void {
    return this.events.on(event, handler)
  }

  // ---------- Actions ----------

  /**
   * Share our microphone. Asks the browser for permission the first time.
   * `muted` starts with the mic off (rejoining after a reload).
   */
  async join(opts: { muted?: boolean } = {}): Promise<JoinResult> {
    if (this.local) return 'ok'
    if (this.joining || this.disposed) return 'error'
    this.joining = true
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      })
      if (this.disposed) {
        // Left the room while the browser was asking: don't keep the mic on.
        stream.getTracks().forEach((t) => t.stop())
        return 'error'
      }
      const ac = audioContext()
      const analyser = ac!.createAnalyser()
      analyser.fftSize = 512
      ac!.createMediaStreamSource(stream).connect(analyser)
      this.local = { stream, analyser, detector: new SpeakingDetector() }
      this.muted = opts.muted ?? false
      this.syncTrack()
      this.transport.media.addStream(stream)
      this.broadcast()
      return 'ok'
    } catch (e) {
      const name = (e as DOMException)?.name
      return name === 'NotAllowedError' || name === 'SecurityError'
        ? 'denied'
        : name === 'NotFoundError' || name === 'OverconstrainedError'
          ? 'no-mic'
          : 'error'
    } finally {
      this.joining = false
    }
  }

  /** Stop sharing our microphone (we still hear others). */
  leave(): void {
    if (!this.local) return
    this.transport.media.removeStream(this.local.stream)
    this.local.stream.getTracks().forEach((t) => t.stop())
    this.local = null
    this.holding = false
    this.setSpeaking(this.selfId, false)
    this.broadcast()
  }

  setMuted(muted: boolean): void {
    if (this.muted === muted) return
    this.muted = muted
    this.syncTrack()
    this.broadcast()
  }

  /** Push-to-talk: hold to talk. Ignored in open-mic mode. */
  setHolding(holding: boolean): void {
    if (this.holding === holding) return
    this.holding = holding
    this.syncTrack()
    this.events.emit('change')
  }

  setMode(mode: VoiceMode): void {
    if (this.settings.mode === mode) return
    this.settings = { ...this.settings, mode }
    saveVoiceSettings(this.settings)
    this.holding = false
    this.syncTrack()
    this.events.emit('change')
  }

  /** Everyone's voices, 0..1. */
  setVolume(volume: number): void {
    this.settings = { ...this.settings, volume: Math.max(0, Math.min(1, volume)) }
    saveVoiceSettings(this.settings)
    this.applyGains()
  }

  /** One player's voice, 0..PLAYER_VOLUME_MAX (1 = as sent). */
  setPlayerVolume(playerId: string, volume: number): void {
    this.playerVolumes.set(playerId, clampPlayerVolume(volume))
    this.applyGains()
  }

  setPlayerMuted(playerId: string, muted: boolean): void {
    if (muted) this.mutedPlayers.add(playerId)
    else this.mutedPlayers.delete(playerId)
    this.applyGains()
    this.events.emit('change')
  }

  dispose(): void {
    this.disposed = true
    this.leave()
    clearInterval(this.timer)
    this.offs.forEach((off) => off())
    for (const peer of [...this.remotes.keys()]) this.dropRemote(peer)
    this.bus?.disconnect()
    setMusicDuck(1)
    this.events.clear()
  }

  // ---------- Internals ----------

  private announce(): VoiceAnnounce {
    return { p: this.selfId, mic: this.joined, m: this.muted }
  }

  private broadcast() {
    this.transport.send(CHANNEL, this.announce())
    this.events.emit('change')
  }

  private syncTrack() {
    const live = this.live
    this.local?.stream.getAudioTracks().forEach((t) => (t.enabled = live))
  }

  private output(): GainNode | null {
    const ac = audioContext()
    if (!ac) return null
    if (!this.bus) {
      // Voice skips the game's master bus: "mute game sound" keeps voices.
      this.bus = ac.createGain()
      this.bus.connect(ac.destination)
      this.applyGains()
    }
    return this.bus
  }

  private addRemote(peer: string, stream: MediaStream) {
    this.dropRemote(peer)
    const ac = audioContext()
    const bus = this.output()
    if (!ac || !bus) return
    const sink = new Audio()
    sink.muted = true
    sink.srcObject = stream
    void sink.play().catch(() => {})
    const source = ac.createMediaStreamSource(stream)
    const gain = ac.createGain()
    const analyser = ac.createAnalyser()
    analyser.fftSize = 512
    source.connect(analyser)
    source.connect(gain).connect(bus)
    this.remotes.set(peer, { stream, sink, source, gain, analyser, detector: new SpeakingDetector() })
    this.applyGains()
  }

  private dropRemote(peer: string) {
    const r = this.remotes.get(peer)
    if (!r) return
    r.source.disconnect()
    r.gain.disconnect()
    r.sink.srcObject = null
    this.remotes.delete(peer)
    const player = this.roster.playerOf(peer)
    if (player) this.setSpeaking(player, false)
  }

  private applyGains() {
    const ac = audioContext()
    if (!ac) return
    const now = ac.currentTime
    this.bus?.gain.setTargetAtTime(this.settings.volume * this.settings.volume, now, 0.05)
    for (const [peer, r] of this.remotes) {
      const player = this.roster.playerOf(peer)
      const level = player ? (this.mutedPlayers.has(player) ? 0 : this.playerVolume(player)) : 1
      r.gain.gain.setTargetAtTime(level, now, 0.05)
    }
  }

  private buf = new Float32Array(512)
  private level(analyser: AnalyserNode): number {
    analyser.getFloatTimeDomainData(this.buf)
    let sum = 0
    for (const v of this.buf) sum += v * v
    return Math.sqrt(sum / this.buf.length)
  }

  private pollSpeaking() {
    const now = performance.now()
    if (this.local) {
      const loud = this.live && this.local.detector.update(this.level(this.local.analyser), now)
      this.setSpeaking(this.selfId, loud)
    }
    for (const [peer, r] of this.remotes) {
      const player = this.roster.playerOf(peer)
      if (!player) continue
      const audible = !this.mutedPlayers.has(player)
      this.setSpeaking(player, audible && r.detector.update(this.level(r.analyser), now))
    }
    // Duck the music while anyone else is talking.
    const others = [...this.speakingNow].some((id) => id !== this.selfId)
    setMusicDuck(others ? MUSIC_DUCK : 1)
  }

  private setSpeaking(playerId: string, speaking: boolean) {
    if (speaking === this.speakingNow.has(playerId)) return
    if (speaking) this.speakingNow.add(playerId)
    else this.speakingNow.delete(playerId)
    this.events.emit('speaking', playerId, speaking)
  }
}
