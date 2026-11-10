// Inline SVG icons (24×24, stroke = currentColor) so games stay single-file.
const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`

export const icons = {
  home: svg('<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/>'),
  soundOn: svg(
    '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  ),
  soundOff: svg('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="m16 9.5 5 5m0-5-5 5"/>'),
  camera: svg('<path d="M4 8.5h3.2L9 6h6l1.8 2.5H20v10H4z"/><circle cx="12" cy="13.5" r="3.3"/>'),
  pause: svg('<path d="M9 5.5v13M15 5.5v13"/>'),
  leave: svg('<path d="M14 4.5h4.5v15H14"/><path d="M10 8l-4 4 4 4M6 12h9"/>'),
  copy: svg(
    '<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
  ),
  check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  more: svg(
    '<circle cx="5.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18.5" cy="12" r="1.2"/>',
  ),
  react: svg(
    '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14.5q3.5 3 7 0"/><path d="M9 9.5v.5M15 9.5v.5"/>',
  ),
  chat: svg(
    '<path d="M4.5 6.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H11l-4.5 3.5v-3.5h0a2 2 0 0 1-2-2z"/><path d="M8.5 9.5h7M8.5 12.5h4"/>',
  ),
  send: svg('<path d="M4.5 12 19.5 4.5 15 19.5l-3-6z"/><path d="m12 13.5 7.5-9"/>'),
  mic: svg(
    '<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5"/>',
  ),
  micOff: svg(
    '<path d="M15 10V6.5a3 3 0 0 0-5.6-1.5M9 9v2.5a3 3 0 0 0 4.6 2.5M5.5 11.5a6.5 6.5 0 0 0 10.4 5.2M18.5 11.5a6.4 6.4 0 0 1-.6 2.7M12 18v2.5M4 4l16 16"/>',
  ),
  headset: svg(
    '<path d="M4.5 15v-3a7.5 7.5 0 0 1 15 0v3"/><rect x="3.5" y="13.5" width="4" height="6" rx="1.5"/><rect x="16.5" y="13.5" width="4" height="6" rx="1.5"/>',
  ),
  users: svg(
    '<circle cx="9" cy="8.5" r="3"/><path d="M3.5 19c.5-3 2.8-4.5 5.5-4.5s5 1.5 5.5 4.5"/><path d="M15.5 6a3 3 0 0 1 0 5.5M17.5 14.8c1.7.6 2.7 2 3 4.2"/>',
  ),
  fullscreen: svg('<path d="M4.5 9V4.5H9M15 4.5h4.5V9M19.5 15v4.5H15M9 19.5H4.5V15"/>'),
  fullscreenExit: svg('<path d="M9 4.5V9H4.5M19.5 9H15V4.5M15 19.5V15h4.5M4.5 15H9v4.5"/>'),
  /** Signal bars: the Network status button. */
  network: svg('<path d="M5 19.5V16M10 19.5v-7M15 19.5v-10M20 19.5v-14"/>'),
  cross: svg('<path d="m6.5 6.5 11 11m0-11-11 11"/>'),
  crown: svg('<path d="M4 17.5h16M5 15 4 7.5l4.5 3.5L12 5.5l3.5 5.5L20 7.5 19 15z"/>'),
}

// Input icons for the control guide (engine/ui/guide.ts): a finer stroke, since they sit beside
// keycaps at text size. Filled parts use fill="currentColor".
const fine = (body: string) =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`
const MOUSE = '<rect x="6.5" y="3" width="11" height="18" rx="5.5"/><path d="M12 3v6.5M6.5 9.5h11"/>'
const FILL = 'fill="currentColor" stroke="none"'
const HAND =
  '<path d="M10 14V7a1.5 1.5 0 0 1 3 0v5"/><path d="M13 11.5a1.5 1.5 0 0 1 3 0V13"/><path d="M16 12.5a1.5 1.5 0 0 1 3 0V17a5 5 0 0 1-5 5h-1.5a5 5 0 0 1-3.9-1.9L5.2 16.6a1.5 1.5 0 0 1 2.3-1.9L10 17"/>'

export const inputIcons = {
  mouseClick: fine(`${MOUSE}<path d="M12 3a5.5 5.5 0 0 0-5.5 5.5v1H12z" ${FILL}/>`),
  mouseRight: fine(`${MOUSE}<path d="M12 3a5.5 5.5 0 0 1 5.5 5.5v1H12z" ${FILL}/>`),
  mouseScroll: fine(`${MOUSE}<path d="M12 5v3" stroke-width="3"/>`),
  mouseDrag: fine(
    `${MOUSE}<path d="M12 3a5.5 5.5 0 0 0-5.5 5.5v1H12z" ${FILL}/><path d="M2 12h2.5M19.5 12H22"/>`,
  ),
  tap: fine(`${HAND}<path d="M7.5 7a4 4 0 0 1 8 0"/>`),
  doubleTap: fine(`${HAND}<path d="M8.2 7a3.3 3.3 0 0 1 6.6 0M5.7 7a5.8 5.8 0 0 1 11.6 0"/>`),
  touchHold: fine(`${HAND}<circle cx="11.5" cy="7" r="4.5" stroke-dasharray="2.2 1.8"/>`),
  swipe: fine(`${HAND}<path d="M4 3h14M15.5 1 18 3l-2.5 2"/>`),
  swipeUp: fine(`${HAND}<path d="M5 11V3M2.8 5.2 5 3l2.2 2.2"/>`),
  /** A virtual stick: drag to steer. */
  stick: fine(
    `<circle cx="12" cy="12" r="9" stroke-dasharray="2.4 2.4"/><circle cx="14.5" cy="9.5" r="3.8" ${FILL}/>`,
  ),
  /** A landscape phone with its left half marked: drag on the left side. */
  leftSide: fine(
    `<rect x="1.5" y="5.5" width="21" height="13" rx="2.5"/><rect x="3.5" y="7.5" width="8" height="9" rx="1.5" fill="currentColor" fill-opacity=".3" stroke="none"/><circle cx="7.5" cy="12" r="2.2" ${FILL}/>`,
  ),
  /** A round on-screen action button. */
  touchButton: fine(`<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5" ${FILL}/>`),
  keyboard: fine(
    '<rect x="2" y="6" width="20" height="12" rx="2.5"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"/>',
  ),
}
