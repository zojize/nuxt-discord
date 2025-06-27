import type { APIApplicationCommandOptionChoice } from 'discord.js'
import type { SlashCommandOptionType } from '~/src/types'

export interface DescribeOptionOptionsBase {
  /** The name of the command. */
  name?: string

  /** A brief description of the command. */
  description?: string
}

export interface IntegerOption extends DescribeOptionOptionsBase {
  /** The minimum value for the integer option. */
  min?: number

  /** The maximum value for the integer option. */
  max?: number

  /** An array of choices for the integer option. */
  choices?: APIApplicationCommandOptionChoice<number>[]
}

export interface NumberOption extends DescribeOptionOptionsBase {
  /** The minimum value for the number option. */
  min?: number

  /** The maximum value for the number option. */
  max?: number

  /** An array of choices for the number option. */
  choices?: APIApplicationCommandOptionChoice<number>[]
}

export interface StringOption extends DescribeOptionOptionsBase {
  /** The minimum length of the string option. */
  minLength?: number

  /** The maximum length of the string option. */
  maxLength?: number

  /** An array of choices for the string option. */
  choices?: APIApplicationCommandOptionChoice<string>[]
}

export type DescribeOptionOptions
  = | IntegerOption
    | NumberOption
    | StringOption

/**
 */
export function describeOption<const T extends SlashCommandOptionType>(
  _option: T | undefined,
  _options: T extends integer ? IntegerOption
    : T extends number ? NumberOption
      : T extends string ? StringOption : DescribeOptionOptionsBase,
): void {
// This function is a placeholder for the build time macro
}
