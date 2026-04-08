import process from 'node:process'
import { defineMiddleware, MiddlewareError } from '../defineMiddleware'

export const ownerOnly = defineMiddleware('ownerOnly', ({ interaction, next }) => {
  const ownerId = process.env.DISCORD_OWNER_ID
  if (!ownerId)
    throw new MiddlewareError('DISCORD_OWNER_ID environment variable is not set.', 'ownerOnly')
  if (interaction.user.id !== ownerId)
    throw new MiddlewareError('This command can only be used by the bot owner.', 'ownerOnly')
  return next()
})
