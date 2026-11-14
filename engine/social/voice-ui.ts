import './social.css'
import { h, icon, iconButton, setLabel, toast, type Child } from '../ui/dom'
import { countBadge } from '../ui/badge'
import { icons } from '../ui/icons'
import { isTyping } from '../ui/key-guard'
import { optionPickers } from '../ui/options'
import { popover } from '../ui/popover'
import { slider } from '../ui/slider'
import { avatarEl } from './avatar-ui'
import { t } from './i18n'
import type { JoinResult, VoiceChat } from './voice'
import { inVoiceCount, PLAYER_VOLUME_MAX, type VoiceMode } from './voice-state'

/** Who to list in the voice panel (everyone in the room but us). */
export interface VoicePlayer {
  id: string
  name: string
  avatar: string
  color: string
}

export interface VoiceControls {
  /** Join / mute / hold-to-talk: an everyday control. */
  mic: HTMLElement
  /** Voice settings popover: belongs with the other settings menus. */
  settings: HTMLElement
  /**
   * The voice settings panel (label + live body), drawn fresh, for the settings sheet. It is the same
   * node the popover shows, so whichever container mounts it last owns it.
   */
  panel(): HTMLElement
  /** Join voice like the mic button does (error toasts included). */
  join(opts?: { muted?: boolean }): Promise<void>
  /** Call when the room's players change. */
  refresh(): void
  destroy(): void
}

const PTT_KEY = 'KeyV'

const JOIN_ERRORS: Record<Exclude<JoinResult, 'ok'>, string> = {
  denied: 'Microphone blocked. Allow it in your browser settings to talk.',
  'no-mic': 'No microphone found.',
  error: "Couldn't start the microphone.",
}

/**
 * Top-bar voice controls: a mic button (join / mute / hold to talk) and a
 * settings popover (mode, volumes, per-player volume and mute).
 */
