// Player avatars: cartoon heads drawn from a few shared parts (ears, head,
// eyes, mouth, extras), so 24 characters cost a few KB in the single-file
// builds and look the same on every device.

type Ears = 'cat' | 'round' | 'bunny' | 'floppy' | 'tufts' | 'antenna' | 'horns' | 'spikes'
type Head = 'round' | 'square' | 'ghost' | 'blob' | 'octo' | 'pumpkin'
type Eyes = 'dot' | 'shine' | 'big' | 'happy' | 'sleepy' | 'frog' | 'cyclops' | 'visor' | 'jack' | 'sly'
type Mouth = 'smile' | 'cat' | 'nose' | 'beak' | 'snout' | 'grin' | 'fang' | 'o' | 'jack' | 'robot'
type Extra =
  | 'mane'
  | 'muzzle'
  | 'face'
  | 'penguin'
  | 'patches'
  | 'stripes'
  | 'cheeks'
  | 'leaf'
  | 'horn'
  | 'tuft'
  | 'koala'

export interface AvatarDef {
  id: string
  /** English name: label for screen readers and the i18n key. */
  name: string
  body: string
  accent: string
  ears?: Ears
  head?: Head
  eyes: Eyes
  mouth: Mouth
  extras?: Extra[]
}

export const AVATARS: readonly AvatarDef[] = [
  {
    id: 'cat',
    name: 'Cat',
    body: '#ffa94d',
    accent: '#ffd8a8',
    ears: 'cat',
    eyes: 'dot',
    mouth: 'cat',
    extras: ['cheeks'],
  },
  {
    id: 'dog',
    name: 'Dog',
    body: '#c98a5a',
    accent: '#f1d3b3',
    ears: 'floppy',
    eyes: 'dot',
    mouth: 'grin',
    extras: ['muzzle'],
  },
  {
    id: 'fox',
    name: 'Fox',
    body: '#ff7b2e',
    accent: '#fff4e6',
    ears: 'cat',
    eyes: 'sly',
    mouth: 'cat',
    extras: ['muzzle'],
  },
  {
    id: 'bear',
    name: 'Bear',
    body: '#a0703e',
    accent: '#e3c29b',
    ears: 'round',
    eyes: 'dot',
    mouth: 'nose',
    extras: ['muzzle'],
  },
  {
    id: 'panda',
    name: 'Panda',
    body: '#f4f1ff',
    accent: '#2b2340',
    ears: 'round',
    eyes: 'shine',
    mouth: 'nose',
    extras: ['patches'],
  },
  {
    id: 'frog',
    name: 'Frog',
    body: '#6ccf5f',
    accent: '#b7f0a8',
    eyes: 'frog',
    mouth: 'smile',
    extras: ['cheeks'],
  },
  {
    id: 'owl',
    name: 'Owl',
    body: '#8d6cd9',
    accent: '#d9ccff',
    ears: 'tufts',
    eyes: 'big',
    mouth: 'beak',
    extras: ['face'],
  },
  {
    id: 'penguin',
    name: 'Penguin',
    body: '#2d3561',
    accent: '#f4f1ff',
    eyes: 'dot',
    mouth: 'beak',
    extras: ['penguin', 'cheeks'],
  },
  {
    id: 'bunny',
    name: 'Bunny',
    body: '#f4f1ff',
    accent: '#ffb3c7',
    ears: 'bunny',
    eyes: 'dot',
    mouth: 'cat',
    extras: ['cheeks'],
  },
  { id: 'pig', name: 'Pig', body: '#ff9fb8', accent: '#ffcbd8', ears: 'cat', eyes: 'happy', mouth: 'snout' },
  {
    id: 'monkey',
    name: 'Monkey',
    body: '#8a5a3c',
    accent: '#f0c9a0',
    ears: 'round',
    eyes: 'dot',
    mouth: 'grin',
    extras: ['face'],
  },
  {
    id: 'koala',
    name: 'Koala',
    body: '#9aa3b5',
    accent: '#e4e8f0',
    ears: 'round',
    eyes: 'sleepy',
    mouth: 'smile',
    extras: ['koala'],
  },
  {
    id: 'lion',
    name: 'Lion',
    body: '#ffc83d',
    accent: '#d9822b',
    ears: 'round',
    eyes: 'dot',
    mouth: 'cat',
    extras: ['mane', 'muzzle'],
  },
  {
    id: 'tiger',
    name: 'Tiger',
    body: '#ff9f43',
    accent: '#fff4e6',
    ears: 'cat',
    eyes: 'sly',
    mouth: 'fang',
    extras: ['stripes', 'muzzle'],
  },
  {
    id: 'chick',
    name: 'Chick',
    body: '#ffe066',
    accent: '#fff3b0',
    eyes: 'happy',
    mouth: 'beak',
    extras: ['tuft', 'cheeks'],
  },
  {
    id: 'octopus',
    name: 'Octopus',
    body: '#c77dff',
    accent: '#e9c7ff',
    head: 'octo',
    eyes: 'big',
    mouth: 'smile',
    extras: ['cheeks'],
  },
  {
    id: 'alien',
    name: 'Alien',
    body: '#9cff7a',
    accent: '#ff6fb5',
    ears: 'antenna',
    eyes: 'cyclops',
    mouth: 'smile',
  },
  {
    id: 'robot',
    name: 'Robot',
    body: '#b8c2d9',
    accent: '#ff6b6b',
    ears: 'antenna',
    head: 'square',
    eyes: 'visor',
    mouth: 'robot',
  },
  {
    id: 'ghost',
    name: 'Ghost',
    body: '#f4f1ff',
    accent: '#c9c4ec',
    head: 'ghost',
    eyes: 'big',
    mouth: 'o',
    extras: ['cheeks'],
  },
  {
    id: 'slime',
    name: 'Slime',
    body: '#2ed3d3',
    accent: '#a8f5f5',
    head: 'blob',
    eyes: 'big',
    mouth: 'grin',
  },
  {
    id: 'dino',
    name: 'Dino',
    body: '#4be3a0',
    accent: '#ffc83d',
    ears: 'spikes',
    eyes: 'dot',
    mouth: 'fang',
    extras: ['cheeks'],
  },
  {
    id: 'unicorn',
    name: 'Unicorn',
    body: '#fff0fb',
    accent: '#ff9ad5',
    ears: 'cat',
    eyes: 'happy',
    mouth: 'smile',
    extras: ['horn', 'cheeks'],
  },
  { id: 'imp', name: 'Imp', body: '#ff5d5d', accent: '#ffc83d', ears: 'horns', eyes: 'sly', mouth: 'fang' },
  {
    id: 'pumpkin',
    name: 'Pumpkin',
    body: '#ff8c1a',
    accent: '#d96d00',
    head: 'pumpkin',
    eyes: 'jack',
    mouth: 'jack',
    extras: ['leaf'],
  },
]

