// Keyboard + mouse → SpInput. Directions are view-relative (x = screen right, z = toward the net).
// `move` goes out only when the held direction changes; a swing carries the held direction and the
// tick the player is looking at.
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
 * Held keys → inputs, DOM-free. `move` goes out when the held direction changes; `resync()` re-sends
 * it, because the session drops inputs during the countdown and while paused (a key held through
 * "Go!" or let go during a pause would otherwise be lost).
 */
export class HeldKeys {
  private held = new Set<string>()
  private dir = { x: 0, z: 0 }

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

  /** Let go of everything (window blur: no keyup will come). */
  clear(): void {
    this.held.clear()
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
    const next = heldDir(this.held)
    if (next.x === this.dir.x && next.z === this.dir.z) return
    this.dir = next
    this.resync()
  }
}

export interface InputBinding {
  /** Re-send the held direction (call when play starts or resumes). */
  resync(): void
  stop(): void
}

/**
 * WASD / arrows move; Space, J or a left click on `target` swings.
 * `nowTick` = the state tick on screen (sent with the swing).
 */
export function bindInput(
  target: HTMLElement,
  send: (i: SpInput) => void,
  nowTick: () => number,
): InputBinding {
  const keys = new HeldKeys(send, nowTick)
  const onDown = (e: KeyboardEvent) => {
    if (isUi(e.target)) return
    if (SWING_KEYS.has(e.code)) {
      e.preventDefault()
      if (!e.repeat) keys.swing()
    } else if (keys.press(e.code)) e.preventDefault()
  }
  const onUp = (e: KeyboardEvent) => keys.release(e.code)
  const onBlur = () => keys.clear()
  const onPointer = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || isUi(e.target)) return
    e.preventDefault()
    keys.swing()
  }

  window.addEventListener('keydown', onDown)
  window.addEventListener('keyup', onUp)
  window.addEventListener('blur', onBlur)
  target.addEventListener('pointerdown', onPointer)
  return {
    resync: () => keys.resync(),
    stop() {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', onBlur)
      target.removeEventListener('pointerdown', onPointer)
    },
  }
}
