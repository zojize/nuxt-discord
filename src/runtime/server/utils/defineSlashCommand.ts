import type { SlashCommandOptionType, SlashCommandReturnType } from '~/src/types'

/**
 * Defines a slash command function that is automatically registered
 * by the Nuxt Discord module.
 *
 * @param command - The function that implements the slash command.
 */
export function defineSlashCommand(
  // weird workaround for typescript to not yell at me
  command: {
    // eslint-disable-next-line ts/method-signature-style
    exec(...args: (SlashCommandOptionType | undefined)[]): SlashCommandReturnType
  }['exec'],
) {
  return command
}
