import { afterEach, describe, expect, it, vi } from 'vitest'

const sends: Array<(...a: unknown[]) => Promise<void>> = []
vi.mock('trystero', () => ({
  selfId: 'me',
  getRelaySockets: () => ({}),
  joinRoom: () => ({
    getPeers: () => ({}),
    makeAction: () => ({ send: (...a: unknown[]) => sends[0](...a) }),
    leave: async () => {},
  }),
}))

import { createTrysteroTransport } from './trystero'

describe('trystero transport', () => {
  const unhandled = vi.fn()
  afterEach(() => process.off('unhandledRejection', unhandled))

  it('a send that rejects (peer gone, channel stopped) is swallowed, not unhandled', async () => {
    process.on('unhandledRejection', unhandled)
    sends[0] = () => Promise.reject(new Error('data channel stopped draining'))
    const transport = createTrysteroTransport('app', 'room')
    expect(() => transport.send('state', { a: 1 }, 'gone')).not.toThrow()
    await new Promise((r) => setTimeout(r, 20))
    expect(unhandled).not.toHaveBeenCalled()
  })
})
