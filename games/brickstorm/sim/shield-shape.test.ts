// Boss shields follow the real shape of its body: a sloped (triangle) or round
// part counts as facing both ways it leans, and wards beside a sloped part
// take its angle.
import { describe, expect, it } from 'vitest'
import { wardShape } from './boss-kit'
import { bossContact, damageBoss, spawnBoss } from './boss'
import { facesOf, faceOf } from './faces'
import { ballAt, brick, empty } from './testing'
import type { BossSkillId, RunState } from './types'

const fight = (skills: BossSkillId[]): RunState => {
  const s = empty()
  s.turn = 30
  spawnBoss(s, skills, 'block')
  return s
}
const D = Math.SQRT1_2

describe('which way a surface faces', () => {
  it('a flat side faces one way', () => {
    expect(facesOf(0, -1)).toEqual(['top'])
    expect(facesOf(1, 0)).toEqual(['right'])
  })

  it('a 45° slope faces both ways it leans', () => {
    expect(facesOf(-D, -D).sort()).toEqual(['left', 'top'])
    expect(facesOf(D, D).sort()).toEqual(['bottom', 'right'])
  })

  it('the main face stays the stronger axis', () => {
    expect(faceOf(0.3, -0.95)).toBe('top')
  })
})

describe('shields on sloped parts', () => {
  it('a shell blocks a hit on an upward slope, even when the slope leans more sideways', () => {
    const s = fight(['shell'])
    expect(bossContact(s, ballAt(0, 0), 'left', facesOf(-0.8, -0.6))).toBe('block')
    expect(bossContact(s, ballAt(0, 0), 'bottom', facesOf(0, 1))).toBe('hit')
  })

  it('a bulwark blocks a hit on a sideways slope', () => {
    const s = fight(['bulwark'])
    expect(bossContact(s, ballAt(0, 0), 'bottom', facesOf(D, D))).toBe('block')
    expect(bossContact(s, ballAt(0, 0), 'bottom', facesOf(0, 1))).toBe('hit')
  })

  it('an underplate halves hits on a downward slope', () => {
    const s = fight(['underplate'])
    const hp = s.boss!.hp
    damageBoss(s, 10, 'ball', { face: 'left', facing: facesOf(-D, D) })
    expect(s.boss!.hp).toBeCloseTo(hp - 5)
  })
})

describe('wards beside a sloped part', () => {
  it('take its angle when they sit on the side its slope faces', () => {
    const s = empty()
    const part = brick(s, 3, 2, 10)
    part.kind = 'boss'
    part.shape = 'tri-bl' // slope faces up and right
    expect(wardShape(s, 4, 2)).toBe('tri-bl')
    expect(wardShape(s, 3, 1)).toBe('tri-bl')
    expect(wardShape(s, 2, 2)).toBeUndefined() // behind the square side
    expect(wardShape(s, 3, 3)).toBeUndefined()
  })

  it('stay square next to square parts', () => {
    const s = empty()
    const part = brick(s, 3, 2, 10)
    part.kind = 'boss'
    expect(wardShape(s, 4, 2)).toBeUndefined()
  })
})
