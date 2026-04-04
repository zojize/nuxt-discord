import type { MessageContextMenuCommandInteraction, UserContextMenuCommandInteraction } from 'discord.js'

export interface ContextMenuDefinition {
  type: 'user' | 'message'
  execute: (interaction: UserContextMenuCommandInteraction | MessageContextMenuCommandInteraction) => void | Promise<void>
}

/**
 * Define a user context menu command (right-click on a user).
 *
 * @example
 * // discord/context-menus/userinfo.user.ts
 * export default defineUserContextMenu(async (interaction) => {
 *   const user = interaction.targetUser
 *   await interaction.reply(`User: ${user.tag}`)
 * })
 */
export function defineUserContextMenu(
  execute: (interaction: UserContextMenuCommandInteraction) => void | Promise<void>,
): ContextMenuDefinition {
  return { type: 'user', execute: execute as ContextMenuDefinition['execute'] }
}

/**
 * Define a message context menu command (right-click on a message).
 *
 * @example
 * // discord/context-menus/bookmark.message.ts
 * export default defineMessageContextMenu(async (interaction) => {
 *   const message = interaction.targetMessage
 *   await interaction.reply({ content: `Bookmarked: ${message.url}`, flags: MessageFlags.Ephemeral })
 * })
 */
export function defineMessageContextMenu(
  execute: (interaction: MessageContextMenuCommandInteraction) => void | Promise<void>,
): ContextMenuDefinition {
  return { type: 'message', execute: execute as ContextMenuDefinition['execute'] }
}
