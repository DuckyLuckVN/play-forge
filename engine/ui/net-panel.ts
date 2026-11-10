import { netLog } from '../net/debug'
import {
  netPanelView,
  type LinkState,
  type LinkedPlayer,
  type NetHint,
  type NetPanelView,
  type NetStatus,
  type Route,
} from '../net/status'
import { h, icon, iconButton, toast } from './dom'
import { t } from './i18n'
import { icons } from './icons'
import { popover } from './popover'

/** What the Network panel shows; set while in an online room. */
export interface NetPanelSource {
  room: string
  isHost: boolean
  status(): NetStatus
  /** Refresh route and ping (WebRTC stats). Only called while the panel is open. */
  measure(): Promise<void>
  /** People we have a direct link with (see LinkedPlayer). */
  linked(): LinkedPlayer[]
}

/** While the panel is open it refreshes this often; the button's colour, less often. */
const OPEN_REFRESH_MS = 1000
const HEALTH_REFRESH_MS = 1000

const STATE_TEXT: Record<LinkState, () => string> = {
  connecting: () => t('Connecting…'),
  connected: () => t('Connected'),
  failed: () => t('Failed'),
}
const ROUTE_TEXT: Record<Route, () => string> = {
  direct: () => t('Direct'),
  relay: () => t('Via relay server'),
  local: () => t('Same browser'),
}
const HINT_TEXT: Record<NetHint, () => string> = {
  local: () => t('Test mode: tabs in this browser talk directly, no internet used.'),
  'no-servers': () =>
    t("Can't reach the matchmaking servers, so new players can't find this room. Check your internet."),
  blocked: () =>
    t(
      'A direct connection failed: your networks block it. Try the same Wi-Fi, or turn off VPN / switch from mobile data.',
    ),
  connecting: () => t('Still connecting to someone. This usually takes a few seconds.'),
  lag: () => t('High ping: moves may feel delayed. A stronger or wired connection helps.'),
}

/**
 * Top-bar "Network" button: its colour shows connection health (green, yellow,
 * red; grey for same-browser test rooms) and it opens a live panel with the
 * room code, your role, the matchmaking servers and each player's link.
 */
export function netStatusButton() {
  const label = t('Network status')
  const button = iconButton(icons.network, label)
  button.classList.add('pf-net-btn')
  const head = h('div', { class: 'pf-net-head' })
  const body = h('div', { class: 'pf-net-body' })
  const pop = popover(
    { button, label, class: 'pf-net-pop', onToggle: (open) => (open ? startLive() : stopLive()) },
    h('h3', { class: 'pf-net-title', textContent: t('Network') }),
    head,
    body,
  )
  pop.root.hidden = true

  let source: NetPanelSource | null = null
  let healthTimer: ReturnType<typeof setInterval> | null = null
  let liveTimer: ReturnType<typeof setTimeout> | null = null
  let health = ''
  let attachedAt = 0

  const setHealth = (view: NetPanelView) => {
    if (view.health === health) return
    netLog('health:', health || 'start', '→', view.health, view)
    health = view.health
    button.dataset.health = health
  }
  const viewNow = () =>
    source && netPanelView(source.status(), source.linked(), performance.now() - attachedAt)
  const refreshHealth = () => {
    const view = viewNow()
    if (view) setHealth(view)
  }

  // Measure, draw, wait, repeat: no overlapping stats calls on a slow device.
  const tick = async () => {
    const src = source
    if (!src) return
    await src.measure().catch(() => {})
    if (src !== source || !pop.isOpen) return
    const view = viewNow()!
    setHealth(view)
    drawBody(body, view)
    liveTimer = setTimeout(tick, OPEN_REFRESH_MS)
  }
  function startLive() {
    if (!source) return
    const view = viewNow()!
    drawBody(body, view)
    setHealth(view)
    void tick()
  }
  function stopLive() {
    if (liveTimer) clearTimeout(liveTimer)
    liveTimer = null
  }

  return {
    root: pop.root,
    /** Show the button for an online room, or hide it (null). */
    attach(src: NetPanelSource | null) {
      source = src
      pop.close()
      stopLive()
      if (healthTimer) clearInterval(healthTimer)
      healthTimer = null
      pop.root.hidden = !src
      if (!src) return
      drawHead(head, src)
      body.replaceChildren()
      health = ''
      attachedAt = performance.now()
      refreshHealth()
      healthTimer = setInterval(refreshHealth, HEALTH_REFRESH_MS)
    },
  }
}

function drawHead(head: HTMLElement, src: NetPanelSource) {
  const copy = iconButton(icons.copy, t('Copy room code'), async () => {
    await navigator.clipboard?.writeText(src.room).catch(() => {})
    toast(t('Room code copied'))
  })
  head.replaceChildren(
    h(
      'div',
      { class: 'pf-net-room' },
      h('span', { class: 'pf-net-label', textContent: t('Room code') }),
      h('strong', { class: 'pf-net-code', textContent: src.room }),
      copy,
    ),
    h(
      'div',
      { class: 'pf-net-role' },
      h('span', { class: 'pf-net-label', textContent: t('You are') }),
      h('strong', { textContent: src.isHost ? t('Host') : t('Guest') }),
    ),
  )
}

function drawBody(body: HTMLElement, view: NetPanelView) {
  body.replaceChildren(
    ...(view.local ? [] : [servers(view)]),
    h('div', { class: 'pf-net-label', textContent: t('Players') }),
    view.rows.length
      ? h(
          'ul',
          { class: 'pf-net-players' },
          ...view.rows.map((r) =>
            h(
              'li',
              { class: `pf-net-player ${r.state}` },
              h('span', { class: 'pf-net-name', textContent: r.name }),
              h('span', { class: 'pf-net-state', textContent: STATE_TEXT[r.state]() }),
              h('span', { class: 'pf-net-route', textContent: r.route ? ROUTE_TEXT[r.route]() : '' }),
              h('span', {
                class: 'pf-net-ping',
                textContent: r.rttMs !== null ? t('{ms} ms', { ms: r.rttMs }) : '–',
              }),
            ),
          ),
        )
      : h('p', { class: 'pf-net-empty', textContent: t('No one else is here yet.') }),
    ...view.hints.map((hint) => h('p', { class: `pf-net-hint ${hint}`, textContent: HINT_TEXT[hint]() })),
  )
}

function servers(view: NetPanelView) {
  const total = view.relays.length
  const summary = h(
    'div',
    { class: 'pf-net-servers-head' },
    h('span', { class: 'pf-net-label', textContent: t('Matchmaking servers') }),
    h('strong', {
      class: view.relaysOk ? 'ok' : 'bad',
      textContent: t('{ok} of {total} connected', { ok: view.relaysOk, total }),
    }),
  )
  const list = h(
    'ul',
    { class: 'pf-net-relays' },
    ...view.relays.map((r) => {
      const li = h('li', { class: r.ok ? 'ok' : 'bad' }, icon(r.ok ? icons.check : icons.cross), r.host)
      li.title = r.ok ? t('Connected') : t('Not connected')
      return li
    }),
  )
  return h('div', { class: 'pf-net-servers' }, summary, list)
}
