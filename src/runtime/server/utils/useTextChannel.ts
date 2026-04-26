import type { TextBasedChannel } from 'discord.js'
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
  /** The underlying discord.js channel — escape hatch for advanced usage */
  raw: TextBasedChannel
}

/**
 * Compose with a Discord text channel. Resolves a channel from:
 * 1. An explicit TextBasedChannel instance (first arg)
 * 2. A string channel ID (not yet implemented — pass an instance instead)
 * 3. The ambient `currentChannel` set by the framework before invoking handlers
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
  }

  return {
    id: ch.id,
    type: ch.type ?? 0,
    guildId: ch.guildId ?? null,
    createdAt: ch.createdAt ?? null,
    raw: channel,
  }
}