export function voiceControls(chat: VoiceChat, players: () => VoicePlayer[]): VoiceControls {
  let destroyed = false
  let pending: Promise<void> | null = null
  // One join at a time (a tap during an automatic rejoin waits for it).
  const join = (opts?: { muted?: boolean }): Promise<void> =>
    (pending ??= chat
      .join(opts)
      .then((result) => {
        if (result !== 'ok' && !destroyed) toast(t(JOIN_ERRORS[result]))
      })
      .finally(() => (pending = null)))

  // ---------- Mic button ----------
  const mic = h('button', { class: 'pf-btn icon pf-voice-mic', type: 'button' })
  mic.onclick = () => {
    if (!chat.joined) void join()
    else if (chat.mode === 'open') chat.setMuted(!chat.isMuted)
  }
  // Push-to-talk on the button itself (touch screens have no V key).
  mic.onpointerdown = (e) => {
    if (!chat.joined || chat.mode !== 'ptt') return
    mic.setPointerCapture(e.pointerId)
    chat.setHolding(true)
  }
  const release = () => chat.setHolding(false)
  mic.onpointerup = release
  mic.onpointercancel = release
  mic.onlostpointercapture = release
  mic.oncontextmenu = (e) => e.preventDefault() // long-press menu on phones

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code !== PTT_KEY || e.repeat || isTyping(e.target) || !chat.joined || chat.mode !== 'ptt') return
    chat.setHolding(true)
  }
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.code === PTT_KEY) chat.setHolding(false)
  }
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', release)

  const renderMic = () => {
    const off = chat.joined && chat.isMuted
    mic.replaceChildren(icon(off ? icons.micOff : icons.mic))
    mic.classList.toggle('live', chat.live)
    mic.classList.toggle('muted', off)
    mic.classList.toggle('joined', chat.joined)
    setLabel(
      mic,
      !chat.joined
        ? t('Join voice chat')
        : chat.mode === 'ptt'
          ? t('Hold to talk (V)')
          : t(chat.isMuted ? 'Unmute microphone' : 'Mute microphone'),
    )
    mic.setAttribute('aria-pressed', String(chat.joined && chat.live))
  }

  // ---------- Settings panel ----------
  // The headset button doubles as the "who's in voice" counter.
  const headset = iconButton(icons.headset, t('Voice settings'))
  const badge = countBadge(headset)
  const renderCount = () => {
    const n = inVoiceCount(chat, players())
    badge.set(n) // pops when someone joins, so it's noticed mid-game
    setLabel(headset, n ? t('Voice settings ({n} in voice)', { n }) : t('Voice settings'))
  }
  const body = h('div', { class: 'pf-voice-body' })
  const panel = h(
    'div',
    { class: 'pf-voice-panel' },
    h('span', { class: 'pf-option-label', textContent: t('Voice chat') }),
    body,
  )
  const menu = popover({ button: headset, label: t('Voice chat'), class: 'pf-voice-pop' }, panel)

  let bodyKey = ''
  const renderBody = () => {
    const others = players()
    // Rebuild only when the structure changes, never while a slider moves.
    const key = JSON.stringify([
      chat.joined,
      chat.isMuted,
      chat.mode,
      others.map((p) => [p.id, p.name, p.avatar, chat.peerState(p.id), chat.isPlayerMuted(p.id)]),
    ])
    if (key === bodyKey) return
    bodyKey = key
    const focused = body.contains(document.activeElement)
      ? document.activeElement?.getAttribute('data-k')
      : null

    const joinBtn = h('button', {
      class: `pf-btn wide${chat.joined ? '' : ' primary'}`,
      type: 'button',
      textContent: t(chat.joined ? 'Leave voice chat' : 'Join voice chat'),
      onclick: () => (chat.joined ? chat.leave() : void join()),
    })
    joinBtn.dataset.k = 'join'

    const mode = optionPickers(
      [
        {
          id: 'mode',
          label: t('Microphone'),
          default: 'open',
          choices: [
            { value: 'open', label: t('Open mic') },
            { value: 'ptt', label: t('Push to talk') },
          ],
        },
      ],
      { mode: chat.mode },
      (_, value) => chat.setMode(value as VoiceMode),
    )

    const volume = slider({
      label: t('Voice volume'),
      value: Math.round(chat.volume * 100),
      onInput: (v) => chat.setVolume(v / 100),
    })

    // Who's here first, the settings next, joining or leaving last.
    const parts: Child[] = [
      h('span', { class: 'pf-option-label', textContent: t('Players') }),
      others.length
        ? h('div', { class: 'pf-voice-list' }, ...others.map(playerRow))
        : h('p', { class: 'pf-note', textContent: t('No one else is here yet.') }),
      mode,
      chat.mode === 'ptt' &&
        h('p', { class: 'pf-note', textContent: t('Hold V, or hold the mic button, to talk.') }),
      volume.row,
      !chat.joined &&
        h('p', { class: 'pf-note', textContent: t('You can hear others without joining. Join to talk.') }),
      joinBtn,
    ]
    body.replaceChildren(...parts.filter((c): c is Node | string => !!c))
    if (focused) body.querySelector<HTMLElement>(`[data-k="${CSS.escape(focused)}"]`)?.focus()
  }

  const playerRow = (p: VoicePlayer) => {
    const state = chat.peerState(p.id)
    const silenced = chat.isPlayerMuted(p.id)
    const status = silenced
      ? t('Muted')
      : !state?.mic
        ? t('Not in voice')
        : state.muted
          ? t('Mic muted')
          : t('In voice')
    const face = h('span', { class: 'pf-voice-face' }, avatarEl(p.avatar))
    face.style.setProperty('--c', p.color)
    face.dataset.player = p.id
    if (chat.isSpeaking(p.id)) face.classList.add('speaking')

    const vol = slider({
      label: p.name,
      ariaLabel: t('{name} volume', { name: p.name }),
      max: PLAYER_VOLUME_MAX * 100,
      step: 10,
      value: Math.round(chat.playerVolume(p.id) * 100),
      onInput: (v) => chat.setPlayerVolume(p.id, v / 100),
    })
    vol.input.dataset.k = `vol-${p.id}`
    vol.row.classList.toggle('muted', silenced)

    const mute = iconButton(
      silenced ? icons.soundOff : icons.soundOn,
      t(silenced ? 'Unmute {name}' : 'Mute {name}', { name: p.name }),
      () => chat.setPlayerMuted(p.id, !silenced),
    )
    mute.dataset.k = `mute-${p.id}`
    mute.classList.toggle('muted', silenced)
    mute.setAttribute('aria-pressed', String(silenced))

    return h(
      'div',
      { class: 'pf-voice-row' },
      face,
      h(
        'div',
        { class: 'pf-voice-who' },
        vol.row,
        h('small', { class: 'pf-voice-status', textContent: status }),
      ),
      mute,
    )
  }

  const refresh = () => {
    renderMic()
    renderCount()
    if (menu.isOpen || panel.isConnected) renderBody()
  }
  const offs = [chat.on('change', refresh)]
  // Opening always shows fresh state.
  menu.root.querySelector('button')!.addEventListener('click', () => {
    bodyKey = ''
    renderBody()
  })
  renderMic()
  renderCount()

  return {
    mic,
    settings: menu.root,
    panel() {
      bodyKey = ''
      renderBody()
      return panel
    },
    join,
    refresh,
    destroy() {
      destroyed = true
      offs.forEach((off) => off())
      menu.destroy()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', release)
    },
  }
}

/**
 * Keeps a glowing ring on every `[data-player]` element (seats, score chips,
 * the voice list) while that player talks.
 */
export function showSpeaking(chat: VoiceChat): () => void {
  return chat.on('speaking', (id, on) => {
    document
      .querySelectorAll(`[data-player="${CSS.escape(id)}"]`)
      .forEach((el) => el.classList.toggle('speaking', on))
  })
}
