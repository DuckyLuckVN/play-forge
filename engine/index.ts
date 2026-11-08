// Public API of the play-forge engine. Games import from '@forge'.
export { createGameApp, type GameAppOptions, type Outcome, type Scoreline, type SummaryRow } from './app'
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
export { bestScores, type BestScores } from './core/best'
export {
  bindGestures,
  GESTURE_IGNORE,
  GestureClassifier,
  type BindGestureOptions,
  type Gesture,
  type GestureHandlers,
  type GestureOptions,
  type Point,
} from './core/gesture'
export { bindInput, type Direction, type InputBindings } from './core/input'
export { startRenderLoop, startTicker } from './core/loop'
export { random, randomInt, randomSeed, type RngState } from './core/rng'
export { celebrate } from './fx/confetti'
export { Particles, type BurstOptions, type TextOptions } from './fx/particles'
export { Shake } from './fx/shake'
export { clamp, clamp01, damp, ease, lerp, prefersReducedMotion, progress } from './fx/tween'
export { ramp, telegraph, tierAt, withinWindow } from './reflex'
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
export { createOfflineTransport, randomId, type MediaChannel, type Transport } from './net/transport'
export { createTrysteroTransport } from './net/trystero'
export { createCanvas2D, type Canvas2D } from './render2d/canvas'
export { audioMenu } from './ui/audio-menu'
export { langMenu } from './ui/lang-menu'
export { h, icon, iconButton, setLabel, toast } from './ui/dom'
export {
  fullscreenButton,
  isFullscreen,
  isFullscreenSupported,
  onFullscreenChange,
  toggleFullscreen,
} from './ui/fullscreen'
export { popover, type Popover, type PopoverOptions } from './ui/popover'
export { icons } from './ui/icons'
export { applyTheme, FONT, PLAYER_COLORS, playerColor, theme } from './ui/theme'
