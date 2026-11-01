import { describe, expect, it } from 'vitest'
import { parseSteps } from '@forge/audio/music'
import { BOSS } from './music'

describe('Brickstorm music', () => {
  it('has tracks that parse into whole bars', () => {
    for (const track of [BOSS]) {
      for (const part of track.parts) {
        // One parsed entry per step (notes, rests and holds alike).
        expect(parseSteps(part.steps).length % 8, `${track.name} ${part.instrument}`).toBe(0)
      }
    }
  })
})
