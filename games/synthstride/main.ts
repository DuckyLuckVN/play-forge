import { formatNumber } from '@forge/core/i18n'
import {
  bestScores,
  bindGestures,
  bindInput,
  createGameApp,
  playerColor,
  playSound,
  smoothState,
  startRenderLoop,
} from '@forge'
import { runChange, TickClock } from '@forge/net/clock'
import type { Session } from '@forge/net/session'
import { skillRingHit } from '@forge/reflex/hud2d'
import './synthstride.css'
import { calibrationRow, loadOffset, offsetTicks } from './calibrate'
import { stepFrom, stepToward, type Step } from './grid'
import { t } from './i18n'
import { Moments } from './moments'
import { createView, HEIGHT, tileAtPoint, WIDTH, type StrideView } from './render'
import {
  alive,
  beatTicks,
  dancerOf,
  displayScore,
  openHoles,
  overdriveActive,
  ranking,
  rateAt,
  synthstride,
  TICK_RATE,
  type Rating,
  type StrideInput,
  type StrideState,
} from './sim'
import { beatSound, delayed, eventSound, moveSound, STRIDE_SOUNDS } from './sounds'
import { summaryRows } from './stats'

/** Best score per tempo (chill / normal / hyper), from solo runs only. */
const best = bestScores('synthstride')
let newBest = false

/** Beats are scheduled this far ahead on the local clock… */
const LOOKAHEAD_MS = 120
/** …and this much after the host's tick, to sit with what you see. */
const BUFFER_MS = 20

/**
 * Touch / mouse: tap a tile to step toward it (on press, for timing); swipe
 * from off the board for one step; tap the ring for Overdrive. A press on the
 * board never also counts as a swipe, so you can't double-step.
 */
function bindPointer(
  view: StrideView,
  target: () => { pos: number; n: number } | null,
  step: (dir: Step) => void,
  overdrive: () => void,
): () => void {
  return bindGestures(
    {
      onPress: (pt) => {
        const { x, y } = view.point(pt.x, pt.y)
        if (skillRingHit(x, y, WIDTH, HEIGHT)) {
          overdrive()
          return true
        }
        const me = target()
        const tile = me ? tileAtPoint(x, y, me.n) : null
        if (!me || tile === null) return false
        const dir = stepToward(me.pos, tile, me.n)
        if (dir) step(dir)
        return true
      },
      onSwipe: step,
    },
    { target: view.surface },
  )
}

