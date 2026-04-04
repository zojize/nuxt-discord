import type { DiscordClient } from '#build/types/nitro-imports'
import type { APIInteractionDataResolvedGuildMember, APIRole, Attachment, ChatInputCommandInteraction, ClientOptions, GuildMember, LocalizationMap, Role, User } from 'discord.js'
import type { ListenOptions } from 'listhen'
import type { MaybeRef } from 'vue'
import type { DescribeOptionOptions, IntegerOption, NumberOption, StringOption } from './runtime/server/utils/describeOption'
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
   * Guild IDs to register guild-specific commands to.
   * Commands tagged with `@guild` will be registered to these guilds
   * instead of globally. Useful for development (instant updates)
   * or server-specific commands.
   *
   * Can also be set via the DISCORD_GUILD_ID environment variable
   * (comma-separated for multiple guilds).
   */
  guilds?: string[]

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
  guilds: string[]
  dir: string
  buildDir: string
  rootDir: string
}

export const slashCommandOptionTypeIdentifiers = [
  'number',
  'integer',
  'string',
  'boolean',
  'User',
  'Role',
  'Mentionable',
  'Attachment',
] as const

export const typeIdentifierToEnum = {
  number: ApplicationCommandOptionType.Number,
  integer: ApplicationCommandOptionType.Integer,
  string: ApplicationCommandOptionType.String,
  boolean: ApplicationCommandOptionType.Boolean,
  User: ApplicationCommandOptionType.User,
  Role: ApplicationCommandOptionType.Role,
  Mentionable: ApplicationCommandOptionType.Mentionable,
  Attachment: ApplicationCommandOptionType.Attachment,
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
    | User
    | Role
    | APIRole
    | GuildMember
    | APIInteractionDataResolvedGuildMember
    | Attachment

export interface SlashCommandOptionBase {
  name: string
  description: string
  type: ApplicationCommandOptionType
  required: boolean
  hasAutocomplete: boolean
  nameLocalizations?: LocalizationMap
  descriptionLocalizations?: LocalizationMap
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

export interface SlashCommandUserOption extends SlashCommandOptionBase {
  type: ApplicationCommandOptionType.User
}

export interface SlashCommandRoleOption extends SlashCommandOptionBase {
  type: ApplicationCommandOptionType.Role
}

export interface SlashCommandMentionableOption extends SlashCommandOptionBase {
  type: ApplicationCommandOptionType.Mentionable
}

export interface SlashCommandAttachmentOption extends SlashCommandOptionBase {
  type: ApplicationCommandOptionType.Attachment
}

export type SlashCommandOption
  = | SlashCommandIntegerOption
    | SlashCommandNumberOption
    | SlashCommandStringOption
    | SlashCommandBooleanOption
    | SlashCommandUserOption
    | SlashCommandRoleOption
    | SlashCommandMentionableOption
    | SlashCommandAttachmentOption

export type SlashCommandCustomReturnHandler
  = (this: DiscordClient, interaction: ChatInputCommandInteraction, client: DiscordClient) => unknown

export type SlashCommandReturnType
  = | void
    | MaybeRef<string>
    | SlashCommandCustomReturnHandler
    | Promise<SlashCommandReturnType>
    | Generator<SlashCommandReturnType>
    | AsyncGenerator<SlashCommandReturnType>

export interface SlashCommand {
  name: string
  description: string
  nsfw?: boolean
  /** Interaction contexts where this command is available (Guild=0, BotDM=1, PrivateChannel=2) */
  contexts?: number[]
  defaultMemberPermissions?: string | null
  /** Register to specific guilds instead of globally. `true` = all configured guilds, `string[]` = specific guild IDs */
  guilds?: true | string[]
  nameLocalizations?: LocalizationMap
  descriptionLocalizations?: LocalizationMap
  path: string
  options: (SlashCommandOption & { varname: string })[]
  parents: []
  subcommands: (SlashCommandSubcommand | SlashCommandSubcommandGroup)[]
}

export interface SlashCommandSubcommandGroup extends Omit<SlashCommand, 'subcommands' | 'parents'> {
  parents: [string]
  subcommands: SlashCommandSubcommand[]
}
export interface SlashCommandSubcommand extends Omit<SlashCommand, 'subcommands' | 'parents'> {
  parents: [string] | [string, string]
  subcommands: []
}

export interface SlashCommandRuntime extends Omit<SlashCommand, 'subcommands'> {
  /** if execute is not defined load must be defined */
  load?: () => Promise<Pick<SlashCommandRuntime, 'execute' | 'optionMacros'>>
  execute?: (...args: (SlashCommandOptionType | undefined)[]) => SlashCommandReturnType
  id?: string
  optionMacros?: Record<string, DescribeOptionOptions>
  subcommands?: (SlashCommandSubcommandRuntime | SlashCommandSubcommandGroupRuntime)[]
}

export interface SlashCommandSubcommandGroupRuntime extends Omit<SlashCommandRuntime, 'subcommands' | 'parents'> {
  parents: [string]
  subcommands?: SlashCommandSubcommandRuntime[]
}
export interface SlashCommandSubcommandRuntime extends Omit<SlashCommandRuntime, 'subcommands' | 'parents'> {
  parents: [string] | [string, string]
  subcommands?: []
}

export interface Listener {
  /** File path */
  path: string
  /** Discord event name (e.g. 'guildMemberAdd') */
  event: string
  /** Whether this listener fires only once */
  once?: boolean
}

export type { ListenerDefinition } from './runtime/server/utils/defineListener'

export interface NuxtDiscordContext {
  nuxt: import('nuxt/schema').Nuxt
  options: NuxtDiscordOptions
  slashCommands: SlashCommand[]
  listeners: Listener[]
  resolve: {
    root: import('@nuxt/kit').Resolver['resolve']
    module: import('@nuxt/kit').Resolver['resolve']
  }
  logger: typeof import('./runtime/logger').logger
}
