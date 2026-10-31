// In-game notices (first-seen hints): a card over the middle of the board, one at a time.

export interface Notice {
  /** Guide id, e.g. 'brick:bomb', used for the card's picture. */
  id: string
  title: string
  text: string
}

/** Seconds a notice stays up: long enough to read, 5 to 10 s. */
export function noticeDuration(text: string): number {
  const words = text.trim().split(/\s+/).length
  return Math.min(10, Math.max(5, 2 + words * 0.4))
}

export class NoticeQueue {
  private items: Notice[] = []
  /** Seconds the current notice has been showing. */
  age = 0

  get current(): Notice | null {
    return this.items[0] ?? null
  }

  /** 0..1 through the current notice's time. */
  get progress(): number {
    const n = this.current
    return n ? Math.min(1, this.age / noticeDuration(n.text)) : 0
  }

  push(n: Notice): void {
    this.items.push(n)
  }

  dismiss(): void {
    this.items.shift()
    this.age = 0
  }

  update(dt: number): void {
    const n = this.current
    if (!n) return
    this.age += dt
    if (this.age >= noticeDuration(n.text)) this.dismiss()
  }

  clear(): void {
    this.items = []
    this.age = 0
  }
}
