// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

vi.mock('../audio/sound', () => ({ playSound: vi.fn() }))

import { playSound } from '../audio/sound'
import { ReactionLayer } from './reaction-ui'

// jsdom has no CSS.escape
vi.stubGlobal('CSS', { escape: (s: string) => s })

describe('ReactionLayer', () => {
  it('soundOnly plays the sound but floats nothing', () => {
    const layer = new ReactionLayer(document.body)
    layer.show('p1', 'gg', { avatar: 'cat', color: '#fff' }, { soundOnly: true })
    expect(playSound).toHaveBeenCalledTimes(1)
    expect(document.querySelectorAll('.pf-rx')).toHaveLength(0)
    layer.show('p1', 'gg', { avatar: 'cat', color: '#fff' })
    expect(document.querySelectorAll('.pf-rx')).toHaveLength(1)
  })
})
