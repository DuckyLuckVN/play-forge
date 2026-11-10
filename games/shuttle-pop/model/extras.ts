// Animated extra bones: tails, floppy / twitchy ears, wing nubs, an antenna. Each is a pivot on a body
// bone (hips, torso or head) with its own merged mesh (one draw call; a pair is the same geometry
// mirrored), animated by a pose channel (flair.ts). Static bits (round panda ears, horns) stay merged
// into their bone instead (head.ts / body.ts): an extra costs a draw call, so only things that move are
// extras. Budget: ≤ 3 extra meshes per look.

import type { Channel } from '../flair'
import type { ExtraKind, Look } from './look'
import type { Part, Triple } from './merge'

export interface ExtraSpec {
  /** The bone it hangs on. */
  parent: 'hips' | 'torso' | 'head'
  /** Pivot in the parent bone's space (the +x one of a pair). */
  at: Triple
  /** Also a mirrored twin at −x (ears, wings). */
  pair?: boolean
  channel: Channel
  /** Parts in pivot space. */
  parts: (l: Look) => Part[]
  /** Unlit parts on the same pivot (a light), shown while the channel's `glow` is on. */
  glow?: (l: Look) => Part[]
}

export const EXTRAS: Record<ExtraKind, ExtraSpec> = {}

/** Meshes an extra adds (a pair is two; a glow one more each). */
export function extraMeshes(s: ExtraSpec): number {
  return (s.pair ? 2 : 1) * (s.glow ? 2 : 1)
}
