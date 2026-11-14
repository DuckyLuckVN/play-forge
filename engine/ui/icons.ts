// Shell icons: Font Awesome Free (solid) as inline SVG, so games stay single-file and nothing is
// fetched at run time (no webfont, no CDN). Only the icons imported here are bundled.
//
// Font Awesome Free by Fonticons, Inc. (https://fontawesome.com): icons CC BY 4.0, code MIT
// (https://fontawesome.com/license/free).
import {
  faCamera,
  faCheck,
  faChevronDown,
  faCommentDots,
  faCompress,
  faCopy,
  faCrown,
  faEllipsis,
  faExpand,
  faFaceSmile,
  faGear,
  faHeadset,
  faHouse,
  faMicrophone,
  faMicrophoneSlash,
  faMountainSun,
  faPaperPlane,
  faPause,
  faRightFromBracket,
  faSliders,
  faSignal,
  faUserGroup,
  faVolumeHigh,
  faVolumeXmark,
  faXmark,
} from '@fortawesome/free-solid-svg-icons'
import type { IconDefinition } from '@fortawesome/free-solid-svg-icons'

/** Icon box (px): the glyph is fitted inside, keeping its proportions; fill = currentColor. */
const SIZE = 20

/** An FA icon definition as an inline SVG string (fill = currentColor, decorative). */
export function faSvg(def: IconDefinition, size = SIZE): string {
  const [w, h, , , path] = def.icon
  const d = Array.isArray(path) ? path.join(' ') : path
  return `<svg viewBox="0 0 ${w} ${h}" width="${size}" height="${size}" fill="currentColor" aria-hidden="true"><path d="${d}"/></svg>`
}

export const icons = {
  /** A landscape: mountains under a sun (background picker). */
  scene: faSvg(faMountainSun),
  home: faSvg(faHouse),
  soundOn: faSvg(faVolumeHigh),
  soundOff: faSvg(faVolumeXmark),
  camera: faSvg(faCamera),
  /** Sliders: a settings panel (e.g. a game's view settings). */
  settings: faSvg(faSliders),
  /** A gear: the shell's settings sheet (engine/ui/settings-sheet.ts). */
  gear: faSvg(faGear),
  pause: faSvg(faPause),
  leave: faSvg(faRightFromBracket),
  copy: faSvg(faCopy),
  check: faSvg(faCheck),
  more: faSvg(faEllipsis),
  react: faSvg(faFaceSmile),
  chat: faSvg(faCommentDots),
  send: faSvg(faPaperPlane),
  mic: faSvg(faMicrophone),
  micOff: faSvg(faMicrophoneSlash),
  headset: faSvg(faHeadset),
  users: faSvg(faUserGroup),
  fullscreen: faSvg(faExpand),
  fullscreenExit: faSvg(faCompress),
  /** Signal bars: the Network status button. */
  network: faSvg(faSignal),
  cross: faSvg(faXmark),
  crown: faSvg(faCrown),
  /** A dropdown's open-me caret (engine/ui/dropdown.ts). */
  chevronDown: faSvg(faChevronDown, 14),
}

// Input icons for the control guide (engine/ui/guide.ts): a finer stroke, since they sit beside
// keycaps at text size. Filled parts use fill="currentColor".
const fine = (body: string) =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`
const MOUSE = '<rect x="6.5" y="3" width="11" height="18" rx="5.5"/><path d="M12 3v6.5M6.5 9.5h11"/>'
const FILL = 'fill="currentColor" stroke="none"'
/** The pressed mouse button (the guide colours it: guide.css .pf-mouse-on). */
const PRESSED = `class="pf-mouse-on" ${FILL}`
const HAND =
  '<path d="M10 14V7a1.5 1.5 0 0 1 3 0v5"/><path d="M13 11.5a1.5 1.5 0 0 1 3 0V13"/><path d="M16 12.5a1.5 1.5 0 0 1 3 0V17a5 5 0 0 1-5 5h-1.5a5 5 0 0 1-3.9-1.9L5.2 16.6a1.5 1.5 0 0 1 2.3-1.9L10 17"/>'

export const inputIcons = {
  mouseClick: fine(`${MOUSE}<path d="M12 3a5.5 5.5 0 0 0-5.5 5.5v1H12z" ${PRESSED}/>`),
  mouseRight: fine(`${MOUSE}<path d="M12 3a5.5 5.5 0 0 1 5.5 5.5v1H12z" ${PRESSED}/>`),
  mouseScroll: fine(`${MOUSE}<path class="pf-mouse-on" d="M12 5v3" stroke-width="3"/>`),
  mouseDrag: fine(
    `${MOUSE}<path d="M12 3a5.5 5.5 0 0 0-5.5 5.5v1H12z" ${PRESSED}/><path d="M2 12h2.5M19.5 12H22"/>`,
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
