import { describe, expect, it } from 'vitest'
import { boostDetail, GUIDE, newlySeen, runStats } from './guide'
import { BOOSTS } from './sim/boosts'
import type { BoostId } from './sim/types'
import { brick, empty } from './sim/testing'

describe('guide', () => {
  it('explains every special brick, pickup and ball kind', () => {
    const ids = GUIDE.map((g) => g.id)
    for (const id of ['bomb', 'gold', 'lightning', 'mystery', 'armored', 'splitter'])
      expect(ids).toContain(`brick:${id}`)
    for (const id of ['ball', 'coin', 'fire', 'laser']) expect(ids).toContain(`pickup:${id}`)
    for (const id of ['fire', 'bomb']) expect(ids).toContain(`ball:${id}`)
    for (const g of GUIDE) expect(g.text.length).toBeGreaterThan(10)
  })
})

describe('newlySeen', () => {
  it('lists special bricks and pickups on the board not seen before, once each', () => {
    const s = empty()
    Object.assign(brick(s, 0, 0, 5), { kind: 'bomb' })
    Object.assign(brick(s, 1, 0, 5), { kind: 'bomb' })
    brick(s, 2, 0, 5)
    s.pickups.push({ id: 99, col: 3, row: 0, kind: 'laser' }, { id: 98, col: 4, row: 0, kind: 'ball' })
    expect(newlySeen(s, ['pickup:ball'])).toEqual(['brick:bomb', 'pickup:laser'])
    expect(newlySeen(s, ['brick:bomb', 'pickup:laser', 'pickup:ball'])).toEqual([])
  })
})

describe('runStats', () => {
  it('summarises the run for the side panel', () => {
    const s = empty()
    s.boosts = { damage: 2, crit: 1 }
    s.ballCount = 12
    const stats = Object.fromEntries(runStats(s, 40))
    expect(stats['Damage per hit']).toBe('1.5')
    expect(stats['Crit chance']).toBe('10%')
    expect(stats['Balls']).toBe('12')
    expect(stats['Best turn']).toBe('40')
  })

  it('counts level power in damage per hit', () => {
    const s = empty()
    s.level = 5
    expect(Object.fromEntries(runStats(s, 0))['Damage per hit']).toBe('1.2')
  })
})

describe('boostDetail', () => {
  it('describes what the owned level does', () => {
    expect(boostDetail('fireball', 2)).toMatch(/every 6th/i)
    expect(boostDetail('damage', 3)).toContain('+75%')
    expect(boostDetail('crit', 2)).toContain('20%')
    expect(boostDetail('big', 1)).toContain('+20%')
  })

  it('has a line for every boost', () => {
    for (const id of Object.keys(BOOSTS) as BoostId[])
      expect(boostDetail(id, 1).length, id).toBeGreaterThan(10)
  })
})
