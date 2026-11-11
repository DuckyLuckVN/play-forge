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
/** Standalone CSS for the pixel-arcade backdrop (raw colours, no tokens). */
export const BACKDROP_CSS: string
/** The decorative backdrop element's markup (aria-hidden, static). */
export function backdropMarkup(): string
