import { expect, it } from 'vitest'
import { createBroadcastTransport } from '@forge/net/broadcast'
import { Session } from '@forge/net/session'
import type { Dir } from './board'
import { boardOf, fuseGame } from './sim'

const until = async (cond: () => boolean, ms = 5000) => {
  const end = Date.now() + ms
  while (!cond()) {
    if (Date.now() > end) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, 5))
  }
}

it('a guest slides its own board through the host', async () => {
  const room = Math.random().toString(36).slice(2)
  const host = new Session(fuseGame, createBroadcastTransport('fuse-test', room), {
    host: true,
    name: 'A',
    playerId: 'a',
  })
  const guest = new Session(fuseGame, createBroadcastTransport('fuse-test', room), {
    host: false,
    name: 'B',
    playerId: 'b',
  })
  try {
    await until(() => guest.lobby.players.length === 2)
    guest.setReady(true)
    await until(() => host.canStart)
    host.start()
    await until(() => guest.phase === 'playing' && guest.state !== null)
    expect(guest.state!.boards.map((b) => b.id)).toEqual(['a', 'b'])
    // Two starting tiles always allow at least one direction; try them in turn.
    for (const dir of ['left', 'right', 'up', 'down'] as Dir[]) {
      guest.sendInput({ t: 'move', dir })
      await new Promise((r) => setTimeout(r, 120))
      if (boardOf(guest.state!, 'b')!.moves > 0) break
    }
    expect(boardOf(guest.state!, 'b')!.moves).toBe(1)
    expect(boardOf(guest.state!, 'a')!.moves).toBe(0)
  } finally {
    host.dispose()
    guest.dispose()
  }
})
