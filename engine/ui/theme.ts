/**
 * Design tokens: the single source of truth for colours. CSS reads them as
 * custom properties (applied by `applyTheme`), canvas renderers import them.
 */
export const theme = {
  night: '#161a3a', // page background
  felt: '#222859', // panels, table surfaces
  rim: '#343b7a', // borders, raised edges
  pit: '#10132c', // sunken areas: inputs, game boards
  chalk: '#f4f1ff', // primary text
  haze: '#a3a8d6', // secondary text
  yolk: '#ffc83d', // primary action
  yolkEdge: '#c98f00',
  ink: '#2b1d00', // text on yolk
  coral: '#ff6b6b', // danger, errors
} as const

/** Player token colours, by seat. Distinct from each other and from `yolk`. */
export const PLAYER_COLORS = [
  '#4be3a0',
  '#5ab8ff',
  '#ff9f43',
  '#ff6fb5',
  '#b48cff',
  '#2ed3d3',
  '#f2e85c',
  '#ff6b6b',
]

export const playerColor = (slot: number) => PLAYER_COLORS[slot % PLAYER_COLORS.length]

export const FONT = "'Fredoka', ui-rounded, system-ui, sans-serif"

export function applyTheme(root: HTMLElement = document.documentElement): void {
  for (const [key, value] of Object.entries(theme)) {
    root.style.setProperty(`--pf-${key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}`, value)
  }
}
