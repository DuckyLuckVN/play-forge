import { describe, expect, it } from 'vitest'
import { DirectWatchdog, WATCHDOG } from './direct-watchdog'

/** Ticks once a second from `from` to `to` ms; returns the times it asked to retry. */
function run(w: DirectWatchdog, from: number, to: number, relayOnly: (t: number) => boolean) {
  const at: number[] = []
  for (let t = from; t <= to; t += 1000) if (w.tick(t, relayOnly(t))) at.push(t)
  return at
}

describe('DirectWatchdog', () => {
  it('adds up to jitterMs at random, so two peers do not retry in step', () => {
    const late = run(new DirectWatchdog(() => 1), 0, 60_000, () => true)[0]
    expect(late).toBe(WATCHDOG.firstMs + WATCHDOG.jitterMs)
  })

  it('retries a peer stuck on the relay after a while, then backs off, at most a few times', () => {
    const w = new DirectWatchdog(() => 0)
    const at = run(w, 0, 300_000, () => true)
    expect(at).toHaveLength(WATCHDOG.maxRetries)
    expect(at[0]).toBe(WATCHDOG.firstMs)
    expect(at[1] - at[0]).toBe(WATCHDOG.firstMs * 2)
    expect(at[2] - at[1]).toBe(WATCHDOG.firstMs * 4)
  })

  it('does nothing while everyone is linked directly', () => {
    expect(run(new DirectWatchdog(() => 0), 0, 120_000, () => false)).toEqual([])
  })

  it('a short relay spell (a direct link opening normally) is no reason to retry', () => {
    expect(run(new DirectWatchdog(() => 0), 0, 60_000, (t) => t < WATCHDOG.firstMs - 2000)).toEqual([])
  })

  it('once all are direct, a later stuck peer gets the full retries again', () => {
    const w = new DirectWatchdog(() => 0)
    run(w, 0, 300_000, () => true)
    run(w, 301_000, 310_000, () => false)
    expect(run(w, 311_000, 700_000, () => true)).toHaveLength(WATCHDOG.maxRetries)
  })
})
