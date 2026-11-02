// The player's skill slots as sockets: filled ones (which skill, its rarity,
// its level) then empty ones, the first empty one marked as where a new skill
// goes. Pure, so the pick screen and its tests share it.
import { BOOSTS, boostSlots, slottedBoosts } from './sim/boosts'
import type { BoostId, RunState } from './sim/types'

export type Socket =
  { kind: 'filled'; id: BoostId; rarity: string; level: number } | { kind: 'empty'; next: boolean }

export interface SlotView {
  sockets: Socket[]
  used: number
  max: number
  full: boolean
}

export function slotView(s: Pick<RunState, 'boosts' | 'bossesBeaten' | 'hero'>): SlotView {
  const owned = slottedBoosts(s.boosts)
  const max = Math.max(boostSlots(s), owned.length)
  const sockets: Socket[] = owned.map((id) => ({
    kind: 'filled',
    id,
    rarity: BOOSTS[id].rarity,
    level: s.boosts[id] ?? 0,
  }))
  for (let i = owned.length; i < max; i++) sockets.push({ kind: 'empty', next: i === owned.length })
  return { sockets, used: owned.length, max, full: owned.length >= max }
}
