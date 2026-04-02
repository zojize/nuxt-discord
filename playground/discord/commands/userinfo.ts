import type { User } from 'discord.js'

/**
 * Display information about a user
 * @param user The user to inspect
 */
export default (user: User) => {
  return [
    `**${user.displayName}**`,
    `ID: ${user.id}`,
    `Account created: ${user.createdAt.toLocaleDateString()}`,
    `Bot: ${user.bot ? 'Yes' : 'No'}`,
  ].join('\n')
}
