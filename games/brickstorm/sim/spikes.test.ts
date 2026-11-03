// Spiked bricks only bite on their spiked faces.
import { describe, expect, it } from 'vitest'
import { roleBricks, summon } from './boss-kit'
import { spawnBoss } from './boss'
import { CELL } from './config'
import { damageBrick } from './damage'
import { cellCenter } from './rows'
import { drainEvents, step } from './run'
import { isSpiked, rollSpikes } from './spikes'
import { ballAt, empty } from './testing'
import type { Face } from './types'

const FACES: Face[] = ['top', 'bottom', 'left', 'right']

describe('spiked faces', () => {
  it('a brick with no face list (older saves) is spiked all round', () => {
    for (const f of FACES) expect(isSpiked({}, f)).toBe(true)
  })

  it('only the listed faces are spiked', () => {
    const b = { spikes: ['left'] as Face[] }
    expect(isSpiked(b, 'left')).toBe(true)
    expect(isSpiked(b, 'bottom')).toBe(false)
    expect(isSpiked(b, undefined)).toBe(false)
  })

  it('rolls distinct faces and never spikes only the top', () => {
    const s = empty(3)
    for (let i = 0; i < 200; i++) {
      const one = rollSpikes(s, 1)
      expect(one).not.toEqual(['top'])
      const two = rollSpikes(s, 2)
      expect(new Set(two).size).toBe(2)
    }
  })

  it('a ball hitting a thorn on a bare face does not hurt the hero', () => {
    const s = empty()
    s.turn = 30
    spawnBoss(s, ['thorns'], 'block')
    const t = roleBricks(s, 'thorn')[0]
    t.spikes = ['top']
    t.hp = t.maxHp = 1e9
    const hp = s.hp
    damageBrick(s, t, 1, 'ball', 0, { face: 'bottom' })
    expect(s.hp).toBe(hp)
    damageBrick(s, t, 1, 'ball', 0, { face: 'top' })
    expect(s.hp).toBeLessThan(hp)
  })

  it('a ball hitting a spike brick on a bare face bounces instead of popping', () => {
    const s = empty()
    s.turn = 30
    spawnBoss(s, ['spikes'], 'block')
    s.bricks = s.bricks.filter((b) => b.kind === 'boss')
    const [spike] = summon(s, [[2, 6]], 999, { role: 'spike' })
    spike.spikes = ['top']
    const c = cellCenter(spike.col, spike.row)
    s.phase = 'volley'
    s.balls = [ballAt(c.x, c.y + CELL)]
    drainEvents(s)
    for (let i = 0; i < 30 && s.phase === 'volley'; i++) step(s)
    expect(drainEvents(s).some((e) => e.type === 'pop')).toBe(false)
  })
})
