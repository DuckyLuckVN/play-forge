// Inline SVG icons (24×24, stroke = currentColor) so games stay single-file.
const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`

export const icons = {
  home: svg('<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/>'),
  soundOn: svg(
    '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  ),
  soundOff: svg('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="m16 9.5 5 5m0-5-5 5"/>'),
  pause: svg('<path d="M9 5.5v13M15 5.5v13"/>'),
  leave: svg('<path d="M14 4.5h4.5v15H14"/><path d="M10 8l-4 4 4 4M6 12h9"/>'),
  copy: svg('<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>'),
  check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  crown: svg('<path d="M4 17.5h16M5 15 4 7.5l4.5 3.5L12 5.5l3.5 5.5L20 7.5 19 15z"/>'),
}
