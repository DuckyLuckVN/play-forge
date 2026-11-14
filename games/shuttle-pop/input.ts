// Keyboard + mouse + touch (stick + swing button) → SpInput. Directions are view-relative (x = screen right, z = toward the net).
// `move` goes out only when the held direction changes, at most once per sim tick (a stick dragged at
// 120 Hz coalesces to the latest). The swing button is hold-to-charge: pressing it sends `charge`,
// letting go sends the swing at once with the held direction and the tick the player is looking at
// (a tap = a plain swing); losing the button any other way (blur, pointer cancel) cancels the charge.
import { knobOffset, quantise, STICK_RADIUS, StickTracker } from './joystick'
import type { Want } from './ability'
import { TICK_RATE, type SpInput } from './sim'

/** Least time between two `move` sends: one sim tick. */
export const MOVE_GAP_MS = 1000 / TICK_RATE

/** Time + a one-shot timer (injected so tests run on a manual clock). */
export interface InputClock {
  now(): number
  /** Run `fn` in `ms`; returns a cancel. */
  later(fn: () => void, ms: number): () => void
}

const realClock: InputClock = {
  now: () => performance.now(),
  later(fn, ms) {
    const id = setTimeout(fn, ms)
    return () => clearTimeout(id)
  },
}

/** WASD only (arrows, J, K are not bound: swing is the mouse / touch button). */
const DIRS: Record<string, readonly [number, number]> = {
  KeyW: [0, 1],
  KeyS: [0, -1],
  KeyA: [-1, 0],
  KeyD: [1, 0],
}
/** The Jump button (T = emoji and V = push-to-talk stay free). */
export const JUMP_KEYS = new Set(['Space'])
/** The Dive button (a right click too). */
export const DIVE_KEYS = new Set(['ShiftLeft', 'ShiftRight'])
/** Every ability key (Jump + Dive). */
export const ABILITY_KEYS = new Set([...JUMP_KEYS, ...DIVE_KEYS])

/** Held direction from the pressed key codes: each axis −1/0/1, normalised to length ≤ 1. */
export function heldDir(held: ReadonlySet<string>): { x: number; z: number } {
  let left = false
  let right = false
  let up = false
  let down = false
  for (const code of held) {
    const d = DIRS[code]
    if (!d) continue
    if (d[0] < 0) left = true
    if (d[0] > 0) right = true
    if (d[1] > 0) up = true
    if (d[1] < 0) down = true
  }
  const x = (right ? 1 : 0) - (left ? 1 : 0)
  const z = (up ? 1 : 0) - (down ? 1 : 0)
  const k = x && z ? Math.SQRT1_2 : 1
  return { x: x * k, z: z * k }
}

/** Clicking a button or link (the game view's own settings, the top bar), or a field, isn't a swing. */
const isUi = (t: EventTarget | null) =>
  t instanceof Element && !!t.closest('input, textarea, select, button, a, .pf-overlay')

/**
 * Keys typed into a field, or on a menu overlay (its focused buttons), aren't play. A top-bar button
 * keeps focus after a click (Network, …): keys there still play (like engine/core/input.ts).
 */
const isField = (t: EventTarget | null) =>
  t instanceof Element && !!t.closest('input, textarea, select, .pf-overlay')

/**
 * Held keys + the touch stick → inputs, DOM-free (one held direction for both: held keys win, else
 * the stick). `move` goes out when the held direction changes, at most once per MOVE_GAP_MS: a change
 * inside the gap waits for its end and sends the latest direction then. `resync()` re-sends
 * it, because the session drops inputs during the countdown and while paused (a key held through
 * "Go!" or let go during a pause would otherwise be lost).
 */
export class HeldKeys {
  private held = new Set<string>()
  private dir = { x: 0, z: 0 }
  private stickDir = { x: 0, z: 0 }
  /** The last move sent, and when. */
  private sentX = 0
  private sentZ = 0
  private sentAt = -Infinity
  private cancelFlush: (() => void) | null = null
  /** The swing button source charging now ('Space', 'mouse', 'touch'…), null = none. */
  private chargeSrc: string | null = null

  /** `nowTick` = the swing's tick (undefined = none yet: judged now, no rewind). */
  constructor(
    private send: (i: SpInput) => void,
    private nowTick: () => number | undefined,
    private clock: InputClock = realClock,
  ) {}

