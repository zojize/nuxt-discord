import { defineMiddleware, MiddlewareError } from '../defineMiddleware'

export const guildOnly = defineMiddleware('guildOnly', ({ interaction, next }) => {
  if (!interaction.guildId)
    throw new MiddlewareError('This command can only be used in a server.', 'guildOnly')
  return next()
})
