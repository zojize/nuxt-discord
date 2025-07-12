import type { APIApplicationCommandOptionChoice, ApplicationCommandOptionChoiceData, AutocompleteInteraction } from 'discord.js'
import type { SlashCommandOptionType } from '../../../types'

export interface DescribeOptionOptionsBase {
  /** The name of the command. */
  name?: string

  /** A brief description of the command. */
  description?: string
}

type MaybePromise<T> = T | Promise<T>

interface AutocompleteFunction {
  (value: string, interaction: AutocompleteInteraction): MaybePromise<ApplicationCommandOptionChoiceData[]>
}

export interface IntegerOption<T extends number = number> extends DescribeOptionOptionsBase {
  /** The minimum value for the integer option. */
  min?: number

  /** The maximum value for the integer option. */
  max?: number

  /** An array of choices for the integer option. */
  choices?: APIApplicationCommandOptionChoice<T>[]

  /** A function to handle autocomplete for the integer option. */
  autocomplete?: AutocompleteFunction
}

export interface NumberOption<T extends number = number> extends DescribeOptionOptionsBase {
  /** The minimum value for the number option. */
  min?: number

  /** The maximum value for the number option. */
  max?: number

  /** An array of choices for the number option. */
  choices?: APIApplicationCommandOptionChoice<T>[]

  /** A function to handle autocomplete for the number option. */
  autocomplete?: AutocompleteFunction
}

export interface StringOption<T extends string = string> extends DescribeOptionOptionsBase {
  /** The minimum length of the string option. */
  minLength?: number

  /** The maximum length of the string option. */
  maxLength?: number

  /** An array of choices for the string option. */
  choices?: APIApplicationCommandOptionChoice<T>[]

  /** A function to handle autocomplete for the string option. */
  autocomplete?: AutocompleteFunction
}

export type DescribeOptionOptions
  = | IntegerOption
    | NumberOption
    | StringOption

export type NarrowedDescribeOptionOptions<T extends SlashCommandOptionType>
  = T extends integer ? IntegerOption<T>
    : T extends number ? NumberOption<T>
      : T extends string ? StringOption<T>
        : never

/**
 * A compiler macro that describes a slash command option. Used for defining
 * metadata for registering slash command options. Options defined here will
 * take higher precedence over the inferred ones from the function signature
 * and JSDoc tags.
 *
 * @param _option - The type of the option, used for type inference.
 * @param _options - The options for the command option.
 * @example
 * // this will describe the name option as a string with a minimum length of 1 and a maximum length of 32
 * describeOption(name, {
 *   minLength: 1,
 *   maxLength: 32,
 * })
 * // this will describe the style option as a string with three choices
 * describeOption(style, {
 *   choices: [
 *     { name: 'Formal', value: 'formal' },
 *     { name: 'Casual', value: 'casual' },
 *     { name: 'Enthusiastic', value: 'enthusiastic' },
 *   ],
 * })
 */
export function describeOption<const T extends SlashCommandOptionType>(
  _option: T | undefined,
  _options: NarrowedDescribeOptionOptions<T>,
): void {
  // This function is a placeholder for the build time macro
}
