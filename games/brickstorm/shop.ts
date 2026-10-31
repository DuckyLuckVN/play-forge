import { spend, type Helpers, type Save } from './save'

export type ItemKind = 'ball' | 'trail' | 'arena' | 'impact' | 'helper'

export interface ShopItem {
  id: string
  kind: ItemKind
  name: string
  price: number
  /** One-line description (helpers). */
  text?: string
  helper?: keyof Helpers
}

const item = (kind: ItemKind, key: string, name: string, price: number): ShopItem => ({
  id: `${kind}:${key}`,
  kind,
  name,
  price,
})

const helper = (key: keyof Helpers, name: string, price: number, text: string): ShopItem => ({
  id: `helper:${key}`,
  kind: 'helper',
  name,
  price,
  text,
  helper: key,
})

export const CATALOG: ShopItem[] = [
  item('ball', 'classic', 'Classic', 0),
  item('ball', 'star', 'Star', 150),
  item('ball', 'cube', 'Cube', 250),
  item('ball', 'pixel', 'Pixel', 350),
  item('ball', 'planet', 'Planet', 500),
  item('ball', 'gem', 'Gem', 700),
  item('ball', 'eyeball', 'Eyeball', 900),
  item('ball', 'flame', 'Flame', 1200),
  item('trail', 'none', 'None', 0),
  item('trail', 'sparkle', 'Sparkle', 200),
  item('trail', 'bubbles', 'Bubbles', 350),
  item('trail', 'pixel', 'Pixel', 500),
  item('trail', 'comet', 'Comet', 750),
  item('trail', 'rainbow', 'Rainbow', 1000),
  item('arena', 'indigo', 'Indigo Night', 0),
  item('arena', 'space', 'Deep Space', 300),
  item('arena', 'ocean', 'Deep Ocean', 600),
  item('arena', 'sunset', 'Sunset Grid', 900),
  item('arena', 'neon', 'Neon City', 1500),
  item('impact', 'shards', 'Shards', 0),
  item('impact', 'confetti', 'Confetti', 200),
  item('impact', 'pixels', 'Pixels', 350),
  item('impact', 'stardust', 'Stardust', 550),
  item('impact', 'ink', 'Ink Splat', 800),
  helper('headStart', 'Head Start', 60, 'Start a run with +5 balls'),
  helper('luckyStart', 'Lucky Start', 80, 'Start a run with a free boost pick'),
  helper('reroll', 'Reroll Token', 40, 'One free boost reroll'),
  helper('revive', 'Revive Token', 150, 'One free revive on game over'),
  helper('pushBack', 'Push Back', 120, 'Mid-run: lift every brick up a row'),
  helper('rowBomb', 'Row Bomb', 100, 'Mid-run: destroy the lowest row'),
  helper('freeze', 'Freeze', 80, "Mid-run: bricks don't drop after your next volley"),
  helper('firePack', 'Fire Pack', 90, 'Mid-run: your next volley starts with 5 fireballs'),
  helper('surge', 'Ball Surge', 70, 'Mid-run: +50% balls for your next volley'),
]

export const findItem = (id: string) => CATALOG.find((i) => i.id === id)

export function buy(save: Save, id: string): { save: Save; result: 'ok' | 'owned' | 'poor' | 'unknown' } {
  const it = findItem(id)
  if (!it) return { save, result: 'unknown' }
  if (it.kind !== 'helper' && save.owned.includes(id)) return { save, result: 'owned' }
  const paid = spend(save, it.price)
  if (!paid) return { save, result: 'poor' }
  if (it.helper)
    return {
      save: { ...paid, helpers: { ...paid.helpers, [it.helper]: paid.helpers[it.helper] + 1 } },
      result: 'ok',
    }
  return { save: { ...paid, owned: [...paid.owned, id] }, result: 'ok' }
}

export function equip(save: Save, id: string): Save {
  const it = findItem(id)
  if (!it || it.kind === 'helper' || !save.owned.includes(id)) return save
  return { ...save, equipped: { ...save.equipped, [it.kind]: id } }
}
