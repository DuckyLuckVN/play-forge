// Timing calibration: tap along to a metronome; the median gap between your
// taps and the clicks is your offset (audio output delay + how you hear it).
// Saved in this browser only, and used to judge Perfect / Good, never hits.

import { playSound, type Sound } from '@forge/audio/sound'
import { h } from '@forge/ui/dom'
import { MAX_LATENCY, TICK_RATE } from './sim'

const KEY = 'play-forge:synthstride:latency'
export const MAX_OFFSET_MS = Math.round((MAX_LATENCY * 1000) / TICK_RATE)
const BPM = 100
const BEATS = 12
/** Clicks before these are a count-in and not measured. */
const COUNT_IN = 4

type Store = Pick<Storage, 'getItem' | 'setItem'>
function local(): Store | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function loadOffset(store: Store | null = local()): number {
  const v = Number(store?.getItem(KEY))
  return Number.isFinite(v) ? Math.max(0, Math.min(MAX_OFFSET_MS, Math.round(v))) : 0
}

export function saveOffset(ms: number, store: Store | null = local()): void {
  try {
    store?.setItem(KEY, String(Math.max(0, Math.min(MAX_OFFSET_MS, Math.round(ms)))))
  } catch {
    // storage blocked: the offset lasts for this page only
  }
}

/** Offset in ms → sim ticks (what the game is told). */
export const offsetTicks = (ms: number) =>
  Math.max(0, Math.min(MAX_LATENCY, Math.round((ms * TICK_RATE) / 1000)))

/**
 * Median lateness of taps against the nearest click (ms), or null with fewer
 * than 4 usable taps. Taps more than 300 ms from any click are ignored; early
 * taps count as no delay (an offset can only make you earlier).
 */
export function estimateOffset(clicks: readonly number[], taps: readonly number[]): number | null {
  const gaps = taps.map((tap) => tapOffset(tap, clicks)).filter((g) => Math.abs(g) <= 300)
  if (gaps.length < 4) return null
  gaps.sort((a, b) => a - b)
  const mid = gaps.length / 2
  const median = gaps.length % 2 ? gaps[Math.floor(mid)] : (gaps[mid - 1] + gaps[mid]) / 2
  return Math.max(0, Math.min(MAX_OFFSET_MS, Math.round(median)))
}

/** How late (+) or early (−) one tap was against the nearest click, in ms. */
export function tapOffset(tap: number, clicks: readonly number[]): number {
  let best = Infinity
  for (const c of clicks) if (Math.abs(tap - c) < Math.abs(best)) best = tap - c
  return best
}

const CLICK: Sound = [
  { freq: 1500, dur: 0.03, wave: 'square', vol: 0.25 },
  { freq: 150, to: 50, dur: 0.08, wave: 'sine', vol: 0.5 },
]
const ACCENT: Sound = [
  { freq: 2000, dur: 0.04, wave: 'square', vol: 0.3 },
  { freq: 170, to: 50, dur: 0.1, wave: 'sine', vol: 0.6 },
]

type T = (en: string, params?: Record<string, string | number>) => string

/**
 * What a key does while the calibration dialog is open. While measuring,
 * Space / Enter are taps and nothing else on the page may see them (they used
 * to re-click the focused menu button and stack overlays). Afterwards they
 * press the focused dialog button. Escape always closes.
 */
export function calibrationKey(code: string, measuring: boolean): 'tap' | 'block' | 'pass' | 'close' {
  if (code === 'Escape') return 'close'
  if (!measuring) return 'pass'
  return code === 'Space' || code === 'Enter' ? 'tap' : 'block'
}

/** The open dialog, if any: only ever one. */
let openDialog: HTMLElement | null = null

