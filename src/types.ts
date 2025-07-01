import type { DiscordClient } from '#build/types/nitro-imports'
import type { ChatInputCommandInteraction, ClientOptions } from 'discord.js'
import type { ListenOptions } from 'listhen'
import type { IntegerOption, NumberOption, StringOption } from './runtime/server/utils/describeOption'
import { ApplicationCommandOptionType } from 'discord.js'

export interface NuxtDiscordOptions {
  /**
   * Options passed to the internal Discord client.
   * Use the 'nitro:client:config' hook to configure
   * client options in runtime.
   *
   * @default { intents: [GatewayIntentBits.Guilds] }
   */
  client: ClientOptions & {
    /**
     * Whether to automatically defer the interaction reply
     * on slash command execution if the command returns a promise.
     *
     * @default true
     */
    deferOnPromise?: boolean
  }

  /**
   * The directory to scan for nuxt-discord related
   * files, such as slash commands.
   *
   * @default 'discord'
   */
  dir: string

  /**
   * Start the Discord client on init.
   *
   * @default true
   */
  autoStart: boolean

  /**
   * HMR options
   */
  watch: Partial<ListenOptions> & {
    /**
     * Enable or disable HMR for slash commands.
     *
     * @default true
     */
    enabled?: boolean

    /**
     * Whether to automatically register and update
     * slash commands on the Discord client.
     */
    sync?: false | {
      /**
       * Milliseconds to debounce before updating
       * on HMR events.
       *
       * @default 1000
       */
      debounce?: number
    }
  }
}

export interface DiscordRuntimeConfig {
  client: NuxtDiscordOptions['client']
  autoStart: boolean
  sync: NuxtDiscordOptions['watch']['sync']
  dir: string
  buildDir: string
  rootDir: string
}

export const slashCommandOptionTypeIdentifiers = [
  'number',
  'integer',
  'string',
  'boolean',
] as const

export const typeIdentifierToEnum = {
  number: ApplicationCommandOptionType.Number,
  integer: ApplicationCommandOptionType.Integer,
  string: ApplicationCommandOptionType.String,
  boolean: ApplicationCommandOptionType.Boolean,
} as const

export type SlashCommandOptionTypeIdentifier = (typeof slashCommandOptionTypeIdentifiers)[number]

declare const integerLabel: unique symbol

/**
 * An alias of the number type, represents the integer,
 * option when used as a slash command argument,
 */
export type integer = number & { [integerLabel]: never }

export type SlashCommandOptionType
  = | number
    | integer
    | string
    | boolean
    // TODO: more types

export interface SlashCommandOptionBase {
  name: string
  description: string
  type: ApplicationCommandOptionType
  required: boolean
  // TODO
}

export interface SlashCommandIntegerOption extends SlashCommandOptionBase, Omit<IntegerOption, 'name' | 'description'> {
  type: ApplicationCommandOptionType.Integer
}

export interface SlashCommandNumberOption extends SlashCommandOptionBase, Omit<NumberOption, 'name' | 'description'> {
  type: ApplicationCommandOptionType.Number
}

export interface SlashCommandStringOption extends SlashCommandOptionBase, Omit<StringOption, 'name' | 'description'> {
  type: ApplicationCommandOptionType.String
}

export interface SlashCommandBooleanOption extends SlashCommandOptionBase {
  type: ApplicationCommandOptionType.Boolean
}

export type SlashCommandOption
  = | SlashCommandIntegerOption
    | SlashCommandNumberOption
    | SlashCommandStringOption
    | SlashCommandBooleanOption
    // | SlashCommandOptionBase

export type SlashCommandCustomReturnHandler
  = (this: DiscordClient, interaction: ChatInputCommandInteraction, client: DiscordClient) => SlashCommandReturnType

export type SlashCommandReturnType
  = | void
    | string
    | SlashCommandCustomReturnHandler
    | Promise<SlashCommandReturnType>
    // TODO: type TNext
    | Generator<SlashCommandReturnType>
    | AsyncGenerator<SlashCommandReturnType>

export interface SlashCommand {
  name: string
  description: string
  // TODO: more properties e.g. nsfw, contexts, locales
  path: string
  options: SlashCommandOption[]
}

export interface SlashCommandRuntime extends SlashCommand {
  /** if execute is not defined load must be defined */
  load?: () => Promise<SlashCommandRuntime['execute']>
  execute?: (...args: (SlashCommandOptionType | undefined)[]) => SlashCommandReturnType
  id?: string
}

export interface NuxtDiscordContext {
  nuxt: import('nuxt/schema').Nuxt
  options: NuxtDiscordOptions
  slashCommands: SlashCommand[]
  resolve: {
    root: import('@nuxt/kit').Resolver['resolve']
    module: import('@nuxt/kit').Resolver['resolve']
  }
  logger: typeof import('./logger').logger
}