export const AVATAR_IDS: readonly string[] = AVATARS.map((a) => a.id)

const INK = '#2b2340'
const BLUSH = '#ff8fab'

/** Draws `svg` and its mirror image across the vertical centre line. */
const pair = (svg: string) => `${svg}<g transform="matrix(-1 0 0 1 64 0)">${svg}</g>`

function ears(a: AvatarDef): string {
  const { body, accent } = a
  switch (a.ears) {
    case 'cat':
      return pair(
        `<path d="M13 31L15 7L31 18Z" fill="${body}"/><path d="M16 25L17 13L26 19Z" fill="${accent}"/>`,
      )
    case 'round':
      return pair(
        `<circle cx="15" cy="19" r="8.5" fill="${body}"/><circle cx="15" cy="19" r="4.5" fill="${accent}"/>`,
      )
    case 'bunny':
      return pair(
        `<g transform="rotate(-10 23 14)"><ellipse cx="23" cy="12" rx="6.5" ry="15" fill="${body}"/><ellipse cx="23" cy="13" rx="3.2" ry="10" fill="${accent}"/></g>`,
      )
    case 'floppy':
      return pair(`<ellipse cx="13" cy="33" rx="7.5" ry="14" transform="rotate(18 13 33)" fill="${accent}"/>`)
    case 'tufts':
      return pair(`<path d="M15 24L13 7L27 17Z" fill="${body}"/>`)
    case 'antenna':
      return `<path d="M32 16V5" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/><circle cx="32" cy="5" r="4" fill="${accent}"/>`
    case 'horns':
      return pair(`<path d="M18 20L14 4L28 15Z" fill="${accent}"/>`)
    case 'spikes':
      return `<path d="M21 20L25 8L30 17ZM29 17L33 5L37 17ZM36 17L41 8L44 20Z" fill="${accent}"/>`
    default:
      return ''
  }
}

function head(a: AvatarDef): string {
  const f = `fill="${a.body}"`
  switch (a.head) {
    case 'square':
      return `<rect x="11" y="15" width="42" height="40" rx="11" ${f}/>`
    case 'ghost':
      return `<path d="M12 36a20 20 0 0 1 40 0V57l-6.7-5-6.7 5-6.6-5-6.7 5-6.7-5-6.6 5Z" ${f}/>`
    case 'blob':
      return `<path d="M9 55C9 31 19 16 32 16S55 31 55 55Q55 59 50 59H14Q9 59 9 55Z" ${f}/><path d="M18 59v3a3 3 0 0 0 6 0v-3ZM40 59v2a2.5 2.5 0 0 0 5 0v-2Z" ${f}/>`
    case 'octo':
      return `<path d="M13 34a19 19 0 0 1 38 0V51q-3 9-6 0q-3.25 9-6.5 0q-3.25 9-6.5 0q-3.25 9-6.5 0q-3.25 9-6.5 0q-3 9-6 0Z" ${f}/>`
    case 'pumpkin':
      return `<ellipse cx="32" cy="38" rx="23" ry="20" ${f}/><path d="M32 19V57M21 21Q14 38 21 56M43 21Q50 38 43 56" stroke="${a.accent}" stroke-width="2" fill="none"/>`
    default:
      return `<circle cx="32" cy="36" r="21" ${f}/>`
  }
}

