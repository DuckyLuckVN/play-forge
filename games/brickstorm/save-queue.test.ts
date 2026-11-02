import { describe, expect, it, vi } from 'vitest'
import { SaveQueue } from './save-queue'

function setup() {
  const write = vi.fn()
  const jobs: Array<() => void> = []
  const q = new SaveQueue(write, (job) => jobs.push(job))
  return { q, write, run: () => jobs.splice(0).forEach((j) => j()) }
}

describe('SaveQueue', () => {
  it('many requests in a row become one write, when the browser is idle', () => {
    const { q, write, run } = setup()
    q.request()
    q.request()
    q.request()
    expect(write).not.toHaveBeenCalled()
    run()
    expect(write).toHaveBeenCalledOnce()
  })

  it('flush writes now (the tab is hiding), and the idle job then has nothing to do', () => {
    const { q, write, run } = setup()
    q.request()
    q.flush()
    expect(write).toHaveBeenCalledOnce()
    run()
    expect(write).toHaveBeenCalledOnce()
  })

  it('flush with nothing pending writes nothing', () => {
    const { q, write } = setup()
    q.flush()
    expect(write).not.toHaveBeenCalled()
  })

  it('a request after a write schedules another', () => {
    const { q, write, run } = setup()
    q.request()
    run()
    q.request()
    run()
    expect(write).toHaveBeenCalledTimes(2)
  })
})
