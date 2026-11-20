import type { MessageContextMenuCommandInteraction, UserContextMenuCommandInteraction } from 'discord.js'

interface MenuOptions { middleware?: import('./defineMiddleware').MiddlewareDefinition[] }

export type ContextMenuDefinition = ({
  type: 'user'
  name?: string
  execute: (interaction: UserContextMenuCommandInteraction) => unknown
} | {
  type: 'message'
  name?: string
  execute: (interaction: MessageContextMenuCommandInteraction) => unknown
}) & { middlewareEntries?: MenuOptions['middleware'] }

/**
 * Define a user context menu command (right-click on a user).
 *
 * @example
 * // Name from first argument
 * export default defineUserContextMenu('User Info', async (interaction) => {
 *   await interaction.reply(interaction.targetUser.tag)
 * })
 *
 * @example
 * // Name from @name JSDoc tag or filename
 * export default defineUserContextMenu(async (interaction) => {
 *   await interaction.reply(interaction.targetUser.tag)
 * })
 */
export function defineUserContextMenu(
  nameOrExecute: string | ((interaction: UserContextMenuCommandInteraction) => unknown),
  execute?: (interaction: UserContextMenuCommandInteraction) => unknown,
  options?: MenuOptions,
): ContextMenuDefinition {
  if (typeof nameOrExecute === 'string') {
    return { type: 'user', name: nameOrExecute, execute: execute!, ...(options?.middleware && { middlewareEntries: options.middleware }) }
  }
  return { type: 'user', execute: nameOrExecute }
}

/**
 * Define a message context menu command (right-click on a message).
 *
 * @example
 * // Name from first argument
 * export default defineMessageContextMenu('Bookmark', async (interaction) => {
 *   await interaction.reply(interaction.targetMessage.url)
 * })
 *
 * @example
 * // Name from @name JSDoc tag or filename
 * export default defineMessageContextMenu(async (interaction) => {
 *   await interaction.reply(interaction.targetMessage.url)
 * })
 */
export function defineMessageContextMenu(
  nameOrExecute: string | ((interaction: MessageContextMenuCommandInteraction) => unknown),
  execute?: (interaction: MessageContextMenuCommandInteraction) => unknown,
  options?: MenuOptions,
): ContextMenuDefinition {
  if (typeof nameOrExecute === 'string') {
    return { type: 'message', name: nameOrExecute, execute: execute!, ...(options?.middleware && { middlewareEntries: options.middleware }) }
  }
  return { type: 'message', execute: nameOrExecute }
}
