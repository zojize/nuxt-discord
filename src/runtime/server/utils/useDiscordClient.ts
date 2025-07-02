import type { DiscordClient } from './client'
import { createError } from 'h3'

/**
 * Retrieves the Discord client from the event context.
 */
export function useDiscordClient(): DiscordClient {
  const client = (globalThis as any)[Symbol.for('discord-client')]

  if (!client) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Discord client not initialized',
    })
  }

  return client
}