function mount(session: Session<StrideState, StrideInput>, stage: HTMLElement): () => void {
  const selfId = session.selfId
  const nameOf = (id: string) => session.lobby.players.find((p) => p.id === id)?.name ?? '?'
  const smooth = smoothState(session)
  const clock = new TickClock(TICK_RATE)

  // Your moves not yet confirmed by the host, replayed on top of its position.
  let pending: { seq: number; dir: Step }[] = []
  let seq = 0
  let ratedBeat = -99
  let latest: StrideState | null = null
  let lastTick = -Infinity
  let scheduledBeat = -Infinity

  const me = () => (latest ? dancerOf(latest, selfId) : undefined)
  const predictedPos = (): number | null => {
    const d = me()
    if (!latest || !d || !pending.length) return null
    const b = latest.boards[d.board]
    const holes = new Set(openHoles(latest, b).flatMap((h) => h.tiles))
    let pos = d.pos
    for (const p of pending) {
      const to = stepFrom(pos, p.dir, b.n)
      if (!holes.has(to)) pos = to
    }
    return pos
  }

  const view = createView(
    stage,
    smooth,
    {
      tap: t('TAP'),
      rating: { perfect: t('PERFECT'), good: t('GOOD'), off: t('OFF BEAT') },
      out: t('OUT'),
    },
    { selfId, nameOf, colorOf: playerColor, predictedPos },
  )
  view.surface.setAttribute('role', 'img')
  view.surface.setAttribute('aria-label', t('Synthstride dance floor'))
  newBest = false
  const moments = new Moments(0, t, selfId, nameOf)

  /** A step: shown and heard at once, sent with the moment you pressed and a sequence number. */
  const playing = () => session.phase === 'playing' && !session.lobby.paused
  const step = (dir: Step) => {
    const d = me()
    if (!playing() || !latest || !d || !alive(d)) return
    const b = latest.boards[d.board]
    const from = predictedPos() ?? d.pos
    const to = stepFrom(from, dir, b.n)
    if (to === from || openHoles(latest, b).some((h) => h.tiles.includes(to))) return
    // Host ticks run one behind the state they label (a state for tick T is sent after stepping T − 1).
    const at = Math.max(0, clock.tickAt() - 1)
    seq++
    pending.push({ seq, dir })
    session.sendInput(`${dir}@${at.toFixed(1)}:${seq}` as StrideInput)
    // Predict the rating the host will give (same rule, same clock).
    const { rating: raw, beat } = rateAt(latest, latest.tick - 1, at - d.latency)
    let rating: Rating | null = raw
    if (raw !== 'off') {
      if (beat === ratedBeat) rating = null
      else ratedBeat = beat
    }
    view.localMove(from, to, rating)
    const sound = moveSound(to, rating, latest.beat)
    if (sound) playSound(sound)
  }
  const overdrive = () => {
    if (playing()) session.sendInput('overdrive')
  }

  const offState = session.on('state', (s) => {
    const change = runChange(lastTick, s.tick)
    if (change === 'stale') return // arrived out of order: we already have newer
    if (change === 'new') {
      // A run (re)started: reset local prediction, send this browser's timing offset, load the best for this tempo.
      pending = []
      seq = 0
      ratedBeat = -99
      scheduledBeat = -Infinity
      session.sendInput(`lat${offsetTicks(loadOffset())}`)
      moments.setBest(s.dancers.length === 1 ? best.load(s.tempo) : 0)
    }
    lastTick = s.tick
    latest = s
    clock.observe(s.tick)
    const d = dancerOf(s, selfId)
    if (d) pending = pending.filter((p) => p.seq > d.seq)
    view.onState(s)
    for (const e of s.events) {
      const sound = eventSound(e, s, selfId)
      if (sound) playSound(sound)
      if (e.type === 'over' && s.dancers.length === 1 && d) {
        newBest = best.save(displayScore(d), s.tempo)
        moments.setBest(best.load(s.tempo))
      }
    }
    for (const m of moments.update(s)) {
      view.banner(m)
      if (m.big) playSound(STRIDE_SOUNDS.fanfare)
    }
  })

  /** The soundtrack: each beat scheduled a little ahead on the local clock, so it never wobbles. */
  const scheduleBeat = () => {
    const s = latest
    if (!s || s.endAt !== null || s.over || !clock.fresh() || session.lobby.paused) return
    const next = s.beat + 1
    if (next <= scheduledBeat) return
    const exact = s.tick - 1 + (1 - s.phase) * beatTicks(s)
    const lead = clock.timeOf(exact + 1) + BUFFER_MS - performance.now()
    if (lead > LOOKAHEAD_MS) return
    scheduledBeat = next
    if (lead < -(30_000 / s.bpm)) return // more than half a beat late (a stall): skip, don't stutter
    const d = dancerOf(s, selfId)
    const board = s.boards[d?.board ?? 0]
    const mix = {
      bpm: s.bpm,
      tier: s.tier,
      overdrive: !!d && overdriveActive(s, d),
      strikeNext: board.strikes.some((k) => k.beat === next + 1),
    }
    playSound(delayed(beatSound(next, mix), lead / 1000))
  }

  const keyStep = (dir: Step) => () => step(dir)
  const keys: Record<string, () => void> = {
    ArrowUp: keyStep('up'),
    KeyW: keyStep('up'),
    ArrowDown: keyStep('down'),
    KeyS: keyStep('down'),
    ArrowLeft: keyStep('left'),
    KeyA: keyStep('left'),
    ArrowRight: keyStep('right'),
    KeyD: keyStep('right'),
    Space: overdrive,
  }
  const stopKeys = bindInput<string>(
    { keys: Object.fromEntries(Object.keys(keys).map((k) => [k, k])) },
    (code) => keys[code]?.(),
  )
  const stopPointer = bindPointer(
    view,
    () => {
      const d = me()
      return latest && d ? { pos: predictedPos() ?? d.pos, n: latest.boards[d.board].n } : null
    },
    step,
    overdrive,
  )
  const stopRender = startRenderLoop((dt) => {
    scheduleBeat()
    view.frame(dt)
  })
  return () => {
    offState()
    smooth.dispose()
    stopKeys()
    stopPointer()
    stopRender()
    view.destroy()
  }
}

createGameApp<StrideState, StrideInput>({
  def: synthstride,
  title: 'Synthstride',
  tagline: t('Step to the beat. Dodge what lands on it.'),
  guide: [
    {
      action: t('Step'),
      note: t('Tap or swipe'),
      keys: [
        ['W', 'A', 'S', 'D'],
        ['Up', 'Left', 'Down', 'Right'],
      ],
      touch: 'swipe',
    },
    { action: t('🥁 Step on the beat'), note: t('Points + groove'), tip: true },
    { action: t('⚠️ Dashed → striped → strike'), note: t('◐ = between beats'), tip: true },
    { action: t('🎵 Collect notes in order'), tip: true },
    { action: t('⚡ Overdrive'), keys: [['Space']], touch: 'tap', touchLabel: t('the ring') },
  ],
  // The soundtrack is played from the game's own beat clock (see scheduleBeat).
  music: null,
  mount,
  menuExtras: () => calibrationRow(t),
  ranking: true,
  scores: (s) => s.dancers.map((d) => ({ id: d.id, score: displayScore(d), out: d.diedAt !== null })),
  outcome(s, selfId) {
    const d = dancerOf(s, selfId)
    if (!d) return { headline: t('Match over'), result: 'done' }
    const score = formatNumber(displayScore(d))
    if (s.dancers.length === 1) {
      if (newBest) return { headline: t('New best! {score} points', { score }), result: 'win' }
      return {
        headline: t('{score} points. Your best: {best}', {
          score,
          best: formatNumber(best.load(s.tempo)),
        }),
        result: 'done',
      }
    }
    const rank = ranking(s).indexOf(d) + 1
    if (rank === 1) return { headline: t('You win! {score} points', { score }), result: 'win' }
    return {
      headline: t('#{rank} of {n} · {score} points', { rank, n: s.dancers.length, score }),
      result: 'lose',
    }
  },
  summary: (s, selfId) => summaryRows(s, t, selfId),
})
