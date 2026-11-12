import type { QualityLevel } from '@forge/render3d'
import type { GraphicsPref, LookTier } from './look'

// The view's quality ladder (the engine governor owns it). Three looks (look.ts):
//   high   = soft real shadows (players + park), bloom on the lamps, colour grade, ambient occlusion;
//   medium = the same without AO;
//   low    = lit scenery, blob shadows only, no post passes (frames draw straight to the canvas).
// Then resolution steps down to DPR 1. The player can pin a look (View settings → Graphics); the governor
// then only steps the resolution.

const HIGH: QualityLevel = { dpr: Infinity, bloom: true, shadows: true, ao: true }
const MEDIUM: QualityLevel = { dpr: Infinity, bloom: true, shadows: true, ao: false }
const LOW: QualityLevel = { dpr: Infinity, bloom: false, shadows: false, ao: false }
const TIERS: Record<LookTier, QualityLevel> = { high: HIGH, medium: MEDIUM, low: LOW }

/** A look at a lower pixel-ratio cap. */
const at = (level: QualityLevel, dpr: number): QualityLevel => ({ ...level, dpr })

/** Which look a ladder level draws. */
export function spTier(level: QualityLevel): LookTier {
  if (level.ao) return 'high'
  return level.shadows === false ? 'low' : 'medium'
}

/** The ladder for a graphics pref: Auto walks every look then the resolution; a pinned look only the resolution. */
export function spLadder(pref: GraphicsPref): readonly QualityLevel[] {
  if (pref !== 'auto') {
    const look = TIERS[pref]
    return [look, at(look, 1.5), at(look, 1)]
  }
  return [HIGH, MEDIUM, LOW, at(LOW, 1.5), at(LOW, 1)]
}

/** The Auto ladder. */
export const SP_QUALITY: readonly QualityLevel[] = spLadder('auto')

/** Auto checks frames for this much rally time (s) per page, then settles (Scene3D.lockQuality) and saves. */
export const AUTO_CHECK_SECS = 45

/** What the browser tells about the device (all read locally, never sent anywhere). */
export interface DeviceInfo {
  /** WebGL renderer string ('' when hidden, e.g. Firefox / privacy modes). */
  gpu: string
  /** Logical CPU cores (navigator.hardwareConcurrency), 0 = unknown. */
  cores: number
  /** Memory in GB (navigator.deviceMemory, Chrome only), 0 = unknown. */
  memGB: number
  /** Screen device pixels (width × height × DPR). */
  pixels: number
  /** Touch-first device (phone / tablet). */
  touch: boolean
}

/** Strong GPUs: Apple M-series, desktop discrete NVIDIA / AMD. */
const STRONG_GPU = /apple m\d|nvidia|geforce|rtx|gtx|radeon (rx|pro)|radeon\(tm\) rx/i
/** Weak GPUs: mobile Mali, older Adreno (3xx–5xx), PowerVR, old Intel HD / software renderers. */
const WEAK_GPU =
  /mali|adreno \(tm\) [345]\d\d|adreno [345]\d\d|powervr|intel\(r\) hd graphics( [2-5]\d{3})?$|swiftshader|llvmpipe|software/i

/**
 * Auto's starting look from the device: High on strong GPUs (not on phones / tablets, which have small
 * thermals), Low on weak GPUs or small hardware (≤ 4 cores, ≤ 4 GB), Medium otherwise and whenever the
 * signals are hidden. The check window then corrects it either way.
 */
export function estimateTier(d: DeviceInfo): LookTier {
  if (WEAK_GPU.test(d.gpu)) return 'low'
  if ((d.cores > 0 && d.cores <= 4) || (d.memGB > 0 && d.memGB <= 4)) return 'low'
  if (!d.touch && STRONG_GPU.test(d.gpu)) return 'high'
  return 'medium'
}

/** The device signals, from the game's own WebGL context (`gl`; no extra context). */
export function readDevice(gl: WebGLRenderingContext | WebGL2RenderingContext, touch: boolean): DeviceInfo {
  let gpu: string
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    gpu = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '')
  } catch {
    gpu = ''
  }
  const nav = globalThis.navigator as Navigator & { deviceMemory?: number }
  const scr = globalThis.screen
  const dpr = globalThis.devicePixelRatio || 1
  return {
    gpu,
    cores: nav?.hardwareConcurrency || 0,
    memGB: nav?.deviceMemory || 0,
    pixels: scr ? scr.width * scr.height * dpr * dpr : 0,
    touch,
  }
}

/** Where Auto settled last time (this browser): a ladder index, or null. */
export const AUTO_LEVEL_KEY = 'play-forge:shuttle-pop:auto-level'

type Store = Pick<Storage, 'getItem' | 'setItem'>
function local(): Store | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/** The saved Auto level, if valid for the Auto ladder (anything else: null, start from the estimate). */
export function loadAutoLevel(store: Store | null = local()): number | null {
  try {
    const raw = store?.getItem(AUTO_LEVEL_KEY) ?? null
    const n = Number(raw)
    return raw !== null && raw !== '' && Number.isInteger(n) && n >= 0 && n < SP_QUALITY.length ? n : null
  } catch {
    return null
  }
}

/** Save where Auto settled (blocked / full storage: ignored, the estimate is used next time). */
export function saveAutoLevel(level: number, store: Store | null = local()): void {
  try {
    store?.setItem(AUTO_LEVEL_KEY, String(level))
  } catch {
    // keep going: only a starting hint
  }
}

/**
 * Where the ladder starts. Auto: where it settled last time in this browser (`saved`), else the device
 * estimate's look (`tier`, at full resolution), else Medium. A pinned look starts at full resolution.
 */
export function spStartLevel(
  pref: GraphicsPref = 'auto',
  start: { tier?: LookTier; saved?: number | null } = {},
): number {
  if (pref !== 'auto') return 0
  if (start.saved !== undefined && start.saved !== null) return start.saved
  return SP_QUALITY.indexOf(TIERS[start.tier ?? 'medium'])
}
