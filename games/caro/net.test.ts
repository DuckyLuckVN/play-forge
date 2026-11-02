import { expect, it } from 'vitest'
import { createBroadcastTransport } from '@forge/net/broadcast'
import { Session } from '@forge/net/session'
import { caroGame } from './sim'

const until = async (cond: () => boolean, ms = 5000) => {
  const end = Date.now() + ms
  while (!cond()) {
    if (Date.now() > end) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, 5))
  }
}

it('plays a guest move through the host, and only on its turn', async () => {
  const room = Math.random().toString(36).slice(2)
  const host = new Session(caroGame, createBroadcastTransport('caro-test', room), {
    host: true,
    name: 'A',
    playerId: 'a',
  })
  const guest = new Session(caroGame, createBroadcastTransport('caro-test', room), {
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
    const guestIsX = guest.state!.seats[0].id === 'b'
    // X moves first; if that's the host, play its move so it's the guest's turn.
    if (!guestIsX) {
      host.sendInput({ t: 'move', cell: 0 })
      await until(() => guest.state!.moves.length === 1)
    }
    guest.sendInput({ t: 'move', cell: 112 })
    await until(() => guest.state!.board[112] !== 0)
    expect(guest.state!.board[112]).toBe(guestIsX ? 1 : 2)
    // Out of turn: ignored.
    guest.sendInput({ t: 'move', cell: 113 })
    await new Promise((r) => setTimeout(r, 300))
    expect(host.state!.board[113]).toBe(0)
  } finally {
    host.dispose()
    guest.dispose()
  }
})
