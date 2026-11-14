import './social.css'
import { countBadge } from '../ui/badge'
import { h, iconButton, setLabel, toast } from '../ui/dom'
import { icons } from '../ui/icons'
import { popover } from '../ui/popover'
import { avatarEl } from './avatar-ui'
import { CHAT_MAX_LENGTH, type ChatHub, type ChatMessage } from './chat'
import { t } from './i18n'

/** How to show a sender who is (or was) in the room. */
export interface ChatSender {
  name: string
  avatar: string
  color: string
}

export interface ChatControls {
  root: HTMLElement
  open(): void
  readonly isOpen: boolean
  /** Call when the room's players change (names, avatars, colours). */
  refresh(): void
  destroy(): void
}

const TOAST_MAX = 80
/** A chat toast stays this long (ms): longer than a status toast, it has words to read. */
const CHAT_TOAST_MS = 4500

/**
 * Top-bar chat: a button with an unread count, opening a message list and a
 * text field. While closed, new messages also show as toasts.
 */
export function chatControls(hub: ChatHub, sender: (msg: ChatMessage) => ChatSender): ChatControls {
  const button = iconButton(icons.chat, t('Chat'))
  const badge = countBadge(button)
  let unread = 0

  const list = h('div', { class: 'pf-chat-list' })
  list.setAttribute('role', 'log')
  list.setAttribute('aria-live', 'polite')
  const empty = h('p', { class: 'pf-note pf-chat-empty', textContent: t('No messages yet. Say hi!') })

  const input = h('input', {
    class: 'pf-input pf-chat-input',
    type: 'text',
    maxLength: CHAT_MAX_LENGTH,
    placeholder: t('Type a message…'),
    autocomplete: 'off',
    enterKeyHint: 'send',
  })
  input.setAttribute('aria-label', t('Message'))
  const send = iconButton(icons.send, t('Send'))
  send.type = 'submit'
  send.classList.add('primary')
  const form = h('form', { class: 'pf-chat-form' }, input, send)
  form.onsubmit = (e) => {
    e.preventDefault()
    // Enter on an empty field closes chat and hands the keys back to the game.
    if (!input.value.trim()) return menu.close()
    const result = hub.send(input.value)
    if (result === 'ok') input.value = ''
    else if (result === 'limited') {
      form.classList.remove('nope')
      void form.offsetWidth
      form.classList.add('nope')
      input.placeholder = t('Slow down a little')
    }
    input.focus()
  }
  form.addEventListener('animationend', () => {
    form.classList.remove('nope')
    input.placeholder = t('Type a message…')
  })

  const menu = popover(
    {
      button,
      label: t('Chat'),
      class: 'pf-chat-pop',
      onOpen: () => {
        unread = 0
        renderButton()
        renderList()
        input.focus()
      },
    },
    list,
    form,
  )

  const line = (m: ChatMessage) => {
    const who = sender(m)
    const face = h('span', { class: 'pf-chat-face' }, avatarEl(who.avatar))
    face.style.setProperty('--c', who.color)
    face.dataset.player = m.playerId
    const name = h('span', { class: 'pf-chat-name', textContent: m.mine ? t('You') : who.name })
    name.style.color = who.color
    return h(
      'div',
      { class: `pf-chat-line${m.mine ? ' mine' : ''}` },
      face,
      // textContent only: chat text is never markup.
      h('div', { class: 'pf-chat-bubble' }, name, h('span', { class: 'pf-chat-text', textContent: m.text })),
    )
  }

  const renderList = () => {
    const msgs = hub.messages()
    list.replaceChildren(...(msgs.length ? msgs.map(line) : [empty]))
    list.scrollTop = list.scrollHeight
  }

  const renderButton = () => {
    badge.set(unread)
    setLabel(button, unread ? t('Chat ({n} unread)', { n: unread }) : t('Chat (Enter)'))
  }

  const off = hub.on((m, fromHistory) => {
    if (menu.isOpen) {
      // Stay put if they scrolled up to read; follow the conversation otherwise.
      const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40
      if (list.firstChild === empty) list.replaceChildren()
      list.append(line(m))
      if (atBottom || m.mine) list.scrollTop = list.scrollHeight
      return
    }
    if (m.mine || fromHistory) return
    unread++
    renderButton()
    const who = sender(m)
    const text = m.text.length > TOAST_MAX ? `${m.text.slice(0, TOAST_MAX - 1)}…` : m.text
    // The sender stands out (their name in their colour); a chat line gets a moment longer to read.
    toast(text, who.color, { name: who.name, ms: CHAT_TOAST_MS })
  })

  renderButton()
  return {
    root: menu.root,
    open: () => menu.open(),
    get isOpen() {
      return menu.isOpen
    },
    refresh() {
      if (menu.isOpen) renderList()
    },
    destroy() {
      off()
      menu.destroy()
    },
  }
}

/**
 * Enter opens chat when nothing else wanted the key: not typing, not on a
 * button or link, and the game didn't use it (games call preventDefault).
 * Register this after the game's own key handlers so it runs last.
 */
export function chatShortcut(chat: () => ChatControls | null): () => void {
  const onKey = (e: KeyboardEvent) => {
    const c = chat()
    if (!c || c.isOpen || e.code !== 'Enter' || e.defaultPrevented || e.repeat) return
    if ((e.target as HTMLElement).closest?.('input, textarea, select, button, a, [contenteditable]')) return
    e.preventDefault()
    c.open()
  }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}
