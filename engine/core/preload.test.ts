import { describe, expect, it, vi } from 'vitest'
import { preloadGate } from './preload'

/** A preload the test settles by hand. */
function deferred() {
  let resolve!: () => void
  let reject!: (err: unknown) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('preloadGate', () => {
  it('is ready at once when the game has no preload', async () => {
    const gate = preloadGate(undefined)
    expect(gate.pending).toBe(false)
    const after = vi.fn()
    void gate.whenReady().then(after)
    await flush()
    expect(after).toHaveBeenCalled()
  })

  // Regression: a reload rejoined the room and mounted Shuttle Pop before its 3D scene was built,
  // so the game showed "needs WebGL" on a blank stage. Rejoin must wait for the preload.
  it('holds back until a running preload settles', async () => {
    const load = deferred()
    const gate = preloadGate(() => load.promise)
    expect(gate.pending).toBe(true)
    const after = vi.fn()
    void gate.whenReady().then(after)
    await flush()
    expect(after).not.toHaveBeenCalled()
    load.resolve()
    await flush()
    expect(after).toHaveBeenCalled()
    expect(gate.pending).toBe(false)
  })

  it('still lets players in when the preload fails', async () => {
    const load = deferred()
    const onError = vi.fn()
    const gate = preloadGate(() => load.promise, onError)
    const after = vi.fn()
    void gate.whenReady().then(after)
    load.reject(new Error('no gpu'))
    await flush()
    expect(after).toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith(expect.any(Error))
    expect(gate.pending).toBe(false)
  })

  it('treats a preload that throws synchronously as failed, not fatal', async () => {
    const gate = preloadGate(
      () => {
        throw new Error('boom')
      },
      () => {},
    )
    const after = vi.fn()
    void gate.whenReady().then(after)
    await flush()
    expect(after).toHaveBeenCalled()
  })

  it('runs the preload once however many callers wait', async () => {
    const run = vi.fn(() => Promise.resolve())
    const gate = preloadGate(run)
    await Promise.all([gate.whenReady(), gate.whenReady()])
    expect(run).toHaveBeenCalledTimes(1)
  })
})
