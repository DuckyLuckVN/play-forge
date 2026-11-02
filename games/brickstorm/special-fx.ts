// What each special brick looks and sounds like when a ball hits it, or when
// it goes off: particles, a sound, and a small word saying what happened.
// One table, so a new brick kind only needs a row here.
import type { Sound } from '@forge/audio/sound'
import { t } from './i18n'
import type { BrickKind } from './sim/types'
import { BRICK_SOUNDS, SPECIAL_SOUNDS } from './sounds'

export interface SpecialFx {
  colors: string[]
  count: number
  speed: number
  sound: Sound
  /** A short word over the brick (translated when shown); none for small, frequent hits. */
  label?: () => string
  labelColor?: string
}

/** A ball hitting a special brick (it may hit it many times a volley: keep these small). */
export const SPECIAL_HIT: Partial<Record<BrickKind, SpecialFx>> = {
  armored: {
    colors: ['#d6dbe8', '#ffffff'],
    count: 6,
    speed: 220,
    sound: SPECIAL_SOUNDS.armor,
    label: () => t('ARMOR −1'),
    labelColor: '#d6dbe8',
  },
  gold: { colors: ['#ffc83d', '#fff3b0'], count: 5, speed: 140, sound: SPECIAL_SOUNDS.gold },
  slime: {
    colors: ['#63d471', '#3fae52'],
    count: 6,
    speed: 110,
    sound: SPECIAL_SOUNDS.squelch,
    label: () => t('STICKY!'),
    labelColor: '#63d471',
  },
  water: { colors: ['#4dabf7', '#e7f5ff'], count: 6, speed: 130, sound: SPECIAL_SOUNDS.splash },
  fire: { colors: ['#ff922b', '#ffc83d'], count: 4, speed: 120, sound: SPECIAL_SOUNDS.crackle },
  void: { colors: ['#9d4edd', '#1e1830'], count: 4, speed: 70, sound: SPECIAL_SOUNDS.hum },
  bomb: { colors: ['#ff6b6b', '#ffc83d'], count: 3, speed: 90, sound: SPECIAL_SOUNDS.crackle },
  lightning: { colors: ['#eaf6ff', '#74c0fc'], count: 4, speed: 160, sound: SPECIAL_SOUNDS.crackle },
  mystery: { colors: ['#ffc83d', '#c77dff'], count: 4, speed: 100, sound: SPECIAL_SOUNDS.gold },
  splitter: { colors: ['#c5bfd9', '#ffffff'], count: 4, speed: 120, sound: SPECIAL_SOUNDS.crackle },
}

/** A special brick going off (bomb, lightning, splitter): bigger, with a word every time. */
export const SPECIAL_TRIGGER: Partial<Record<BrickKind, SpecialFx>> = {
  bomb: {
    colors: ['#ff9f43', '#ffc83d', '#ff6b6b'],
    count: 10,
    speed: 200,
    sound: BRICK_SOUNDS.whoosh,
    label: () => t('BOOM!'),
    labelColor: '#ff9f43',
  },
  lightning: {
    colors: ['#eaf6ff', '#74c0fc', '#ffffff'],
    count: 12,
    speed: 260,
    sound: SPECIAL_SOUNDS.crackle,
    label: () => t('ZAP!'),
    labelColor: '#74c0fc',
  },
  splitter: {
    colors: ['#c5bfd9', '#ffffff'],
    count: 12,
    speed: 220,
    sound: SPECIAL_SOUNDS.split,
    label: () => t('SPLIT!'),
    labelColor: '#ffffff',
  },
}

/** Seconds between two words of the same kind, so a volley of fifty balls stays readable. */
export const SPECIAL_LABEL_GAP = 0.6

/** Words for hazards acting on a ball (shown by their own events: eaten, ignite, douse). */
export const HAZARD_LABEL = {
  slime: () => t('GULP!'),
  void: () => t('SWALLOWED!'),
  burn: () => t('BURNT OUT'),
  ignite: () => t('BURNING!'),
  douse: () => t('DOUSED'),
}
