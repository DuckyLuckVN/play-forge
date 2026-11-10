import { describe, expect, it, vi } from 'vitest'
import { ReactionBridge } from './reaction-bridge'
import type { ReactionHub } from './reactions'

const mkHub = () =>
  ({ send: vi.fn(() => true) }) as unknown as ReactionHub & { send: ReturnType<typeof vi.fn> }

describe('ReactionBridge', () => {
  it('inactive without a hub: send is false', () => {
    const b = new ReactionBridge()
    expect(b.active).toBe(false)
    expect(b.send('gg')).toBe(false)
  })
  it('attach toggles active once per change', () => {
    const b = new ReactionBridge()
    const hub = mkHub()
    const seen: boolean[] = []
    b.onActive((a) => seen.push(a))
    b.attach(hub)
    b.attach(hub)
    b.attach(null)
    expect(seen).toEqual([true, false])
  })
  it('send goes through the hub', () => {
    const b = new ReactionBridge()
    const hub = mkHub()
    b.attach(hub)
    expect(b.send('fire')).toBe(true)
    expect(hub.send).toHaveBeenCalledWith('fire')
  })
  it('claim: any drawer that drew; unsubscribed drawers are skipped', () => {
    const b = new ReactionBridge()
    const off = b.draw((p) => p === 'a')
    expect(b.claim('a', 'gg')).toBe(true)
    expect(b.claim('spectator', 'gg')).toBe(false)
    off()
    expect(b.claim('a', 'gg')).toBe(false)
  })
  it('onActive unsubscribe stops calls', () => {
    const b = new ReactionBridge()
    const fn = vi.fn()
    b.onActive(fn)()
    b.attach(mkHub())
    expect(fn).not.toHaveBeenCalled()
  })
})
