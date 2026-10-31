import { expect, it } from 'vitest'
import { createBroadcastTransport } from '@forge/net/broadcast'
import { Session } from '@forge/net/session'
import { snakeGame } from './sim'

const until = async (cond: () => boolean, ms = 5000) => {
  const end = Date.now() + ms
  while (!cond()) {
    if (Date.now() > end) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, 5))
  }
}

it('steers a guest snake through the host', async () => {
  const room = Math.random().toString(36).slice(2)
  const def = { ...snakeGame, countdown: 0 }
  const host = new Session(def, createBroadcastTransport('test', room), {
    host: true,
    name: 'A',
    playerId: 'a',
  })
  const guest = new Session(def, createBroadcastTransport('test', room), {
    host: false,
    name: 'B',
    playerId: 'b',
  })
  try {
    await until(() => guest.lobby.players.length === 2)
    guest.setReady(true)
    await until(() => host.canStart)
    host.start()
    await until(() => guest.phase === 'playing')
    guest.sendInput('up')
    await until(() => (guest.state?.tick ?? 0) > 3)
    expect(guest.state!.snakes.find((s) => s.id === guest.selfId)!.dir).toBe('up')
  } finally {
    host.dispose()
    guest.dispose()
  }
})
