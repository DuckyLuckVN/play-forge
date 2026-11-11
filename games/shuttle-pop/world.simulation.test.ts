import { describe } from 'vitest'
import { COURT_SIZES } from './courtsize'
import { CASES, cameraTweakSweep, WANTS } from './world.harness'

describe('camera framing', () => {
  describe('camera tweak', () => {
    cameraTweakSweep(COURT_SIZES, CASES, WANTS)
  })
})
