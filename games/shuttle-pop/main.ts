import { createGameApp, h, landscapeGuard, smoothState, type MountContext, type Session } from '@forge'
import { ARCADE } from '@forge/audio/tracks'
import { webglAvailable } from '@forge/render3d'
import './shuttle-pop.css'
import { diveAllowed, freeSwing, slideEnd, type Strike } from './ability'
import { prefs } from './prefs'
import { toWorld } from './court'
import { chargeOf } from './charge'
import { mountEmotes } from './emotes'
import { t } from './i18n'
import { AbilityChips, TouchPad } from './hud'
import { bindInput } from './input'
import { loadPreset, pickerStrip } from './picker'
import { GuestShuttle, type GuestView } from './guestshuttle'
import { GuestPredictor } from './predict'
import { RemoteTracks } from './remotes'
import { Court3D, type LocalSwing } from './render3d'
import { RenderClock } from './renderclock'
import { leaderboardOf, outcomeOf, scoreChips } from './results'
import {
  canAct,
  canCharge,
  canSwing,
  createState,
  gradesAtPress,
  seedPreset,
  shuttlePopGame,
  TAPPED,
  type SpInput,
  type SpState,
} from './sim'
import { swingTick } from './world'

/** Built and warmed while the menu shows, then reused by every match. */
let court: Court3D | null = null
/** This page's player id while it hosts (setup runs on the host only, after mount). */
let hostId: string | null = null
async function preload(): Promise<void> {
  if (!webglAvailable()) return
  const view = new Court3D()
  await view.warm()
  court = view
}

