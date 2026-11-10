import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  guideList,
  guideRows,
  guideSeen,
  howToPlayMode,
  keycap,
  markGuideSeen,
  resetGuideMemory,
  withPauseRow,
  type GuideStep,
} from './guide'

const STEPS: GuideStep[] = [
  {
    action: 'Move',
    keys: [
      ['W', 'A', 'S', 'D'],
      ['Up', 'Left', 'Down', 'Right'],
    ],
    touch: 'dragLeft',
    touchLabel: 'left',
  },
  { action: 'Swing', keys: [['Space'], ['J']], mouse: 'click', touch: 'button' },
  { action: 'Charge', hold: true, note: 'Let go to hit', keys: [['Space']], mouse: 'hold', touch: 'button' },
  { action: 'Smash', keys: [['W']] },
  { action: 'Aim', touch: 'drag' },
  { action: 'Nothing here' },
]

describe('keycap', () => {
  it('prints arrows as glyphs with a spoken name', () => {
    expect(keycap('Up')).toEqual({ text: '↑', spoken: 'Up arrow' })
    expect(keycap('Right').text).toBe('→')
  })
  it('keeps other key names as written', () => {
    expect(keycap('Space')).toEqual({ text: 'Space' })
    expect(keycap('J')).toEqual({ text: 'J' })
  })
})

describe('guideRows', () => {
  it('shows a tip on every device, even with no inputs', () => {
    const steps = [
      { action: 'Move', keys: [['W']] },
      { action: 'Step on the beat', note: 'points + groove', tip: true },
    ]
    for (const touch of [false, true]) {
      const tip = guideRows(steps, touch).find((r) => r.action === 'Step on the beat')
      expect(tip).toEqual({ action: 'Step on the beat', note: 'points + groove', hold: false, inputs: [] })
    }
  })

  it('desktop: keys and mouse joined by "or", touch-only rows hidden', () => {
    const rows = guideRows(STEPS, false)
    expect(rows.map((r) => r.action)).toEqual(['Move', 'Swing', 'Charge', 'Smash'])
    const swing = rows[1].inputs
    expect(swing.map((i) => i.kind)).toEqual(['keys', 'or', 'keys', 'or', 'mouse'])
    const move = rows[0].inputs[0]
    expect(move.kind === 'keys' && move.keys.map((k) => k.text)).toEqual(['W', 'A', 'S', 'D'])
    const arrows = rows[0].inputs[2]
    expect(arrows.kind === 'keys' && arrows.keys.map((k) => k.text)).toEqual(['↑', '←', '↓', '→'])
  })

  it('touch: only touch inputs, key-only rows hidden', () => {
    const rows = guideRows(STEPS, true)
    expect(rows.map((r) => r.action)).toEqual(['Move', 'Swing', 'Charge', 'Aim'])
    expect(rows[0].inputs).toEqual([{ kind: 'touch', action: 'dragLeft', label: 'left', hold: false }])
    expect(rows.every((r) => r.inputs.every((i) => i.kind === 'touch'))).toBe(true)
  })

  it('carries hold and note, and skips empty key groups', () => {
    const [charge] = guideRows([STEPS[2]], false)
    expect([charge.hold, charge.note]).toEqual([true, 'Let go to hit'])
    expect(guideRows([{ action: 'x', keys: [[]] }], false)).toEqual([])
  })
})

describe('per-key hold (data)', () => {
  it('row-level hold marks every key, mouse and touch input', () => {
    const [row] = guideRows([STEPS[2]], false)
    const keys = row.inputs.filter((i) => i.kind === 'keys')
    expect(keys.every((i) => i.kind === 'keys' && i.keys.every((k) => k.hold))).toBe(true)
    expect(row.inputs.at(-1)).toEqual({ kind: 'mouse', action: 'hold', hold: true })
    const [touch] = guideRows([STEPS[2]], true)
    expect(touch.inputs[0]).toMatchObject({ kind: 'touch', hold: true })
  })
  it('a row without hold marks nothing', () => {
    const [row] = guideRows([STEPS[1]], false)
    const held = row.inputs.some((i) =>
      i.kind === 'keys' ? i.keys.some((k) => k.hold) : i.kind !== 'or' && i.hold,
    )
    expect(held).toBe(false)
  })
  it('a single key can be held beside tap keys', () => {
    const [row] = guideRows(
      [{ action: 'x', keys: [['W', { key: 'Space', hold: true }, { key: 'J' }]] }],
      false,
    )
    const i = row.inputs[0]
    expect(i.kind === 'keys' && i.keys.map((k) => !!k.hold)).toEqual([false, true, false])
  })
})

describe('withPauseRow', () => {
  it('adds Esc / P for keyboards, nothing on touch', () => {
    const steps = withPauseRow([STEPS[1]])
    const pause = guideRows(steps, false).at(-1)!
    expect(pause.action).toBe('Pause')
    expect(pause.inputs.map((i) => (i.kind === 'keys' ? i.keys[0].text : i.kind))).toEqual(['Esc', 'or', 'P'])
    expect(guideRows(steps, true).map((r) => r.action)).toEqual(['Swing'])
  })
})

describe('howToPlayMode (backward compatible)', () => {
  it('guide wins, then the old controls text, then nothing', () => {
    expect(howToPlayMode(STEPS, 'old text')).toBe('guide')
    expect(howToPlayMode(undefined, 'old text')).toBe('text')
    expect(howToPlayMode([], 'old text')).toBe('text')
    expect(howToPlayMode(undefined, undefined)).toBeNull()
  })
})