  /** True when the key is a direction (the caller then stops its default). */
  press(code: string): boolean {
    if (!DIRS[code]) return false
    this.held.add(code)
    this.update()
    return true
  }

  release(code: string): void {
    if (this.held.delete(code)) this.update()
  }

  /** The touch stick's direction (length clamped to 1, snapped to 0.05 steps). */
  stick(x: number, z: number): void {
    const len = Math.hypot(x, z)
    const k = len > 1 ? 1 / len : 1
    this.stickDir = quantise({ x: x * k, z: z * k })
    this.update()
  }

  /** Let go of everything, stick and swing button included (window blur / leaving play: no keyup will come). */
  clear(): void {
    this.held.clear()
    this.stickDir = { x: 0, z: 0 }
    this.cancelSwing()
    this.update()
  }

  /** A swing button is held (charging). */
  get charging(): boolean {
    return this.chargeSrc !== null
  }

  /** Swing button `src` went down: start charging. False = ignored (another button is already held). */
  swingDown(src: string): boolean {
    if (this.chargeSrc !== null) return false
    this.chargeSrc = src
    this.sendPress()
    return true
  }

  /** Swing button `src` came up: swing (the hold so far is the charge). False = not the held one. */
  swingUp(src: string): boolean {
    if (this.chargeSrc !== src) return false
    this.chargeSrc = null
    this.swing()
    return true
  }

  /** The held swing button (only `src`'s, when given) was lost without a release: stop charging, no swing. */
  cancelSwing(src?: string): void {
    if (this.chargeSrc === null || (src !== undefined && src !== this.chargeSrc)) return
    this.chargeSrc = null
    this.send({ t: 'charge', cancel: true })
  }

  swing(): void {
    const tick = this.nowTick()
    this.send(
      tick === undefined
        ? { t: 'swing', x: this.dir.x, z: this.dir.z }
        : { t: 'swing', x: this.dir.x, z: this.dir.z, tick },
    )
  }

  /**
   * An ability press with the held direction and the tick on screen. `k` = the Jump / Dive button's move
   * (a dive goes the held way); none = the sim picks (jump / lunge / hop).
   */
  ability(k?: Want): void {
    const tick = this.nowTick()
    const input: Extract<SpInput, { t: 'ability' }> = { t: 'ability', x: this.dir.x, z: this.dir.z }
    if (tick !== undefined) input.tick = tick
    if (k) input.k = k
    this.send(input)
  }

  /** Send the held direction again now (stop when nothing is held). */
  resync(): void {
    this.sendMove()
    // The swing button too: a press made, or a let-go lost, while inputs were dropped (paused).
    if (this.chargeSrc !== null) this.sendPress()
    else this.send({ t: 'charge', cancel: true })
  }

  /** The press, with the tick on screen (a tap is graded at it). */
  private sendPress() {
    const tick = this.nowTick()
    this.send(tick === undefined ? { t: 'charge' } : { t: 'charge', tick })
  }

  private sendMove() {
    this.cancel()
    this.sentX = this.dir.x
    this.sentZ = this.dir.z
    this.sentAt = this.clock.now()
    this.send({ t: 'move', x: this.dir.x, z: this.dir.z })
  }

  /** Drop a coalesced move that hasn't gone out (unbinding). */
  dispose(): void {
    this.cancel()
  }

  private cancel() {
    this.cancelFlush?.()
    this.cancelFlush = null
  }

  private update() {
    const keys = heldDir(this.held)
    const next = keys.x || keys.z ? keys : this.stickDir
    if (next.x === this.dir.x && next.z === this.dir.z) return
    this.dir = next
    if (this.cancelFlush) return // the pending flush sends the latest
    const wait = this.sentAt + MOVE_GAP_MS - this.clock.now()
    if (wait <= 0) this.sendMove()
    else this.cancelFlush = this.clock.later(() => this.flush(), wait)
  }

  private flush() {
    this.cancelFlush = null
    if (this.dir.x !== this.sentX || this.dir.z !== this.sentZ) this.sendMove()
  }
}

export interface InputBinding {
  /** Re-send the held direction (call when play starts or resumes). */
  resync(): void
  /** Let go of every key, the stick and the swing button (play paused or over: no stuck stick). */
  release(): void
  stop(): void
}