function mount(session: Session<SpState, SpInput>, stage: HTMLElement, ctx: MountContext): () => void {
  if (!court) {
    const note = h('p', { class: 'sp-nogl', textContent: t('Shuttle Pop needs WebGL to run.') })
    stage.append(note)
    return () => note.remove()
  }
  hostId = session.isHost ? session.selfId : null
  const smooth = smoothState(session)
  let onSwing: ((what: LocalSwing) => void) | null = null
  // sendInput drops inputs during the countdown and while paused.
  const live = () => session.phase === 'playing' && !session.lobby.paused
  // Online guests predict their own player (the host and vs-computer already see their state at once).
  const predictor = session.isHost || session.offline ? null : new GuestPredictor()
  // ...and draw the shuttle (and the other players) from a smooth clock + deterministic flight, so jitter never rubber-bands it.
  const guest: GuestView | null =
    session.isHost || session.offline
      ? null
      : (() => {
          const clock = new RenderClock(session.tickRate)
          return { clock, shuttle: new GuestShuttle(clock), remotes: new RemoteTracks(clock) }
        })()
  const detach = court.attach(stage, smooth, session.selfId, (cb) => (onSwing = cb), predictor, live, guest)
  court.surface.setAttribute('role', 'img')
  court.surface.setAttribute('aria-label', t('Badminton court'))
  // Online only: hold T / tap the button to send an emoji; bubbles show over the sender's chibi.
  const offEmotes = mountEmotes(court.surface, session, ctx.reactions, court)

  // The last state's view of our seat: may it charge (rally / own serve), would a swing count (also off
  // cooldown)? Else the sim ignores it. The predictor's stun lock (the newest host report) also refuses.
  const seatCan = (can: typeof canSwing) => {
    if (predictor?.stunned) return false
    const s = smooth.curr
    const me = s?.players.find((p) => p.id === session.selfId)
    return !!s && !!me && can(s, me)
  }
  // Online guests show their own hit at once (GuestShuttle.predictHit, the sim's contact rules): the
  // held press (its screen tick + local time, for the charge and the tap rules) and the move last sent.
  let press: { tick: number | undefined; ms: number } | null = null
  const moved = { x: 0, z: 0 }
  const predictHit = (
    held: { x: number; z: number },
    tap: boolean,
    charge: number,
    pressTick?: number,
    act?: Strike,
    from?: { x: number; z: number },
  ) => {
    const me = smooth.curr?.players.find((p) => p.id === session.selfId)
    if (!guest || !predictor || !me) return
    // A swing in our free Jump / Dive's window strikes with that move's box and shot (sim contactFor):
    // the host's hit is shown when it comes instead of a plain-reach guess.
    if (!act && freeSwing(predictor.act, predictor.stepNow)) return
    const player = from ?? { x: predictor.x, z: predictor.z }
    // Heard at once; the host's answering hit is then skipped (Court3D's echo).
    if (
      !guest.shuttle.predictHit({
        side: me.side,
        id: session.selfId,
        held,
        charge,
        player,
        tap,
        pressTick,
        act,
      })
    )
      return
    const hit = guest.shuttle.predicted()
    if (hit) court?.ownHitPredicted(hit)
  }
  const send = (sent: SpInput) => {
    // The Jump / Dive buttons also swing by themselves when the player turned Auto swing on (prefs.ts).
    const input: SpInput =
      sent.t === 'ability' && sent.k && prefs.get().autoSwing ? { ...sent, auto: true } : sent
    // Animate our own swing button this frame (not when the session or the sim would drop it); the
    // prediction slows with the charge and moves with exactly the moves the host gets.
    if (input.t === 'charge') {
      if (input.cancel) {
        press = null
        predictor?.setCharging(false)
        onSwing?.('cancel')
      } else if (live() && seatCan((s, me) => canCharge(s, me) && me.chargeAt !== TAPPED)) {
        // (A press already swung as a tap waits for its button-up: e.g. a resync while still held.)
        predictor?.setCharging(true)
        onSwing?.('charge')
        // A fresh press may swing at once as a tap (sim tapOnPress); a repeat press keeps the first.
        if (!press) {
          press = { tick: input.tick, ms: performance.now() }
          if (seatCan((s, me) => canSwing(s, me) && me.chargeAt === -1)) predictHit({ ...moved }, true, 0)
        }
      } else return // the host would ignore it: don't send (no slow-down disagreement with the prediction)
    } else if (input.t === 'swing') {
      // A press that already swung as a tap (sim tapOnPress): its button-up is no second swing.
      const counts = live() && seatCan((s, me) => canSwing(s, me) && me.chargeAt !== TAPPED)
      // A counted rally swing after a full hold also slows the run for a moment (sim recoverUntil).
      predictor?.release(counts && smooth.curr?.phase === 'rally')
      onSwing?.(counts ? 'swing' : 'cancel')
      if (counts) {
        // The hold is the charge (the sim counts it in arrival ticks); a short tap is graded at its press.
        const ticks = press ? ((performance.now() - press.ms) / 1000) * session.tickRate : 0
        const charge = chargeOf(ticks)
        const atPress = press && gradesAtPress(ticks, charge) ? press.tick : undefined
        predictHit({ x: input.x, z: input.z }, false, charge, atPress)
      }
      press = null
    } else if (input.t === 'ability') {
      // The host would ignore a press that can't act (locked, cooling, charging): don't send it.
      if (!live() || !seatCan((s, me) => canAct(s, me, input.k))) return
      // A Dive while moving backward: the host ignores it (sim step).
      if (input.k === 'lunge' && smooth.curr?.phase === 'rally' && !diveAllowed(input)) return
      const me = smooth.curr?.players.find((p) => p.id === session.selfId)
      if (guest && predictor && me) {
        // Same pick as the host (ability.ts) on the flight shown: the body leaps / dives now, a strike also
        // shows its hit. Jump / Dive buttons force the move (a rally only, like the host); a dive goes the held way.
        const at = { x: predictor.x, z: predictor.z }
        const want = smooth.curr?.phase === 'rally' ? input.k : undefined
        const dir = input.x || input.z ? toWorld(me.side, input.x, input.z) : undefined
        const pick = guest.shuttle.pickAbility(at, me.side, seatCan(canSwing), want, dir, input.auto === true)
        predictor.startAct(pick.k, pick.dx, pick.dz, !!pick.empty, !!pick.free)
        // Heard and seen at once; the host's answering `act` event then stays silent (Court3D).
        court?.ownActPredicted(pick.k)
        if (pick.k !== 'hop' && !pick.empty && !pick.free) {
          // A lunge reaches from its slide end (sim contactFor).
          const from = pick.k === 'lunge' ? slideEnd(at, pick.dx, pick.dz) : undefined
          predictHit({ x: input.x, z: input.z }, false, 0, input.tick, pick.k, from)
        }
      }
    } else if (input.t === 'move' && live()) {
      moved.x = input.x
      moved.z = input.z
      predictor?.setMove(input.x, input.z)
    }
    session.sendInput(input)
  }
  // Touch: floating stick (left) + swing button (bottom-right), over the court.
  const pad = new TouchPad()
  // Desktop chips (Jump [Space] / Dive [Shift]) after the pad: CSS hides them while the touch controls show.
  const chips = new AbilityChips()
  court.surface.append(pad.root, chips.root)
  // The buttons' cooldown follows the local player's (Court3D draws the same on its feet ring).
  court.onCooldown = (cd, sec) => {
    pad.setAbility(cd, sec)
    chips.set(cd, sec)
  }
  // Every human swing carries the tick on screen (the host rewinds up to MAX_REWIND): a guest's covers
  // its lag, the host's own its interpolation (0–1 ticks), so both sides get screen-aligned timing.
  // A guest's is the tick of the shuttle it sees (RenderClock), the same meaning as swingTick.
  const seen = () =>
    guest ? guest.clock.seenTick() : smooth.curr ? swingTick(smooth.curr.tick, smooth.alpha()) : undefined
  const input = bindInput(court.surface, send, seen, pad)
  // Our character on every play start (inputs are dropped before). The host's look is already seeded
  // in setup; a guest's shows from "Go!". Idempotent, so resumes may resend it.
  const pick = () => session.sendInput({ t: 'pick', preset: loadPreset() })
  // Phones play in landscape. Upright: the rotate card covers the court and held controls let go;
  // vs the computer also pauses (like a hidden tab: Resume from the pause screen after rotating).
  // Online play can't pause, so it keeps running under the card.
  // Only during a match: the room lobby and the results stay usable upright.
  let portrait = false
  // A microtask later: at "Go!" the session emits 'playing' before it starts its ticker, so a
  // pause from inside that lobby event would be undone by the ticker starting after it.
  // TODO(engine): Session.start()/runCountdown() call setPhase('playing') (which emits 'lobby') and
  // only then startSimulation(), which starts the ticker without checking lobby.paused. A
  // setPaused(true) from a lobby listener at "Go!" therefore leaves the lobby paused but the sim
  // running. Fix in engine/net/session.ts (start the ticker before announcing 'playing', or have
  // startSimulation honour `paused`), add a session regression test, then drop this microtask.
  // Not changed here: reordering Session touches every game.
  const pauseIfUpright = () =>
    queueMicrotask(() => {
      if (portrait && session.offline && live()) session.setPaused(true)
    })
  let offGuard: (() => void) | null = null
  const guardMatch = () => {
    const inMatch = session.phase === 'countdown' || session.phase === 'playing'
    if (inMatch && !offGuard) {
      offGuard = landscapeGuard(stage, (upright) => {
        portrait = upright
        if (!upright) return
        input.release()
        pauseIfUpright()
      })
    } else if (!inMatch && offGuard) {
      offGuard()
      offGuard = null
      portrait = false
    }
  }
  guardMatch()
  // While playing, the stage takes every touch (no page scroll / pinch zoom around the court).
  stage.classList.toggle('sp-playing', live())
  const noPinch = (e: Event) => {
    if (live()) e.preventDefault()
  }
  // iOS Safari pinch-zooms despite touch-action; its gesture events must be cancelled (non-passive).
  document.addEventListener('gesturestart', noPinch, { passive: false })
  // Play starting or resuming: re-send the held keys (a key held through "Go!" moves you, one let
  // go during a pause stops you) and our character.
  let wasLive = live()
  if (wasLive) pick()
  const offLobby = session.on('lobby', () => {
    guardMatch()
    // Countdown ended (or resumed) while upright: straight back to paused.
    pauseIfUpright()
    const now = live()
    stage.classList.toggle('sp-playing', now)
    if (now && !wasLive) {
      input.resync()
      pick()
    }
    // Paused or over: drop the stick and the button (a finger held through the pause can't stick).
    if (!now && wasLive) input.release()
    wasLive = now
  })
  return () => {
    hostId = null
    offLobby()
    offGuard?.()
    document.removeEventListener('gesturestart', noPinch)
    stage.classList.remove('sp-playing')
    input.stop()
    if (court) court.onCooldown = null
    pad.root.remove()
    offEmotes()
    detach()
    smooth.dispose()
  }
}

