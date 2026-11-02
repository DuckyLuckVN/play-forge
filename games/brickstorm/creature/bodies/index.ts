/** Body types by kind: each one a drawing strategy for its creatures. */
import type { BodyKind, BodyType } from '../types'
import { golem } from './golem'
import { robot } from './robot'
import { slime } from './slime'
import { sprite } from './sprite'

export const BODIES: Partial<Record<BodyKind, BodyType>> = {
  robot,
  slime,
  golem,
  sprite,
}