/** Start-screen row: a "Calibrate timing" button carrying the saved offset as a highlighted chip. */
export function calibrationRow(t: T): HTMLElement {
  const value = h('span', {
    style:
      'display:inline-block;margin-left:8px;padding:1px 9px;border-radius:999px;font-weight:700;font-variant-numeric:tabular-nums',
  })
  const show = (pulse = false) => {
    const ms = loadOffset()
    value.textContent = `${ms} ms`
    value.style.background = ms > 0 ? 'var(--pf-yolk)' : 'rgb(255 255 255 / 0.14)'
    value.style.color = ms > 0 ? 'var(--pf-ink)' : 'inherit'
    if (pulse && !matchMedia?.('(prefers-reduced-motion: reduce)').matches)
      value.animate(
        [
          { transform: 'scale(1.35)', boxShadow: '0 0 0 6px rgb(255 216 77 / 0.5)' },
          { transform: 'scale(1)' },
        ],
        { duration: 600, easing: 'cubic-bezier(.2,.9,.3,1.3)' },
      )
  }
  show()
  const button = h('button', { type: 'button', class: 'pf-btn' }, t('Calibrate timing'), value)
  button.onclick = () => openCalibration(t, () => show(true), button)
  return h(
    'div',
    { class: 'pf-option', style: 'gap:8px' },
    h('span', { class: 'pf-option-label', textContent: t('Timing offset') }),
    button,
  )
}

const link =
  'background:none;border:0;padding:4px 8px;color:inherit;opacity:.75;font:inherit;text-decoration:underline;cursor:pointer'
const MEASURED = BEATS - COUNT_IN

/**
 * The calibration popup. It starts listening as soon as it opens: a count-in,
 * then one dot per click that turns green (on time) or gold (off) when you
 * tap. Then the result, saved only when you press Save.
 */