createGameApp<SpState, SpInput>({
  // The host's stored look is in the state from the countdown on (no pop at "Go!").
  def: {
    ...shuttlePopGame,
    setup(players, seed, options) {
      const state = createState(players, seed, options)
      if (hostId) seedPreset(state, hostId, loadPreset())
      return state
    },
  },
  title: 'Shuttle Pop',
  // Same line as the launcher card.
  tagline: t(
    'Chibi badminton. Time your swing for a Perfect, smash on high balls. Play the computer or a friend online.',
  ),
  // Desktop rows (keys / mouse) and touch rows (stick / racket button); each device sees its own.
  guide: [
    {
      action: t('Move'),
      keys: [['W', 'A', 'S', 'D']],
      touch: 'dragLeft',
      touchLabel: t('left side'),
    },
    {
      action: t('Swing'),
      note: t('Tap for a quick swing'),
      mouse: 'click',
      touch: 'button',
    },
    {
      action: t('Power shot'),
      note: t(
        'Let go to hit. You move slower while charging, and much slower for a moment after a full-power swing.',
      ),
      hold: true,
      mouse: 'hold',
      touch: 'button',
    },
    {
      action: t('Jump'),
      note: t(
        'Jump, then swing in the air to smash a high shuttle. Jump and Dive share a cooldown; each Perfect hit cuts it by 0.2 s. (Auto swing: view settings.)',
      ),
      keys: [['Space']],
      touch: 'button',
      touchLabel: t('jump button'),
    },
    {
      action: t('Dive'),
      note: t(
        'Slide far the way you are moving (not backward), then swing to save a far, low shuttle. Works while charging too. You run slower for a moment after.',
      ),
      keys: [['Shift']],
      mouse: 'right',
      touch: 'button',
      touchLabel: t('dive button'),
    },
    {
      action: t('Reactions'),
      note: t('Online: move toward an emoji, let go to send'),
      hold: true,
      keys: [['T']],
      touch: 'button',
      touchLabel: t('emoji button'),
    },
    { action: t('Smash or drive'), note: t('as you swing'), hold: true, keys: [['W']] },
    { action: t('Clear (high and deep)'), note: t('as you swing'), hold: true, keys: [['S']] },
    {
      action: t('Aim left or right'),
      note: t('as you swing'),
      hold: true,
      keys: [['A', 'D']],
    },
    {
      action: t('Drop shot'),
      note: t('Swing with no direction held'),
      mouse: 'click',
    },
    {
      action: t('Pick the shot'),
      note: t('Stick forward: smash or drive. Back: clear. Sideways: aim. Centred: drop.'),
      touch: 'drag',
    },
  ],
  // Stock upbeat gameplay loop.
  music: ARCADE,
  preload,
  mount,
  menuExtras: pickerStrip,
  roomExtras: pickerStrip,
  // Humans' chips plus a computer chip for a side with no human (robot avatar, its seat's colour slot);
  // `name` labels the computer's chip, translated at display time (lobby players keep their lobby name).
  scores: scoreChips,
  outcome: outcomeOf,
  leaderboard: leaderboardOf,
  // Esc only: P (and J / K / arrows) are not bound in Shuttle Pop.
  pauseKeys: ['Escape'],
})