/** Extras drawn behind the head. */
function back(a: AvatarDef): string {
  return a.extras?.includes('mane')
    ? `<circle cx="32" cy="36" r="25" fill="${a.accent}" stroke="${a.accent}" stroke-width="6" stroke-dasharray="5 3.5" stroke-linecap="round"/>`
    : ''
}

/** Extras drawn on the face, under the eyes and mouth. */
function face(a: AvatarDef): string {
  const { accent } = a
  let out = ''
  for (const x of a.extras ?? []) {
    if (x === 'muzzle') out += `<ellipse cx="32" cy="45" rx="11" ry="8" fill="${accent}"/>`
    if (x === 'face') out += `<ellipse cx="32" cy="40" rx="16" ry="14" fill="${accent}"/>`
    if (x === 'penguin')
      out += `<path d="M32 26a9 9 0 0 1 15 7Q50 52 32 55Q14 52 17 33a9 9 0 0 1 15-7Z" fill="${accent}"/>`
    if (x === 'patches')
      out += pair(`<ellipse cx="24" cy="35" rx="6" ry="7.5" transform="rotate(-25 24 35)" fill="${INK}"/>`)
    if (x === 'stripes')
      out += `<path d="M27 16l2 6M37 16l-2 6M32 15v7" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>${pair(`<path d="M11 33h6M12 39h5" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>`)}`
    if (x === 'koala') out += `<ellipse cx="32" cy="41" rx="5" ry="6.5" fill="${INK}"/>`
  }
  return out
}

/** Extras drawn last: cheeks and anything sticking out of the top. */
function front(a: AvatarDef): string {
  let out = ''
  for (const x of a.extras ?? []) {
    if (x === 'cheeks') out += pair(`<circle cx="18.5" cy="44" r="3.5" fill="${BLUSH}" opacity=".7"/>`)
    if (x === 'leaf')
      out += `<path d="M31 19Q30 12 34 9L36 11Q33 14 34 19Z" fill="#6b4a2b"/><ellipse cx="41" cy="12" rx="6" ry="3" transform="rotate(-20 41 12)" fill="#6ccf5f"/>`
    if (x === 'horn')
      out += `<path d="M27.5 17L32 1L36.5 17Z" fill="#ffd166"/><path d="M29 12l6-2M30 7l4-1.5" stroke="#f0a500" stroke-width="1.5"/>`
    if (x === 'tuft') out += `<path d="M30 16Q25 8 31 5Q30 10 34 6Q33 12 34 16Z" fill="${a.body}"/>`
  }
  return out
}

function eyes(a: AvatarDef): string {
  const stroke = `stroke="${INK}" stroke-width="2.6" stroke-linecap="round" fill="none"`
  switch (a.eyes) {
    case 'dot':
      return pair(
        `<circle cx="24" cy="35" r="3.3" fill="${INK}"/><circle cx="25" cy="34" r="1.1" fill="#fff"/>`,
      )
    case 'shine':
      return pair(
        `<circle cx="24.5" cy="34.5" r="2.8" fill="#fff"/><circle cx="25" cy="34.5" r="1.4" fill="${INK}"/>`,
      )
    case 'big':
      return pair(
        `<circle cx="24" cy="34" r="6" fill="#fff"/><circle cx="25" cy="35" r="3.3" fill="${INK}"/><circle cx="26" cy="33.8" r="1.2" fill="#fff"/>`,
      )
    case 'happy':
      return pair(`<path d="M20 36q4-5 8 0" ${stroke}/>`)
    case 'sleepy':
      return pair(`<path d="M20 34q4 3.5 8 0" ${stroke}/>`)
    case 'frog':
      return pair(
        `<circle cx="21" cy="20" r="7.5" fill="${a.body}"/><circle cx="21" cy="20" r="5" fill="#fff"/><circle cx="22" cy="21" r="2.6" fill="${INK}"/>`,
      )
    case 'cyclops':
      return `<circle cx="32" cy="33" r="9.5" fill="#fff"/><circle cx="33" cy="34" r="5" fill="${INK}"/><circle cx="34.5" cy="32" r="1.7" fill="#fff"/>`
    case 'visor':
      return `<rect x="16" y="28" width="32" height="11" rx="5.5" fill="${INK}"/>${pair(`<circle cx="24" cy="33.5" r="3" fill="#5ef0ff"/>`)}`
    case 'jack':
      return pair(`<path d="M18 37L24 28L29 37Z" fill="${INK}"/>`)
    case 'sly':
      return pair(`<path d="M19 31L29 35L27.5 38.5Q21 39 19 31Z" fill="${INK}"/>`)
  }
}