/** Draws the touch controls (hud.ts `TouchPad`); coordinates are px in the target. */
export interface TouchView {
  readonly swingEl: HTMLElement
  /** Touch presses on this are the Jump button. */
  readonly actEl: HTMLElement
  /** Touch presses on this are the Dive button (optional: a pad without it only jumps). */
  readonly diveEl?: HTMLElement
  enable(): void
  showStick(x: number, y: number): void
  moveKnob(dx: number, dy: number): void
  hideStick(): void
  setPressed(on: boolean): void
  /** The Jump button is held (squash). */
  setAct(on: boolean): void
  /** The Dive button is held (squash). */
  setDive?(on: boolean): void
}

/** Touches starting in this share of the view's width (from the left) grab the stick. */
const STICK_ZONE = 0.45

/**
 * WASD / arrows move; J or a left click on `target` is the swing button (hold to charge, let go to
 * swing); Space or K jumps, Shift or a right click dives (one press each). With a `pad`, touches on the
 * left of `target` drive a floating stick and the pad's buttons swing / jump / dive (all at once: each
 * finger is tracked by pointer id). `nowTick` = the swing's tick (world.ts swingTick; undefined before a
 * state).
 */
export function bindInput(
  target: HTMLElement,
  send: (i: SpInput) => void,
  nowTick: () => number | undefined,
  pad?: TouchView,
): InputBinding {
  const keys = new HeldKeys(send, nowTick)
  const stick = new StickTracker(STICK_RADIUS)
  let swingPointer: number | null = null
  let actPointer: number | null = null
  let divePointer: number | null = null
  const onDown = (e: KeyboardEvent) => {
    if (isField(e.target)) return
    if (ABILITY_KEYS.has(e.code)) {
      // Space would scroll the page.
      e.preventDefault()
      if (!e.repeat) keys.ability(JUMP_KEYS.has(e.code) ? 'jump' : 'lunge')
    } else if (keys.press(e.code)) e.preventDefault()
  }
  const onUp = (e: KeyboardEvent) => {
    // Firefox clicks a focused button on Space's keyup: a jump must not also open the top-bar panel.
    if (ABILITY_KEYS.has(e.code) && !isField(e.target)) e.preventDefault()
    keys.release(e.code)
  }
  const letGo = () => {
    stick.cancel()
    swingPointer = null
    actPointer = null
    divePointer = null
    keys.clear()
    pad?.hideStick()
    pad?.setPressed(false)
    pad?.setAct(false)
    pad?.setDive?.(false)
  }
  const onPointer = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') {
      if (isUi(e.target)) return
      // The press's preventDefault keeps focus where it was: take it back from a top-bar button.
      const focused = document.activeElement
      if (focused instanceof HTMLElement && !target.contains(focused)) focused.blur()
      if (e.button === 2) {
        e.preventDefault()
        keys.ability('lunge')
        return
      }
      if (e.button !== 0) return
      e.preventDefault()
      // Captured: the button-up comes back here even off the court.
      target.setPointerCapture?.(e.pointerId)
      keys.swingDown('mouse')
      return
    }
    if (!pad) return
    pad.enable()
    if (e.target instanceof Node && pad.actEl.contains(e.target)) {
      e.preventDefault()
      if (actPointer !== null) return // a second thumb on the button doesn't repeat it
      actPointer = e.pointerId
      target.setPointerCapture?.(e.pointerId)
      pad.setAct(true)
      try {
        navigator.vibrate?.(10)
      } catch {
        // Haptics are a nicety.
      }
      keys.ability('jump')
      return
    }
    if (pad.diveEl && e.target instanceof Node && pad.diveEl.contains(e.target)) {
      e.preventDefault()
      if (divePointer !== null) return // a second thumb on the button doesn't repeat it
      divePointer = e.pointerId
      target.setPointerCapture?.(e.pointerId)
      pad.setDive?.(true)
      try {
        navigator.vibrate?.(10)
      } catch {
        // Haptics are a nicety.
      }
      keys.ability('lunge')
      return
    }
    if (e.target instanceof Node && pad.swingEl.contains(e.target)) {
      e.preventDefault()
      if (swingPointer !== null) return // a second thumb on the button doesn't double-swing
      swingPointer = e.pointerId
      target.setPointerCapture?.(e.pointerId)
      pad.setPressed(true)
      try {
        navigator.vibrate?.(10)
      } catch {
        // Haptics are a nicety (blocked or missing on some browsers).
      }
      keys.swingDown('touch')
      return
    }
    if (isUi(e.target)) return
    const rect = target.getBoundingClientRect()
    const x = e.clientX - rect.left
    if (x > rect.width * STICK_ZONE || !stick.down(e.pointerId, e.clientX, e.clientY)) return
    e.preventDefault()
    target.setPointerCapture?.(e.pointerId)
    pad.showStick(x, e.clientY - rect.top)
  }
  const onMove = (e: PointerEvent) => {
    const v = stick.move(e.pointerId, e.clientX, e.clientY)
    if (!v) return
    keys.stick(v.x, v.z)
    const k = knobOffset(stick.origin, { x: e.clientX, y: e.clientY }, stick.radius)
    pad?.moveKnob(k.x, k.y)
  }
  /** A finger / the mouse let go (`swing`: lifted → swing; taken away by the browser → cancel). */
  const lift = (e: PointerEvent, swing: boolean) => {
    if (stick.up(e.pointerId)) {
      keys.stick(0, 0)
      pad?.hideStick()
    }
    if (e.pointerType === 'mouse') {
      // The right button is the ability (one press): its release never lets go of a left-button charge.
      // With both held, releasing one sends pointermove (not pointerup) in browsers, so the left button's
      // state is read from `buttons` (onMouseMove), not `button`.
      if (swing && (e.buttons & 1) === 1) return
      if (swing) keys.swingUp('mouse')
      else keys.cancelSwing('mouse')
    } else if (e.pointerId === actPointer) {
      actPointer = null
      pad?.setAct(false)
    } else if (e.pointerId === divePointer) {
      divePointer = null
      pad?.setDive?.(false)
    } else if (e.pointerId === swingPointer) {
      swingPointer = null
      pad?.setPressed(false)
      if (swing) keys.swingUp('touch')
      else keys.cancelSwing('touch')
    }
  }
  const onPointerUp = (e: PointerEvent) => lift(e, true)
  // Left released while the right is still held: browsers send pointermove (buttons without bit 0), no pointerup yet.
  const onMouseMove = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && (e.buttons & 1) === 0) keys.swingUp('mouse')
  }
  // The browser took the pointer away (a system gesture, capture lost): no swing.
  const onPointerLost = (e: PointerEvent) => lift(e, false)
  const noMenu = (e: Event) => e.preventDefault()
  // Tab hidden or phone rotated mid-drag: no pointerup will come for the held fingers.
  const onHidden = () => {
    if (document.hidden) letGo()
  }

  window.addEventListener('keydown', onDown)
  window.addEventListener('keyup', onUp)
  window.addEventListener('blur', letGo)
  window.addEventListener('orientationchange', letGo)
  document.addEventListener('visibilitychange', onHidden)
  target.addEventListener('pointerdown', onPointer)
  // lostpointercapture also follows every captured pointerup (already handled then): it only cancels
  // a pointer lost without one.
  target.addEventListener('pointerup', onPointerUp)
  target.addEventListener('pointermove', onMouseMove)
  target.addEventListener('pointercancel', onPointerLost)
  target.addEventListener('lostpointercapture', onPointerLost)
  if (pad) {
    target.classList.add('sp-touchable')
    target.addEventListener('pointermove', onMove)
  }
  // Right click is a button: never the browser menu (a long press on a phone too).
  target.addEventListener('contextmenu', noMenu)
  return {
    resync: () => keys.resync(),
    release: letGo,
    stop() {
      keys.dispose()
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', letGo)
      window.removeEventListener('orientationchange', letGo)
      document.removeEventListener('visibilitychange', onHidden)
      target.removeEventListener('pointerdown', onPointer)
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointermove', onMouseMove)
      target.removeEventListener('pointerup', onPointerUp)
      target.removeEventListener('pointercancel', onPointerLost)
      target.removeEventListener('lostpointercapture', onPointerLost)
      target.removeEventListener('contextmenu', noMenu)
      target.classList.remove('sp-touchable')
    },
  }
}
