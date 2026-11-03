// Boost card thumbnails: 56×56 inline SVGs drawn in currentColor (the card sets
// it to the rarity colour). Trusted, static markup.
import type { BoostId } from './sim/types'

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56" width="56" height="56" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`

const ball = (cx: number, cy: number, r = 6) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="currentColor" stroke="none"/>`

export const BOOST_ICONS: Record<BoostId, string> = {
  damage: svg('<path d="M14 42 34 22"/><path d="M30 14h12v12"/><path d="M12 30l14 14"/>' + ball(40, 16, 4)),
  balls: svg(ball(18, 36) + ball(30, 26) + ball(42, 16) + '<path d="M40 38h10M45 33v10"/>'),
  coins: svg('<circle cx="24" cy="30" r="12"/><circle cx="34" cy="22" r="12"/><path d="M34 16v12"/>'),
  speed: svg('<path d="M8 20h18M4 30h20M10 40h14"/>' + ball(38, 30, 9)),
  pierce: svg(
    '<rect x="22" y="14" width="12" height="28" rx="3"/><path d="M6 28h44"/><path d="M42 22l8 6-8 6"/>',
  ),
  crit: svg('<path d="M28 6l5 15h16l-13 9 5 16-13-10-13 10 5-16L7 21h16z"/>'),
  bouncy: svg('<path d="M6 8v40M50 8v40"/><path d="M10 40 24 16l14 24 10-18"/>' + ball(24, 16, 4)),
  double: svg(ball(20, 28, 8) + ball(38, 28, 8) + '<path d="M28 12v-4M28 48v-4"/>'),
  fireball: svg(
    '<path d="M28 6c4 8 14 12 14 24a14 14 0 0 1-28 0c0-6 4-10 6-14 2 4 4 6 8 6-2-6-2-12 0-16z" fill="currentColor" fill-opacity=".25"/>',
  ),
  bombball: svg(
    '<circle cx="26" cy="32" r="14" fill="currentColor" fill-opacity=".25"/><path d="M34 20l6-6"/><path d="M42 8l2 2M46 12l2-1M44 6l1-2"/>',
  ),
  twin: svg(
    ball(28, 42) + '<path d="M28 36V26M28 26 16 12M28 26l12-14"/>' + ball(16, 12, 4) + ball(40, 12, 4),
  ),
  big: svg(
    '<circle cx="28" cy="28" r="16" fill="currentColor" fill-opacity=".25"/><path d="M6 6l8 8M50 6l-8 8M6 50l8-8M50 50l-8-8"/>',
  ),
  lightning: svg('<path d="M32 4 14 30h12l-4 22 20-28H30z" fill="currentColor" fill-opacity=".25"/>'),
  aftershock: svg(
    '<rect x="20" y="20" width="16" height="16" rx="3"/><path d="M28 4v8M28 44v8M4 28h8M44 28h8"/>',
  ),
  magnet: svg('<path d="M14 10v18a14 14 0 0 0 28 0V10"/><path d="M14 18h8M34 18h8"/>'),
  midas: svg(
    '<circle cx="28" cy="28" r="16"/><path d="M28 18v20M22 22h9a4 4 0 0 1 0 8h-6a4 4 0 0 0 0 8h9"/>',
  ),
  keeper: svg('<circle cx="28" cy="30" r="18"/><path d="M28 18v12l8 6"/><path d="M22 6h12"/>'),
  brain: svg(
    '<path d="M22 12a8 8 0 0 0-10 10 8 8 0 0 0 2 14 8 8 0 0 0 14 6V12a6 6 0 0 0-6 0zM34 12a8 8 0 0 1 10 10 8 8 0 0 1-2 14 8 8 0 0 1-14 6"/>',
  ),
  glass: svg(
    '<path d="M18 6h20l-4 20a6 6 0 0 1-12 0z"/><path d="M28 32v14M18 48h20"/><path d="M24 14l6 6"/>',
  ),
  eagle: svg(
    '<path d="M4 28c8-10 16-14 24-14s16 4 24 14c-8 10-16 14-24 14S12 38 4 28z"/><circle cx="28" cy="28" r="6"/><path d="M28 6v4M28 46v4"/>',
  ),
  secondWind: svg('<path d="M6 20h26a6 6 0 1 0-6-6"/><path d="M6 30h36a6 6 0 1 1-6 6"/><path d="M6 40h18"/>'),
}