function mouth(a: AvatarDef): string {
  const stroke = `stroke="${INK}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"`
  switch (a.mouth) {
    case 'smile':
      return `<path d="M25 46q7 6 14 0" ${stroke}/>`
    case 'cat':
      return `<path d="M30 42h4l-2 2.6Z" fill="${INK}"/><path d="M27 46.5q2.5 3 5 0q2.5 3 5 0" ${stroke}/>`
    case 'nose':
      return `<ellipse cx="32" cy="42" rx="4" ry="3" fill="${INK}"/><path d="M32 45v2.5M28 48q4 3 8 0" ${stroke}/>`
    case 'beak':
      return `<path d="M27 42H37L32 49Z" fill="#ffa94d" stroke="#e8822a" stroke-width="1" stroke-linejoin="round"/>`
    case 'snout':
      return `<ellipse cx="32" cy="45" rx="8" ry="6" fill="${a.accent}" stroke="#e57a98" stroke-width="1.5"/>${pair(`<ellipse cx="29" cy="45" rx="1.6" ry="2.4" fill="${INK}"/>`)}`
    case 'grin':
      return `<path d="M23 44q9 12 18 0Z" fill="${INK}"/><ellipse cx="32" cy="50" rx="4" ry="2.2" fill="#ff6f91"/>`
    case 'fang':
      return `<path d="M24 45q8 6 16 0" ${stroke}/><path d="M28 47.3l1.4 3.6 1.6-3.1Z" fill="#fff"/>`
    case 'o':
      return `<ellipse cx="32" cy="47" rx="3.5" ry="4.5" fill="${INK}"/>`
    case 'jack':
      return `<path d="M20 43Q32 54 44 43L41 48L38 45L35 49L32 46L29 49L26 45L23 48Z" fill="${INK}"/>`
    case 'robot':
      return `<rect x="23" y="44" width="18" height="7" rx="2" fill="${INK}"/><path d="M27.5 44v7M32 44v7M36.5 44v7" stroke="${a.body}" stroke-width="1.2"/>`
  }
}

const cache = new Map<string, string>()

/** Find an avatar; unknown ids fall back to the first one. */
export function avatarDef(id: string | undefined): AvatarDef {
  return AVATARS.find((a) => a.id === id) ?? AVATARS[0]
}

/** Trusted inline SVG markup for an avatar (64×64 viewBox). */
export function avatarSvg(id: string | undefined): string {
  const a = avatarDef(id)
  let svg = cache.get(a.id)
  if (!svg) {
    svg =
      `<svg viewBox="0 0 64 64" aria-hidden="true">` +
      back(a) +
      ears(a) +
      head(a) +
      face(a) +
      eyes(a) +
      mouth(a) +
      front(a) +
      `</svg>`
    cache.set(a.id, svg)
  }
  return svg
}

export const isAvatarId = (id: unknown): id is string => typeof id === 'string' && AVATAR_IDS.includes(id)

/** A stable avatar for players who never picked one (e.g. older clients). */
export function defaultAvatar(seed: string): string {
  let hash = 0
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return AVATAR_IDS[hash % AVATAR_IDS.length]
}

/** The avatar to show for a player: their pick if known, else a stable default. */
export function avatarFor(player: { id: string; avatar?: string }): string {
  return isAvatarId(player.avatar) ? player.avatar : defaultAvatar(player.id)
}

const AVATAR_KEY = 'play-forge:avatar'
/** Fallback for when storage is blocked: the pick lasts for this page. */
let current: string | null = null

/** The local player's avatar, saved across visits. Pass an id to change it. */
export function storedAvatar(value?: string): string {
  if (isAvatarId(value)) current = value
  try {
    if (isAvatarId(value)) localStorage.setItem(AVATAR_KEY, value)
    const saved = localStorage.getItem(AVATAR_KEY)
    if (isAvatarId(saved)) return (current = saved)
  } catch {
    // storage unavailable
  }
  // First visit: pick one at random and keep it.
  current ??= AVATAR_IDS[Math.floor(Math.random() * AVATAR_IDS.length)]
  try {
    localStorage.setItem(AVATAR_KEY, current)
  } catch {
    // storage unavailable
  }
  return current
}
