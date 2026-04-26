import type { TextBasedChannel } from 'discord.js'
import type { Ref } from 'vue'
import { Events } from 'discord.js'
import { getCurrentScope, onScopeDispose, ref } from 'vue'
import { getCurrentChannel } from './client'

export interface UseTextChannelReturn {
  /** The channel ID */
  id: string
  /** The channel type (ChannelType enum value) */
  type: number
  /** The guild ID this channel belongs to (null for DMs) */
  guildId: string | null
  /** When the channel was created */
  createdAt: Date | null

  /** Reactive: channel name. Updates on Events.ChannelUpdate. */
  name: Ref<string>
  /** Reactive: channel topic. Updates on Events.ChannelUpdate. */
  topic: Ref<string | null>
  /** Reactive: NSFW flag. Updates on Events.ChannelUpdate. */
  nsfw: Ref<boolean>
  /** Reactive: parent category. Updates on Events.ChannelUpdate. */
  parent: Ref<unknown>
  /** Reactive: snapshot of members visible in this channel. Updates on guild member events and ChannelUpdate (perm overrides). */
  members: Ref<Map<string, unknown>>
  /** Reactive: most recent message in this channel. Updates on Events.MessageCreate. */
  lastMessage: Ref<unknown>

  /** The underlying discord.js channel — escape hatch for advanced usage */
  raw: TextBasedChannel
}

interface DiscordEventClient {
  on: (event: string, listener: (...args: unknown[]) => void) => unknown
  off: (event: string, listener: (...args: unknown[]) => void) => unknown
}

/**
 * Compose with a Discord text channel. Resolves a channel from:
 * 1. An explicit TextBasedChannel instance (first arg)
 * 2. A string channel ID (not yet implemented — pass an instance instead)
 * 3. The ambient `currentChannel` set by the framework before invoking handlers
 *
 * Returns reactive refs for channel properties that update when the Discord
 * client emits the relevant events. Listeners auto-clean via the current
 * Vue effect scope (disposed by `interactionTimeout` in commands, or after
 * the listener handler returns).
 *
 * Throws if no channel can be resolved or the resolved channel is not text-based.
 */
export function useTextChannel(idOrInstance?: string | TextBasedChannel): UseTextChannelReturn {
  let channel: TextBasedChannel | null = null

  if (idOrInstance && typeof idOrInstance !== 'string') {
    channel = idOrInstance
  }
  else if (typeof idOrInstance === 'string') {
    throw new TypeError('useTextChannel(channelId): string ID resolution is not yet implemented. Pass a TextBasedChannel instance instead, e.g. useTextChannel(client.channels.cache.get(id)).')
  }
  else {
    channel = getCurrentChannel()
  }

  if (!channel)
    throw new Error('useTextChannel: no current channel available. Pass a channel instance, or call from inside a handler that has channel context (slash command, context menu, or channel-bearing event listener).')

  if (typeof (channel as { isTextBased?: () => boolean }).isTextBased === 'function'
    && !(channel as { isTextBased: () => boolean }).isTextBased()) {
    throw new Error('useTextChannel: resolved channel is not a text channel.')
  }

  const ch = channel as unknown as {
    id: string
    type: number
    guildId: string | null
    createdAt: Date | null
    name: string
    topic: string | null
    nsfw: boolean
    parent: unknown
    members?: Iterable<readonly [string, unknown]>
    lastMessage?: unknown
    client?: DiscordEventClient
  }

  const name = ref<string>(ch.name ?? '')
  const topic = ref<string | null>(ch.topic ?? null)
  const nsfw = ref<boolean>(ch.nsfw ?? false)
  const parent = ref<unknown>(ch.parent ?? null)
  const members = ref<Map<string, unknown>>(new Map(ch.members ?? []))
  const lastMessage = ref<unknown>(ch.lastMessage ?? null)

  const refreshMembers = () => {
    members.value = new Map(ch.members ?? [])
  }

  const client = ch.client
  if (client) {
    const onUpdate = (...args: unknown[]) => {
      const newCh = args[1] as { id?: string, name?: string, topic?: string | null, nsfw?: boolean, parent?: unknown } | undefined
      if (!newCh || newCh.id !== ch.id)
        return
      name.value = newCh.name ?? name.value
      topic.value = newCh.topic ?? null
      nsfw.value = newCh.nsfw ?? false
      parent.value = newCh.parent ?? null
      refreshMembers()
    }
    const onMemberChange = (...args: unknown[]) => {
      const member = args.at(-1) as { guild?: { id?: string } } | undefined
      if (member?.guild?.id === ch.guildId)
        refreshMembers()
    }
    const onMessageCreate = (...args: unknown[]) => {
      const msg = args[0] as { id?: string, channelId?: string, channel?: { id?: string } } | undefined
      if (msg?.channelId === ch.id || msg?.channel?.id === ch.id)
        lastMessage.value = msg
    }
    client.on(Events.ChannelUpdate, onUpdate)
    client.on(Events.GuildMemberAdd, onMemberChange)
    client.on(Events.GuildMemberRemove, onMemberChange)
    client.on(Events.GuildMemberUpdate, onMemberChange)
    client.on(Events.MessageCreate, onMessageCreate)

    if (getCurrentScope()) {
      onScopeDispose(() => {
        client.off(Events.ChannelUpdate, onUpdate)
        client.off(Events.GuildMemberAdd, onMemberChange)
        client.off(Events.GuildMemberRemove, onMemberChange)
        client.off(Events.GuildMemberUpdate, onMemberChange)
        client.off(Events.MessageCreate, onMessageCreate)
      })
    }
  }

  return {
    id: ch.id,
    type: ch.type ?? 0,
    guildId: ch.guildId ?? null,
    createdAt: ch.createdAt ?? null,
    name,
    topic,
    nsfw,
    parent,
    members,
    lastMessage,
    raw: channel,
  }
}
