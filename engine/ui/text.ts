// Canvas text helpers: keep numbers short and long (translated) strings inside their box.

const UNITS: [number, string][] = [
  [1e9, 'B'],
  [1e6, 'M'],
  [1e3, 'k'],
]

/** 12345 → "12.3k", 1234567 → "1.2M". Numbers under 10000 stay whole. */
export function compactNumber(n: number): string {
  const v = Math.round(n)
  if (Math.abs(v) < 10000) return String(v)
  for (const [i, [size, suffix]] of UNITS.entries()) {
    if (Math.abs(v) < size) continue
    const x = v / size
    const shown = Math.abs(x) >= 100 ? Math.round(x) : Math.round(x * 10) / 10
    // 999_999 would read "1000k": step up to the next unit instead.
    if (Math.abs(shown) >= 1000 && i > 0) return compactNumber(Math.sign(v) * UNITS[i - 1][0])
    return `${shown}${suffix}`
  }
  return String(v)
}

/** How much to squeeze text of `width` to fit `maxW`: 1 when it already fits. */
export function fitScale(width: number, maxW: number): number {
  if (width <= 0) return 1
  return Math.max(0, Math.min(1, maxW / width))
}

/** fillText (with an optional outline first) squeezed sideways to fit `maxW`. */
export function fillFitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  stroke = false,
): void {
  const k = fitScale(ctx.measureText(text).width, maxW)
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(k, 1)
  if (stroke) ctx.strokeText(text, 0, 0)
  ctx.fillText(text, 0, 0)
  ctx.restore()
}
