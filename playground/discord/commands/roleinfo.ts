import type { Role } from 'discord.js'

/**
 * Display information about a role
 * @param role The role to inspect
 */
export default (role: Role) => {
  return [
    `**${role.name}**`,
    `Color: ${role.hexColor}`,
    `Members: ${role.members.size}`,
    `Position: ${role.position}`,
    `Mentionable: ${role.mentionable ? 'Yes' : 'No'}`,
  ].join('\n')
}
