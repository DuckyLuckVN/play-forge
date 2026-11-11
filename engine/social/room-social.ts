import type { PlayerInfo, Session } from '../net/session'
import { playerColor, theme } from '../ui/theme'
import { avatarFor } from './avatars'
import { ChatHub } from './chat'
import { chatControls, chatShortcut, type ChatControls } from './chat-ui'
import type { ReactionLayer } from './reaction-ui'
import { ReactionHub } from './reactions'
import { VoiceChat } from './voice'
import { showSpeaking, voiceControls, type VoiceControls } from './voice-ui'

/** How a player looks in social UI: name, avatar and seat colour. */
export const socialLook = (p: PlayerInfo) => ({
  name: p.name,
  avatar: avatarFor(p),
  color: playerColor(p.slot),
})

/**
 * Everything social for one online room: reactions, voice and text chat.
 * Create it after the game mounts (so the game's key handlers run first) and
 * dispose it when leaving the room.
 */
export class RoomSocial {
  readonly reactions: ReactionHub
  readonly chat: ChatHub
  readonly voice: VoiceChat | null = null
  /** Everyday controls (mic, chat): the fan on phones, the bar on desktop. */
  readonly quick: HTMLElement[]
  /** Settings (voice): the ⋯ menu on phones, the bar on desktop. */
  readonly settings: HTMLElement[]
  private voiceUi: VoiceControls | null = null
  private chatUi: ChatControls
  private offs: (() => void)[] = []

  constructor(
    session: Session<unknown, unknown>,
    layer: ReactionLayer,
    /** A game that draws reactions itself returns true: the shell then only plays the sound. */
    claim?: (playerId: string, reactionId: string) => boolean,
  ) {
    const s = session
    const player = (id: string) => s.lobby.players.find((p) => p.id === id)
    const isKnown = (id: string) => !!player(id)

    this.reactions = new ReactionHub(s.transport, s.selfId, { isKnown })
    this.offs.push(
      this.reactions.on((id, reaction) => {
        const p = player(id)
        if (p) layer.show(id, reaction, socialLook(p), { soundOnly: claim?.(id, reaction) ?? false })
      }),
    )

    this.chat = new ChatHub(s.transport, {
      selfId: s.selfId,
      selfName: () => s.self?.name ?? 'Player',
      isKnown,
      isHost: () => s.isHost,
    })
    this.chatUi = chatControls(this.chat, (m) => {
      const p = player(m.playerId)
      // Someone who left: their name from the message, a neutral colour.
      return p ? socialLook(p) : { name: m.name, avatar: avatarFor({ id: m.playerId }), color: theme.haze }
    })
    this.offs.push(chatShortcut(() => this.chatUi))

    if (VoiceChat.supported(s.transport)) {
      const voice = (this.voice = new VoiceChat(s.transport, s.selfId))
      this.voiceUi = voiceControls(voice, () =>
        s.lobby.players.filter((p) => p.id !== s.selfId).map((p) => ({ id: p.id, ...socialLook(p) })),
      )
      this.offs.push(showSpeaking(voice))
    }
    this.quick = [this.voiceUi?.mic, this.chatUi.root].filter((el): el is HTMLElement => !!el)
    this.settings = this.voiceUi ? [this.voiceUi.settings] : []
  }

  /** Call when the lobby changes (players joined, left, renamed). */
  refresh(): void {
    this.voiceUi?.refresh()
    this.chatUi.refresh()
  }

  isSpeaking(playerId: string): boolean {
    return this.voice?.isSpeaking(playerId) ?? false
  }

  dispose(): void {
    this.offs.forEach((off) => off())
    this.reactions.dispose()
    this.chatUi.destroy()
    this.chat.dispose()
    this.voiceUi?.destroy()
    this.voice?.dispose()
  }
}
