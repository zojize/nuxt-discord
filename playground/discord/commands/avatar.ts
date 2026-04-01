import type { GuildMember, Role, User } from 'discord.js'

/**
 * Get the avatar URL of a user or role
 * @param target The user or role to get the avatar of
 * @guild
 */
export default (target: Mentionable) => {
  if ('displayAvatarURL' in (target as User | GuildMember)) {
    return (target as User | GuildMember).displayAvatarURL({ size: 256 })
  }
  return `${(target as Role).name} has icon: ${(target as Role).iconURL() ?? 'none'}`
}