describe('first-play flag', () => {
  const memoryStore = () => {
    const data = new Map<string, string>()
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      data,
    }
  }
  const broken = {
    getItem: (): string | null => {
      throw new Error('denied')
    },
    setItem: () => {
      throw new Error('denied')
    },
  }
  beforeEach(resetGuideMemory)

  it('is unseen until marked, per game id, under play-forge:guide-seen:<id>', () => {
    const store = memoryStore()
    expect(guideSeen('snake', store)).toBe(false)
    markGuideSeen('snake', store)
    expect(store.data.get('play-forge:guide-seen:snake')).toBe('1')
    resetGuideMemory()
    expect(guideSeen('snake', store)).toBe(true)
    expect(guideSeen('caro', store)).toBe(false)
  })

  it('storage that throws: shown once, then remembered for the page', () => {
    expect(guideSeen('fuse', broken)).toBe(false)
    expect(() => markGuideSeen('fuse', broken)).not.toThrow()
    expect(guideSeen('fuse', broken)).toBe(true)
  })

  it('no storage at all: same', () => {
    expect(guideSeen('fuse', undefined)).toBe(false)
    markGuideSeen('fuse', undefined)
    expect(guideSeen('fuse', undefined)).toBe(true)
  })
})

// A tiny stand-in DOM (no DOM environment in these tests): enough for h() and icon().
interface FakeEl {
  tagName: string
  className: string
  textContent?: string
  innerHTML?: string
  children: (FakeEl | string)[]
  attrs: Record<string, string>
  append(...c: (FakeEl | string)[]): void
  setAttribute(k: string, v: string): void
}
const realDocument = (globalThis as { document?: unknown }).document
const all = (el: FakeEl): FakeEl[] =>
  el.children.flatMap((c) => (typeof c === 'string' ? [] : [c, ...all(c)]))

describe('guideList rendering', () => {
  beforeEach(() => {
    ;(globalThis as { document?: unknown }).document = {
      createElement: (tag: string): FakeEl => ({
        tagName: tag.toUpperCase(),
        className: '',
        children: [],
        attrs: {},
        append(...c) {
          this.children.push(...c)
        },
        setAttribute(k, v) {
          this.attrs[k] = v
        },
      }),
    }
  })
  afterEach(() => {
    ;(globalThis as { document?: unknown }).document = realDocument
  })

  it('desktop: one row per step, keycaps as <kbd>, arrows read out', () => {
    const list = guideList(STEPS, false) as unknown as FakeEl
    expect(list.tagName).toBe('UL')
    expect(list.children).toHaveLength(4)
    const kbds = all(list).filter((e) => e.tagName === 'KBD')
    expect(kbds.slice(0, 4).map((k) => k.textContent)).toEqual(['W', 'A', 'S', 'D'])
    const up = kbds[4]
    const [glyph, said] = up.children as FakeEl[]
    expect([glyph.textContent, glyph.attrs['aria-hidden']]).toEqual(['↑', 'true'])
    expect([said.className, said.textContent]).toEqual(['pf-sr', 'Up arrow'])
    expect(kbds.find((k) => k.textContent === 'Space')!.className).toBe('pf-key wide')
    expect(all(list).some((e) => e.className === 'pf-guide-hold' && e.textContent === 'hold')).toBe(true)
  })

  it('touch: icons with their label or spoken name, no keycaps', () => {
    const list = guideList(STEPS, true) as unknown as FakeEl
    expect(list.children).toHaveLength(4)
    const els = all(list)
    expect(els.some((e) => e.tagName === 'KBD')).toBe(false)
    expect(els.find((e) => e.className === 'pf-guide-touch')!.textContent).toBe('left')
    expect(
      els.filter((e) => e.className === 'pf-icon').every((e) => e.innerHTML?.includes('aria-hidden')),
    ).toBe(true)
    expect(els.some((e) => e.className === 'pf-sr' && e.textContent === 'Tap the button')).toBe(true)
  })

  const chips = (list: FakeEl) => all(list).filter((e) => e.className === 'pf-held')
  const spokenTexts = (el: FakeEl) =>
    all(el)
      .filter((e) => e.className === 'pf-sr')
      .map((e) => e.textContent)

  it('held row: each alternative gets its own hold chip, read out as "hold <key>"', () => {
    const list = guideList([STEPS[2]], false) as unknown as FakeEl
    const found = chips(list)
    expect(found).toHaveLength(2) // Space, mouse
    expect(found.every((c) => (c.children[0] as FakeEl).className === 'pf-guide-hold')).toBe(true)
    expect(spokenTexts(found[0])).toEqual(['hold Space'])
    expect(spokenTexts(found[1])).toEqual(['hold Hold the mouse button'])
  })

  it('tap row has no hold chips', () => {
    const list = guideList([STEPS[1]], false) as unknown as FakeEl
    expect(chips(list)).toHaveLength(0)
  })

  it('mixed combo: only the held key sits in a chip', () => {
    const step: GuideStep = { action: 'x', keys: [['W', { key: 'Space', hold: true }]] }
    const list = guideList([step], false) as unknown as FakeEl
    const [chip] = chips(list)
    expect(chips(list)).toHaveLength(1)
    expect(all(chip).filter((e) => e.tagName === 'KBD')).toHaveLength(1)
    expect(spokenTexts(chip)).toEqual(['hold Space'])
  })

  it('touch hold: chip around the icon with a spoken hold', () => {
    const list = guideList([STEPS[2]], true) as unknown as FakeEl
    expect(chips(list)).toHaveLength(1)
    expect(spokenTexts(list)).toEqual(['hold Tap the button'])
  })
})
