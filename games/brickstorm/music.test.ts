import { describe, expect, it } from 'vitest'
import { parseSteps } from '@forge/audio/music'
import { ARCADE } from '@forge/audio/tracks'
import { BOSS, SOUNDTRACKS, trackFor } from './music'
import { CATALOG } from './shop'

describe('Brickstorm music', () => {
  it('has tracks that parse into whole bars', () => {
    for (const track of [BOSS, ...Object.values(SOUNDTRACKS)]) {
      for (const part of track.parts) {
        // One parsed entry per step (notes, rests and holds alike).
        expect(parseSteps(part.steps).length % 8, `${track.name} ${part.instrument}`).toBe(0)
      }
    }
  })

  it('sells at least 20 soundtracks, each with its own track', () => {
    const sold = CATALOG.filter((i) => i.kind === 'music')
    expect(sold.length).toBeGreaterThanOrEqual(20)
    for (const it of sold) expect(SOUNDTRACKS[it.id], it.id).toBeDefined()
    expect(new Set(Object.values(SOUNDTRACKS).map((t) => t.name)).size).toBe(Object.keys(SOUNDTRACKS).length)
  })

  it('plays the stock arcade track by default and for unknown ids', () => {
    expect(trackFor('music:arcade')).toBe(ARCADE)
    expect(trackFor('music:nope')).toBe(ARCADE)
  })
})
