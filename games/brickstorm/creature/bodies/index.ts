/** Body types by kind: each one a drawing strategy for its creatures. */
import type { BodyKind, BodyType } from '../types'
import { robot } from './robot'
import { slime } from './slime'

export const BODIES: Partial<Record<BodyKind, BodyType>> = {
  robot,
  slime,
}
