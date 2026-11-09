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
 * WASD / arrows move; Space, J or a left click on `target` swings. Returns the cleanup.
 * `nowTick` = the state tick on screen (sent with the swing).
 */
export function bindInput(
  target: HTMLElement,
  send: (i: SpInput) => void,
  nowTick: () => number,
): () => void {
  const held = new Set<string>()
  let dir = { x: 0, z: 0 }

  const update = () => {
    const next = heldDir(held)
    if (next.x === dir.x && next.z === dir.z) return
    dir = next
    send({ t: 'move', x: dir.x, z: dir.z })
  }
  const swing = () => send({ t: 'swing', x: dir.x, z: dir.z, tick: nowTick() })

  const onDown = (e: KeyboardEvent) => {
    if (isUi(e.target)) return
    if (DIRS[e.code]) {
      e.preventDefault()
      held.add(e.code)
      update()
    } else if (SWING_KEYS.has(e.code)) {
      e.preventDefault()
      if (!e.repeat) swing()
    }
  }
  const onUp = (e: KeyboardEvent) => {
    if (held.delete(e.code)) update()
  }
  // Keys let go while the window is unfocused never send keyup: stop instead of running on.
  const onBlur = () => {
    held.clear()
    update()
  }
  const onPointer = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return
    e.preventDefault()
    swing()
  }

  window.addEventListener('keydown', onDown)
  window.addEventListener('keyup', onUp)
  window.addEventListener('blur', onBlur)
  target.addEventListener('pointerdown', onPointer)
  return () => {
    window.removeEventListener('keydown', onDown)
    window.removeEventListener('keyup', onUp)
    window.removeEventListener('blur', onBlur)
    target.removeEventListener('pointerdown', onPointer)
  }
}
