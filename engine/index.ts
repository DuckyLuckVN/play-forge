// Public API of the play-forge engine. Games import from '@forge'.
export { createGameApp, type GameAppOptions, type Outcome, type Scoreline } from './app'
export { playMusic, stopMusic, type Instrument, type Part, type Track } from './audio/music'
export {
  getAudioSettings,
  isMuted,
  onAudioSettingsChange,
  playSound,
  setAudioSettings,
  setMusicDuck,
  setMuted,
  UI_SOUNDS,
  type AudioSettings,
  type Sound,
  type Tone,
} from './audio/sound'
export { ARCADE, LOUNGE } from './audio/tracks'
export { Emitter } from './core/emitter'
export {
  detectLang,
  format,
  getLang,
  LANGS,
  setLang,
  translator,
  type Dictionary,
  type Lang,
  type Params,
} from './core/i18n'
export { bindInput, type Direction, type InputBindings } from './core/input'
export { startRenderLoop, startTicker } from './core/loop'
export { random, randomInt, randomSeed, type RngState } from './core/rng'
export { celebrate } from './fx/confetti'
export { Particles, type BurstOptions, type TextOptions } from './fx/particles'
export { Shake } from './fx/shake'
export { clamp, clamp01, damp, ease, lerp, prefersReducedMotion, progress } from './fx/tween'
export { createBroadcastTransport } from './net/broadcast'
export {
  Session,
  type GameDefinition,
  type InputEvent,
  type LobbyState,
  type Phase,
  type PlayerInfo,
  type RoomSnapshot,
  type SessionOptions,
} from './net/session'
export { smoothState, type Smoothed } from './net/smoothing'
export { createOfflineTransport, randomId, type Transport } from './net/transport'
export { createTrysteroTransport } from './net/trystero'
export { createCanvas2D, type Canvas2D } from './render2d/canvas'
export { audioMenu } from './ui/audio-menu'
export { h, icon, toast } from './ui/dom'
export { icons } from './ui/icons'
export { applyTheme, FONT, PLAYER_COLORS, playerColor, theme } from './ui/theme'
