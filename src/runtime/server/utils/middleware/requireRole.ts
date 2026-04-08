import type { GuildMemberRoleManager } from 'discord.js'
import { defineMiddleware, MiddlewareError } from '../defineMiddleware'

export const requireRole = defineMiddleware('requireRole', ({ interaction, next }, options) => {
  const roleId = options?.roleId as string | string[] | undefined
  if (!roleId)
    throw new MiddlewareError('requireRole middleware requires a roleId option.', 'requireRole')

  const member = interaction.member
  if (!member)
    throw new MiddlewareError('This command can only be used in a server.', 'requireRole')

  const roleIds = Array.isArray(roleId) ? roleId : [roleId]
  const memberRoles = (member as { roles: GuildMemberRoleManager }).roles
  const hasRole = roleIds.some(id => memberRoles.cache.has(id))

  if (!hasRole)
    throw new MiddlewareError('You do not have the required role.', 'requireRole')

  return next()
})
