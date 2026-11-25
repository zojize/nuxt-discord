import { PermissionFlagsBits } from 'discord.js'

/**
 * @description Admin-only command with cooldown
 * @middleware guildOnly
 * @defaultMemberPermissions 8
 * @dm false
 */
export default () => {
  useMiddleware(cooldown, { seconds: 10 })
  if (!useInteraction()?.memberPermissions?.has(PermissionFlagsBits.Administrator))
    throw new MiddlewareError('Administrator permission is required.', 'admin')
  return reply.ephemeral('Admin action executed! (10s cooldown)')
}