function openCalibration(t: T, saved: () => void, opener: HTMLElement) {
  if (openDialog) return
  const gap = 60_000 / BPM
  const body = h('div', { style: 'display:grid;gap:14px;justify-items:center;margin-top:8px' })
  const heading = h('h2', { class: 'pf-heading', textContent: t('Calibrate timing') })
  heading.id = 'pf-calibrate-title'
  const panel = h(
    'div',
    { class: 'pf-panel', style: 'width:min(340px,100%);text-align:center', tabIndex: -1 },
    heading,
    body,
  )
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-modal', 'true')
  panel.setAttribute('aria-labelledby', heading.id)
  const backdrop = h(
    'div',
    {
      style:
        'position:fixed;inset:0;z-index:50;display:grid;place-items:center;background:rgb(5 3 15 / .8);padding:16px',
    },
    panel,
  )
  document.body.append(backdrop)
  openDialog = backdrop

  let timers: number[] = []
  let measuring = false
  let onTap: (() => void) | null = null
  const stop = () => {
    for (const id of timers) clearTimeout(id)
    timers = []
    measuring = false
    onTap = null
  }
  const close = () => {
    stop()
    window.removeEventListener('keydown', onKey, true)
    window.removeEventListener('keyup', onKey, true)
    backdrop.remove()
    openDialog = null
    opener.focus()
  }
  const onKey = (e: KeyboardEvent) => {
    const action = calibrationKey(e.code, measuring)
    if (action === 'pass') return
    e.preventDefault()
    e.stopPropagation()
    if (action === 'close') close()
    else if (action === 'tap' && e.type === 'keydown' && !e.repeat) onTap?.()
  }
  const onPointer = (e: PointerEvent) => {
    if (!measuring || e.target instanceof HTMLButtonElement) return
    e.preventDefault()
    onTap?.()
  }
  const quiet = (label: string, onClick: () => void) => {
    const b = h('button', { type: 'button', style: link, textContent: label })
    b.onclick = onClick
    return b
  }
  const links = (...items: HTMLElement[]) =>
    h(
      'div',
      { style: 'display:flex;gap:4px;justify-content:center;align-items:center' },
      ...items.flatMap((el, i) => (i ? [h('span', { textContent: '·', style: 'opacity:.5' }), el] : [el])),
    )

  const listen = () => {
    stop()
    measuring = true
    // Focus off every button, so Space / Enter only count as taps.
    panel.focus()
    // The target: a circle, and a ring that shrinks onto it, landing exactly on each click.
    const label = h('span', { style: 'font-size:30px;font-weight:800;line-height:1' })
    const circle = h(
      'div',
      {
        style:
          'position:absolute;inset:24px;border-radius:50%;display:grid;place-items:center;background:rgb(95 243 255 / .18);border:3px solid #5ff3ff',
      },
      label,
    )
    const ring = h('div', {
      style:
        'position:absolute;inset:24px;border-radius:50%;border:3px solid #fff;opacity:0;pointer-events:none',
    })
    const big = h('div', { style: 'position:relative;width:132px;height:132px' }, circle, ring)
    const dots = Array.from({ length: MEASURED }, () =>
      h('span', {
        style:
          'width:16px;height:16px;border-radius:50%;background:rgb(255 255 255 / .15);transition:background 120ms',
      }),
    )
    const tapped = new Set<number>()
    body.replaceChildren(
      big,
      h('p', {
        class: 'pf-lede',
        style: 'margin:0',
        textContent: t('Tap Space, Enter or the screen when the ring meets the circle.'),
      }),
      h('div', { style: 'display:flex;gap:10px' }, ...dots),
      links(quiet(t('Cancel'), close)),
    )
    const begin = performance.now() + 700
    const clicks = Array.from({ length: BEATS }, (_, i) => begin + i * gap)
    const measured = clicks.slice(COUNT_IN)
    const taps: number[] = []
    onTap = () => {
      const now = performance.now()
      circle.animate([{ transform: 'scale(.9)' }, { transform: 'scale(1)' }], { duration: 120 })
      if (now < measured[0] - 300) return // still counting in
      taps.push(now)
      const i = Math.max(0, Math.min(MEASURED - 1, Math.round((now - measured[0]) / gap)))
      tapped.add(i)
      dots[i].style.background = Math.abs(tapOffset(now, measured)) <= 40 ? '#7dffb0' : '#ffd84d'
    }
    clicks.forEach((at, i) => {
      // The ring starts closing one beat ahead…
      timers.push(
        window.setTimeout(
          () =>
            ring.animate(
              [
                { transform: 'scale(2)', opacity: 0 },
                { transform: 'scale(1.6)', opacity: 0.9, offset: 0.35 },
                { transform: 'scale(1)', opacity: 1 },
              ],
              { duration: gap, easing: 'linear', fill: 'forwards' },
            ),
          at - gap - performance.now(),
        ),
      )
      // …and meets the circle on the click: flash, count-in number or "Tap!".
      timers.push(
        window.setTimeout(() => {
          playSound(i % 4 === 0 ? ACCENT : CLICK)
          label.textContent = i < COUNT_IN ? String(COUNT_IN - i) : t('Tap!')
          circle.animate([{ background: 'rgb(255 255 255 / .9)' }, { background: 'rgb(95 243 255 / .18)' }], {
            duration: 220,
          })
          const k = i - COUNT_IN
          if (k >= 0 && !tapped.has(k)) dots[k].style.background = 'rgb(255 255 255 / .45)'
        }, at - performance.now()),
      )
    })
    timers.push(
      window.setTimeout(
        () => {
          const result = estimateOffset(measured, taps)
          stop()
          showResult(result)
        },
        clicks[BEATS - 1] + gap / 2 - performance.now(),
      ),
    )
  }

  /** The result (or a retry), with one main button. */
  const showResult = (ms: number | null) => {
    const main = h('button', {
      type: 'button',
      class: 'pf-btn primary wide',
      textContent: ms === null ? t('Try again') : t('Save {ms} ms', { ms }),
    })
    main.onclick =
      ms === null
        ? listen
        : () => {
            saveOffset(ms)
            saved()
            close()
          }
    body.replaceChildren(
      ms === null
        ? h('p', {
            class: 'pf-lede',
            style: 'margin:0',
            textContent: t('Not enough taps. Tap once on every click.'),
          })
        : h('div', { style: 'font-size:52px;font-weight:800;line-height:1', textContent: `${ms} ms` }),
      main,
      ms === null
        ? links(quiet(t('Cancel'), close))
        : links(quiet(t('Try again'), listen), quiet(t('Cancel'), close)),
    )
    main.focus()
  }

  window.addEventListener('keydown', onKey, true)
  window.addEventListener('keyup', onKey, true)
  panel.addEventListener('pointerdown', onPointer)
  listen()
}
