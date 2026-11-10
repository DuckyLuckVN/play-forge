// Character presets (index = sim preset). Each row is data only: name, card colours and the Look the
// model builders read (model/look.ts). Adding a character = adding a row (+ a VI name in i18n.ts, and
// sim.ts PRESETS follows this table's length).

import type { Look } from './model/look'

export interface Preset {
  id: number
  /** English name; shown through the game's translator (VI in i18n.ts). */
  name: string
  /** Shirt colour (also the picker card tint). */
  body: number
  /** Accent: headwear, stripe, wristband, racket frame. */
  accent: number
  look: Look
}

const SKIN = 0xffe0c7
const HUMAN = {
  skin: SKIN,
  head: 'round',
  ears: 'human',
  muzzle: 'none',
  face: 'chibi',
  hands: 'mitten',
  feet: 'sneaker',
  tail: 'none',
} as const

/** The computer starts on 1, the player on 0. */
export const PRESETS: readonly Preset[] = [
  {
    id: 0,
    name: 'Berry',
    body: 0xff8fab,
    accent: 0xe8467c,
    look: {
      ...HUMAN,
      hair: 0x5a3e36,
      iris: 0xb0506e,
      style: 'bowPigtails',
      kit: {
        shirt: 0xff8fab,
        trim: 0xffffff,
        stripe: 0xe8467c,
        bottom: 'skirt',
        bottomColor: 0xffffff,
        socks: 0xffffff,
        shoe: 0xe8467c,
        sole: 0xffffff,
        tape: 0xffffff,
      },
    },
  },
  {
    id: 1,
    name: 'Cloud',
    body: 0x7cc6fe,
    accent: 0x3d74d6,
    look: {
      ...HUMAN,
      hair: 0x2f2a3a,
      iris: 0x3d74d6,
      style: 'capFringe',
      kit: {
        shirt: 0x7cc6fe,
        trim: 0xffffff,
        stripe: 0x3d74d6,
        bottom: 'shorts',
        bottomColor: 0x2e4a8a,
        socks: 0xffffff,
        shoe: 0x3d74d6,
        sole: 0xffffff,
        tape: 0x2e4a8a,
      },
    },
  },
  {
    id: 2,
    name: 'Sunny',
    body: 0xffd166,
    accent: 0xff8c42,
    look: {
      ...HUMAN,
      hair: 0x8a4b2a,
      iris: 0xc8692e,
      style: 'bandSpiky',
      kit: {
        shirt: 0xffd166,
        trim: 0xff8c42,
        stripe: 0xff8c42,
        bottom: 'shorts',
        bottomColor: 0x3a4166,
        socks: 0xffffff,
        shoe: 0xff8c42,
        sole: 0xffffff,
        tape: 0x3a4166,
      },
    },
  },
  {
    id: 3,
    name: 'Mint',
    body: 0x9be7a8,
    accent: 0x2f9e7e,
    look: {
      ...HUMAN,
      hair: 0x6b4433,
      iris: 0x2f9e7e,
      style: 'beanieBob',
      kit: {
        shirt: 0x9be7a8,
        trim: 0xffffff,
        stripe: 0x2f9e7e,
        bottom: 'shorts',
        bottomColor: 0x2f9e7e,
        socks: 0xffffff,
        shoe: 0x2f9e7e,
        sole: 0xffffff,
        tape: 0xffffff,
      },
    },
  },
]
