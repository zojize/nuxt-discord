import type { SlashCommandOptionType, SlashCommandReturnType } from '../../../types'

/**
 * Defines a slash command function that is automatically registered
 * by the Nuxt Discord module.
 *
 * @param command - The function that implements the slash command.
 */
export function defineSlashCommand<Args extends (SlashCommandOptionType | undefined)[]>(
  command: (...args: Args) => SlashCommandReturnType,
) {
  return command
}
