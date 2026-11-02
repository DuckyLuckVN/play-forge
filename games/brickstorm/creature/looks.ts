/** Per-hero creature looks: body type, colours and signature move. Heroes without a look still draw the legacy figure. */
import type { HeroId } from '../sim/heroes'
import type { CreatureLook } from './types'

export const CREATURE_LOOKS: Partial<Record<HeroId, CreatureLook>> = {
  rookie: {
    body: 'robot',
    variant: 'cube',
    main: '#4a8cf0',
    second: '#c3ccd8',
    hand: '#c3ccd8',
    eye: '#5fe0ff',
    signature: 'glance',
  },
}
