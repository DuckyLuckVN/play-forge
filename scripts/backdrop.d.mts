/** A pixel rect: x, y, width, height (art pixels) and a CSS colour. */
export type PixelRect = [x: number, y: number, w: number, h: number, color: string]
/** An SVG data URL (as a CSS `url(...)`) from rects on a w×h pixel grid. */
export function svgUrl(w: number, h: number, rects: PixelRect[]): string
/** Rects for ASCII art: one character per pixel, `.` or an unknown key is empty. */
export function spriteRects(rows: string[], colors: Record<string, string>): PixelRect[]
/** An ASCII sprite as a CSS `url(...)`. */
export function sprite(rows: string[], colors: Record<string, string>): string
/** A seamlessly tiling ridge: waves are [amplitude, whole cycles per tile, phase]. */
export function ridgeRects(
  w: number,
  h: number,
  base: number,
  waves: [amp: number, cycles: number, phase: number][],
  body: string,
  edge: string,
): PixelRect[]
/** Rects for a filled circle of radius r centred on a size×size grid. */
export function discRects(size: number, r: number, color: string): PixelRect[]
/** A [body, lit edge] colour pair. */
type Pair = [body: string, edge: string]
/** Every colour of the backdrop scene; shapes and motion are shared. */
export interface BackdropTheme {
  /** Sky bands top to bottom: [colour, ends at %]; the last ends at 100. */
  sky: [color: string, to: number][]
  stars: boolean
  /** Sun (or moon): two halo rings, core, inner disc, shine; `high` = top of the sky instead of on the horizon. */
  sun: { halo: [string, string]; core: string; inner: string; shine: string; high: boolean }
  cloud: [light: string, shade: string]
  far: Pair
  near: Pair
  ground: { grass: string; grassDark: string; dirt: string; mortar: string }
}
export type BackdropThemeKey = 'sunset' | 'autumn' | 'canyon' | 'candy' | 'day' | 'night'
export const THEMES: Record<BackdropThemeKey, BackdropTheme>
/** CSS for the backdrop with every theme given: `fallback` (or the first) is the default, the rest apply with data-bd="<key>". */
export function backdropCss(themes?: Record<string, BackdropTheme>, fallback?: string): string
/** The backdrop CSS with every theme (canyon when nothing is chosen). */
export const BACKDROP_CSS: string
/** A theme key, or "random" (one theme per visit). */
export type BackdropChoice = 'random' | BackdropThemeKey
/** localStorage key for the choice (sessionStorage holds this visit's random pick). */
export const BACKDROP_KEY: string
/** The theme shown until the player picks one. */
export const DEFAULT_BACKDROP: BackdropThemeKey
/** Random first, then every theme. */
export const BACKDROP_CHOICES: BackdropChoice[]
/** Sets data-bd on the element from the saved choice; returns the theme shown. */
export function applyBackdropChoice(
  el: Element | null,
  keys: string[],
  fallback: string,
  random?: () => number,
): BackdropThemeKey
/** The saved choice (canyon if nothing is saved). */
export function getBackdropChoice(): BackdropChoice
/** Saves the choice; "random" rolls a new theme for this visit. */
export function saveBackdropChoice(choice: BackdropChoice): void
/** Inline splash script that applies the choice before first paint (goes right after the backdrop markup). */
export const BACKDROP_PICK_JS: string
/** The decorative backdrop element's markup (aria-hidden, static). */
export function backdropMarkup(): string
