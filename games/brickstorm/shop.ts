import { spend, type Helpers, type Save } from './save'
import { HERO_IDS, HEROES } from './sim/heroes'

export type ItemKind = 'ball' | 'trail' | 'arena' | 'impact' | 'music' | 'hero' | 'helper'

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

const looks = (kind: ItemKind, list: Array<[string, string, number]>) =>
  list.map(([key, name, price]) => item(kind, key, name, price))

// Listed cheapest first within each kind.
export const CATALOG: ShopItem[] = [
  ...looks('ball', [
    ['classic', 'Classic', 0],
    ['star', 'Star', 375],
    ['moon', 'Moon', 450],
    ['cube', 'Cube', 625],
    ['heart', 'Heart', 700],
    ['pixel', 'Pixel', 875],
    ['cookie', 'Cookie', 950],
    ['beach', 'Beach Ball', 1100],
    ['planet', 'Planet', 1250],
    ['donut', 'Donut', 1400],
    ['bubble', 'Bubble', 1600],
    ['gem', 'Gem', 1750],
    ['snowflake', 'Snowflake', 2000],
    ['eight', 'Eight Ball', 2100],
    ['eyeball', 'Eyeball', 2250],
    ['ghost', 'Ghost', 2500],
    ['orb', 'Plasma Orb', 2750],
    ['flame', 'Flame', 3000],
    ['sun', 'Sun', 3500],
    ['atom', 'Atom', 4000],
  ]),
  ...looks('trail', [
    ['none', 'None', 0],
    ['mint', 'Mint', 300],
    ['candy', 'Candy', 400],
    ['sparkle', 'Sparkle', 500],
    ['ocean', 'Ocean', 600],
    ['ice', 'Ice', 700],
    ['bubbles', 'Bubbles', 875],
    ['toxic', 'Toxic', 1000],
    ['fire', 'Fire', 1100],
    ['pixel', 'Pixel', 1250],
    ['gold', 'Gold Dust', 1400],
    ['shadow', 'Shadow', 1600],
    ['neon', 'Neon', 1750],
    ['comet', 'Comet', 1875],
    ['lava', 'Lava', 2000],
    ['sunset', 'Sunset', 2200],
    ['rainbow', 'Rainbow', 2500],
    ['lightning', 'Lightning', 2800],
    ['galaxy', 'Galaxy', 3200],
    ['ghostly', 'Ghostly', 3600],
  ]),
  ...looks('arena', [
    ['indigo', 'Indigo Night', 0],
    ['skies', 'Sky High', 500],
    ['candy', 'Candy Land', 650],
    ['space', 'Deep Space', 750],
    ['winter', 'Winter Peak', 900],
    ['forest', 'Firefly Forest', 1100],
    ['blossom', 'Blossom Moon', 1300],
    ['ocean', 'Deep Ocean', 1500],
    ['desert', 'Dune Sea', 1700],
    ['storm', 'Thunderstorm', 1900],
    ['aurora', 'Aurora', 2100],
    ['sunset', 'Sunset Grid', 2250],
    ['abyss', 'The Abyss', 2500],
    ['circuit', 'Circuit Board', 2750],
    ['matrix', 'Code Rain', 3000],
    ['volcano', 'Volcano', 3250],
    ['meteor', 'Meteor Shower', 3500],
    ['neon', 'Neon City', 3750],
    ['galaxy', 'Spiral Galaxy', 4250],
    ['warp', 'Hyperspace', 5000],
  ]),
  ...looks('impact', [
    ['shards', 'Shards', 0],
    ['dust', 'Dust', 250],
    ['bubbles', 'Bubbles', 400],
    ['confetti', 'Confetti', 500],
    ['snow', 'Snow', 600],
    ['leaves', 'Leaves', 750],
    ['pixels', 'Pixels', 875],
    ['embers', 'Embers', 1000],
    ['toxic', 'Toxic', 1100],
    ['coins', 'Coin Shower', 1250],
    ['stardust', 'Stardust', 1375],
    ['hearts', 'Hearts', 1500],
    ['glitter', 'Glitter', 1650],
    ['pow', 'Pow!', 1800],
    ['ink', 'Ink Splat', 2000],
    ['smoke', 'Smoke', 2200],
    ['fireworks', 'Fireworks', 2600],
    ['plasma', 'Plasma', 3000],
    ['boom', 'Boom!', 3400],
    ['supernova', 'Supernova', 4000],
  ]),
  ...looks('music', [
    ['arcade', 'Arcade', 0],
    ['lofi', 'Lo-Fi Drift', 300],
    ['cafe', 'Rainy Café', 400],
    ['hero', '8-Bit Hero', 500],
    ['march', 'Brick March', 650],
    ['breeze', 'Ocean Breeze', 800],
    ['party', 'Pixel Party', 950],
    ['funk', 'Funk Brick', 1100],
    ['starlight', 'Starlight', 1250],
    ['neon', 'Neon Drive', 1400],
    ['quest', 'Heroic Quest', 1600],
    ['jazz', 'Midnight Jazz', 1800],
    ['disco', 'Disco Bounce', 2000],
    ['waltz', 'Aurora Waltz', 2200],
    ['night', 'Arcade Night', 2400],
    ['groove', 'Groove Machine', 2700],
    ['retro', 'Retro Wave', 3000],
    ['thunder', 'Thunder Run', 3300],
    ['meteor', 'Meteor Storm', 3600],
    ['overdrive', 'Overdrive', 4000],
  ]),
  // Heroes, cheapest first (the order of HERO_IDS).
  ...HERO_IDS.map((id) => item('hero', id, HEROES[id].name, HEROES[id].price)),
  helper('potion', 'Potion', 200, 'Mid-run: heal half your health'),
  helper('headStart', 'Head Start', 150, 'Start a run with +5 balls'),
  helper('luckyStart', 'Lucky Start', 200, 'Start a run with a free skill pick'),
  helper('reroll', 'Reroll Token', 100, 'One free skill reroll'),
  helper('revive', 'Revive Token', 375, 'One free revive on game over'),
  helper('pushBack', 'Push Back', 300, 'Mid-run: lift every brick up a row'),
  helper('rowBomb', 'Row Bomb', 250, 'Mid-run: destroy the lowest row'),
  helper('freeze', 'Freeze', 200, "Mid-run: bricks don't drop after your next volley"),
  helper('firePack', 'Fire Pack', 225, 'Mid-run: your next volley starts with 5 fireballs'),
  helper('surge', 'Ball Surge', 175, 'Mid-run: +50% balls for your next volley'),
  helper('powerStart', 'Power Start', 250, 'Start a run with Heavy Hitter ×2'),
  helper('goldStart', 'Gold Start', 250, 'Start a run with Gold Rush ×2'),
  helper('eagleStart', 'Eagle Start', 200, 'Start a run with Eagle Eye'),
  helper('megaBomb', 'Mega Bomb', 450, 'Mid-run: halve the health of every brick'),
  helper('colBomb', 'Column Bomb', 275, 'Mid-run: destroy the fullest column'),
  helper('laserGrid', 'Laser Grid', 350, 'Mid-run: fire lasers across the 3 lowest rows'),
  helper('midasTouch', 'Midas Touch', 225, 'Mid-run: turn 4 bricks into gold'),
  helper('ballRain', 'Ball Rain', 200, 'Mid-run: +10 balls for your next volley'),
  helper('overcharge', 'Overcharge', 325, 'Mid-run: ×2 damage for your next volley'),
  helper('vacuum', 'Vacuum', 150, 'Mid-run: collect every pickup on the board'),
  helper('pierceShot', 'Pierce Shot', 300, 'Mid-run: balls pierce 2 bricks next volley'),
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
