import { beforeEach, describe, expect, it, vi } from 'vitest'
import { playSound } from '@forge/audio/sound'
import { Juice } from './juice'
import { SPECIAL_HIT, SPECIAL_TRIGGER } from './special-fx'
import type { BrickKind } from './sim/types'

vi.mock('@forge/audio/sound', () => ({ playSound: vi.fn() }))
vi.mock('@forge/fx/confetti', () => ({ celebrate: vi.fn() }))

const particles = { burst: vi.fn(), text: vi.fn(), count: 0 }
const shake = { add: vi.fn() }
const juice = () => new Juice(particles as never, shake as never)

const SPECIAL_KINDS: BrickKind[] = [
  'slime',
  'water',
  'fire',
  'void',
  'bomb',
  'gold',
  'lightning',
  'mystery',
  'armored',
  'splitter',
]

beforeEach(() => {
  vi.clearAllMocks()
  particles.count = 0
})

describe('special brick feedback', () => {
  it('every special kind reacts to a hit', () => {
    for (const k of SPECIAL_KINDS) expect(SPECIAL_HIT[k], k).toBeDefined()
  })

  it('a hit bursts particles and plays a sound', () => {
    juice().handle({ type: 'special', kind: 'armored', x: 10, y: 20, trigger: false })
    expect(particles.burst).toHaveBeenCalledOnce()
    expect(playSound).toHaveBeenCalledOnce()
    expect(particles.text).toHaveBeenCalledOnce() // "ARMOR −1"
  })

  it('a bomb going off says BOOM', () => {
    juice().handle({ type: 'special', kind: 'bomb', x: 0, y: 0, trigger: true })
    expect(particles.text.mock.calls[0][2]).toBe(SPECIAL_TRIGGER.bomb!.label!())
  })

  it('a burst of hits on one kind shows its word only once', () => {
    const j = juice()
    for (let i = 0; i < 20; i++) j.handle({ type: 'special', kind: 'slime', x: 0, y: 0, trigger: false })
    expect(particles.text).toHaveBeenCalledOnce()
    expect(particles.burst).toHaveBeenCalledTimes(20)
  })

  it('on a crowded screen, hits skip their sparks but bombs still burst', () => {
    particles.count = 500
    const j = juice()
    j.handle({ type: 'special', kind: 'armored', x: 0, y: 0, trigger: false })
    expect(particles.burst).not.toHaveBeenCalled()
    j.handle({ type: 'special', kind: 'bomb', x: 0, y: 0, trigger: true })
    expect(particles.burst).toHaveBeenCalledOnce()
  })

  it('a laser fading out puffs', () => {
    juice().handle({ type: 'pickupFade', kind: 'laser', x: 0, y: 0 })
    expect(particles.burst).toHaveBeenCalledOnce()
  })

  it('hazards acting on a ball get a word', () => {
    const j = juice()
    j.handle({ type: 'ignite', x: 0, y: 0 })
    j.handle({ type: 'douse', x: 0, y: 0 })
    j.handle({ type: 'eaten', x: 0, y: 0, by: 'void' })
    expect(particles.text).toHaveBeenCalledTimes(3)
  })
})
