// The hero browser: a detail card for the chosen hero (portrait, health,
// perks and trade-offs) over a grid of every hero. Used before a run (pick who
// to play) and in the shop's Heroes tab (buy and equip).
import { playSound } from '@forge/audio/sound'
import { h } from '@forge/ui/dom'
import { coinAmount } from './coin'
import { heroPortrait } from './hero-art'
import { avatarStage } from './hero-avatar'
import { t } from './i18n'
import type { Save } from './save'
import { buy, equip } from './shop'
import { BOOSTS } from './sim/boosts'
import { HERO_IDS, HEROES, heroPerks, isHeroId, type HeroId, type HeroPerk } from './sim/heroes'
import type { BoostId } from './sim/types'
import { BRICK_SOUNDS } from './sounds'

export const heroItemId = (id: HeroId) => `hero:${id}`

/** The hero a save has equipped (the Rookie if the save names none or an unknown one). */
export function equippedHero(save: Save): HeroId {
  const id = save.equipped.hero?.split(':')[1]
  return isHeroId(id) && save.owned.includes(heroItemId(id)) ? id : 'rookie'
}

/** One perk line, translated (a free skill shows the skill's name). */
export function perkText(p: HeroPerk): string {
  const vars = { ...p.vars }
  if (typeof vars.skill === 'string') vars.skill = t(BOOSTS[vars.skill as BoostId]?.name ?? vars.skill)
  return t(p.text, vars)
}

function portrait(id: HeroId, size: number): HTMLElement {
  const el = h('span', { class: 'bs-hero-portrait' })
  el.innerHTML = heroPortrait(HEROES[id], size)
  return el
}

export interface HeroBrowserOptions {
  getSave: () => Save
  setSave: (s: Save) => void
  /** Before a run: the owned hero's button says "Play as …" and calls this. Without it, the button equips. */
  onPlay?: (id: HeroId) => void
  /** Plays the hero's sound when it is tapped. */
  onVoice: (id: HeroId) => void
}

export function heroBrowser(opts: HeroBrowserOptions): HTMLElement {
  const root = h('div', { class: 'bs-heroes' })
  let chosen: HeroId = equippedHero(opts.getSave())
  // The chosen hero, alive: one stage kept across re-renders so its animation never restarts.
  const stage = avatarStage(chosen, 120, 132)
  stage.el.title = t('Tap me!')
  stage.el.onclick = () => {
    stage.cheer()
    opts.onVoice(chosen)
  }

  const render = () => {
    const save = opts.getSave()
    const def = HEROES[chosen]
    const owned = save.owned.includes(heroItemId(chosen))
    const equipped = equippedHero(save) === chosen
    let action: HTMLButtonElement
    if (owned && opts.onPlay) {
      action = h('button', {
        class: 'pf-btn primary wide',
        type: 'button',
        textContent: t('Play as {name}', { name: t(def.name) }),
        onclick: () => {
          opts.setSave(equip(opts.getSave(), heroItemId(chosen)))
          opts.onPlay!(chosen)
        },
      })
      action.autofocus = true
    } else if (owned) {
      action = h('button', {
        class: `pf-btn wide${equipped ? ' quiet' : ' primary'}`,
        type: 'button',
        textContent: equipped ? t('Selected') : t('Select'),
        disabled: equipped,
        onclick: () => {
          opts.setSave(equip(opts.getSave(), heroItemId(chosen)))
          render()
        },
      })
    } else {
      action = h('button', {
        class: 'pf-btn primary wide',
        type: 'button',
        disabled: save.coins < def.price,
        onclick: () => {
          const res = buy(opts.getSave(), heroItemId(chosen))
          if (res.result !== 'ok') return
          opts.setSave(equip(res.save, heroItemId(chosen)))
          playSound(BRICK_SOUNDS.buy)
          opts.onVoice(chosen)
          render()
        },
      })
      action.append(t('Unlock'), ' ', coinAmount(def.price))
      action.setAttribute(
        'aria-label',
        t('Buy {name} for {price} coins', { name: t(def.name), price: def.price }),
      )
    }
    const perks = heroPerks(def)
    const card = h(
      'div',
      { class: 'bs-hero-card', style: `--hero:${def.color}` },
      stage.el,
      h(
        'div',
        { class: 'bs-hero-info' },
        h('strong', { class: 'bs-hero-name', textContent: t(def.name) }),
        h('span', { class: 'bs-hero-title', textContent: t(def.title) }),
        h('span', { class: 'bs-hero-hp', textContent: t('♥ {n} health', { n: def.hp }) }),
        h(
          'ul',
          { class: 'bs-hero-perks' },
          ...(perks.length
            ? perks.map((p) =>
                h('li', {
                  class: p.good ? 'good' : 'bad',
                  textContent: `${p.good ? '✔' : '✖'} ${perkText(p)}`,
                }),
              )
            : [h('li', { class: 'good', textContent: t('Balanced: no strengths, no weaknesses') })]),
        ),
      ),
      action,
    )
    const grid = h(
      'div',
      { class: 'bs-hero-grid', role: 'listbox' } as never,
      ...HERO_IDS.map((id) => {
        const has = save.owned.includes(heroItemId(id))
        const tile = h(
          'button',
          {
            class: `bs-hero-tile${id === chosen ? ' active' : ''}${has ? '' : ' locked'}`,
            type: 'button',
            style: `--hero:${HEROES[id].color}`,
            onclick: () => {
              chosen = id
              stage.setHero(id)
              stage.cheer()
              opts.onVoice(id)
              render()
            },
          },
          portrait(id, 48),
          h('span', { class: 'bs-hero-tile-name', textContent: t(HEROES[id].name) }),
          has
            ? h('span', {
                class: 'bs-hero-tile-tag',
                textContent: equippedHero(save) === id ? t('Selected') : `♥ ${HEROES[id].hp}`,
              })
            : coinAmount(HEROES[id].price),
        )
        tile.setAttribute('role', 'option')
        tile.setAttribute('aria-selected', String(id === chosen))
        tile.setAttribute('aria-label', `${t(HEROES[id].name)}, ${t(HEROES[id].title)}`)
        return tile
      }),
    )
    root.replaceChildren(card, grid)
  }
  render()
  return root
}
