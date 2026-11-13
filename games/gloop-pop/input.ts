// Held-button auto-repeat (like a game pad): one step on press, then after a short
// delay, quick repeats until release. Shared by the keyboard and the touch buttons.

/** Before repeating starts, and between repeats (ms). */
export const REPEAT_DELAY = 170
export const REPEAT_EVERY = 55

export interface Timers {
  set(fn: () => void, ms: number): unknown
  clear(handle: unknown): void
}

const WINDOW_TIMERS: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
}

export class AutoRepeat<K extends string> {
  private held = new Map<K, unknown>()

  constructor(
    private readonly fire: (key: K) => void,
    private readonly timers: Timers = WINDOW_TIMERS,
  ) {}

  press(key: K): void {
    if (this.held.has(key)) return
    this.fire(key)
    const again = () => {
      this.fire(key)
      this.held.set(key, this.timers.set(again, REPEAT_EVERY))
    }
    this.held.set(key, this.timers.set(again, REPEAT_DELAY))
  }

  release(key: K): void {
    const h = this.held.get(key)
    if (h === undefined) return
    this.timers.clear(h)
    this.held.delete(key)
  }

  releaseAll(): void {
    for (const key of [...this.held.keys()]) this.release(key)
  }

  isHeld(key: K): boolean {
    return this.held.has(key)
  }
}

export type Action = 'left' | 'right' | 'turnL' | 'turnR' | 'soft' | 'drop'

export const KEYMAP: Record<string, Action> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'turnR',
  KeyW: 'turnR',
  KeyX: 'turnR',
  KeyZ: 'turnL',
  KeyQ: 'turnL',
  ArrowDown: 'soft',
  KeyS: 'soft',
  Space: 'drop',
}

/** Actions that repeat while held. */
export const REPEATS: ReadonlySet<Action> = new Set(['left', 'right'])
