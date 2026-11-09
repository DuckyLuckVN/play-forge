// Keyboard + mouse + touch (stick + swing button) → SpInput. Directions are view-relative (x = screen right, z = toward the net).
// `move` goes out only when the held direction changes; a swing carries the held direction and the
// tick the player is looking at.
import { knobOffset, quantise, STICK_RADIUS, StickTracker } from './joystick'
import type { SpInput } from './sim'

const DIRS: Record<string, readonly [number, number]> = {
  KeyW: [0, 1],
  ArrowUp: [0, 1],
  KeyS: [0, -1],
  ArrowDown: [0, -1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
}
const SWING_KEYS = new Set(['Space', 'KeyJ'])

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

/** Typing in chat / a field, or pressing a button, isn't play. */
const isUi = (t: EventTarget | null) =>
  t instanceof Element && !!t.closest('input, textarea, select, button, a, .pf-overlay')

/**
 * Held keys + the touch stick → inputs, DOM-free (one held direction for both: held keys win, else
 * the stick). `move` goes out when the held direction changes; `resync()` re-sends
 * it, because the session drops inputs during the countdown and while paused (a key held through
 * "Go!" or let go during a pause would otherwise be lost).
 */
export class HeldKeys {
  private held = new Set<string>()
  private dir = { x: 0, z: 0 }
  private stickDir = { x: 0, z: 0 }

  constructor(
    private send: (i: SpInput) => void,
    private nowTick: () => number,
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

  /** Let go of everything, stick included (window blur / leaving play: no keyup will come). */
  clear(): void {
    this.held.clear()
    this.stickDir = { x: 0, z: 0 }
    this.update()
  }

  swing(): void {
    this.send({ t: 'swing', x: this.dir.x, z: this.dir.z, tick: this.nowTick() })
  }

  /** Send the held direction again (stop when nothing is held). */
  resync(): void {
    this.send({ t: 'move', x: this.dir.x, z: this.dir.z })
  }

  private update() {
    const keys = heldDir(this.held)
    const next = keys.x || keys.z ? keys : this.stickDir
    if (next.x === this.dir.x && next.z === this.dir.z) return
    this.dir = next
    this.resync()
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
  enable(): void
  showStick(x: number, y: number): void
  moveKnob(dx: number, dy: number): void
  hideStick(): void
  setPressed(on: boolean): void
}

/** Touches starting in this share of the view's width (from the left) grab the stick. */
const STICK_ZONE = 0.45

/**
 * WASD / arrows move; Space, J or a left click on `target` swings. With a `pad`, touches on the left
 * of `target` drive a floating stick and the pad's swing button swings (both at once: each finger is
 * tracked by pointer id). `nowTick` = the state tick on screen (sent with the swing).
 */
export function bindInput(
  target: HTMLElement,
  send: (i: SpInput) => void,
  nowTick: () => number,
  pad?: TouchView,
): InputBinding {
  const keys = new HeldKeys(send, nowTick)
  const stick = new StickTracker(STICK_RADIUS)
  let swingPointer: number | null = null
  const onDown = (e: KeyboardEvent) => {
    if (isUi(e.target)) return
    if (SWING_KEYS.has(e.code)) {
      e.preventDefault()
      if (!e.repeat) keys.swing()
    } else if (keys.press(e.code)) e.preventDefault()
  }
  const onUp = (e: KeyboardEvent) => keys.release(e.code)
  const letGo = () => {
    stick.cancel()
    swingPointer = null
    keys.clear()
    pad?.hideStick()
    pad?.setPressed(false)
  }
  const onPointer = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') {
      if (e.button !== 0 || isUi(e.target)) return
      e.preventDefault()
      keys.swing()
      return
    }
    if (!pad) return
    pad.enable()
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
      keys.swing()
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
  const onPointerUp = (e: PointerEvent) => {
    if (stick.up(e.pointerId)) {
      keys.stick(0, 0)
      pad?.hideStick()
    }
    if (e.pointerId === swingPointer) {
      swingPointer = null
      pad?.setPressed(false)
    }
  }
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
  if (pad) {
    target.classList.add('sp-touchable')
    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', onPointerUp)
    target.addEventListener('pointercancel', onPointerUp)
    // The browser took the finger away (e.g. a system gesture): same as lifting it.
    target.addEventListener('lostpointercapture', onPointerUp)
    target.addEventListener('contextmenu', noMenu)
  }
  return {
    resync: () => keys.resync(),
    release: letGo,
    stop() {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', letGo)
      window.removeEventListener('orientationchange', letGo)
      document.removeEventListener('visibilitychange', onHidden)
      target.removeEventListener('pointerdown', onPointer)
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', onPointerUp)
      target.removeEventListener('pointercancel', onPointerUp)
      target.removeEventListener('lostpointercapture', onPointerUp)
      target.removeEventListener('contextmenu', noMenu)
      target.classList.remove('sp-touchable')
    },
  }
}
