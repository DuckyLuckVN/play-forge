/** Body types by kind: each one a drawing strategy for its creatures. */
import type { BodyKind, BodyType } from '../types'
import { crab } from './crab'
import { critter } from './critter'
import { flyer } from './flyer'
import { frog } from './frog'
import { golem } from './golem'
import { robot } from './robot'
import { slime } from './slime'
import { sprite } from './sprite'

export const BODIES: Record<BodyKind, BodyType> = {
  robot,
  slime,
  golem,
  sprite,
  critter,
  flyer,
  crab,
  frog,
}
