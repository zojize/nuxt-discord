import type { APIApplicationCommandOption, AutocompleteInteraction, ChatInputCommandInteraction, CommandInteraction, Interaction, RESTGetAPIApplicationCommandsResult, RESTPutAPIApplicationCommandsResult } from 'discord.js'
import type { EffectScope } from 'vue'
import type { NuxtDiscordOptions, SlashCommandOption, SlashCommandOptionType, SlashCommandReturnType, SlashCommandRuntime, SlashCommandSubcommandGroupRuntime, SlashCommandSubcommandRuntime } from '../../../types'
import type { ContextMenuDefinition } from './defineContextMenu'
import type { ListenerDefinition } from './defineListener'
import process from 'node:process'
import { ApplicationCommandOptionType, ApplicationCommandType, ContextMenuCommandBuilder, Events, Client as InternalClient, MessageFlags, REST, Routes, SlashCommandBuilder, SlashCommandSubcommandBuilder, SlashCommandSubcommandGroupBuilder } from 'discord.js'
import { useNitroApp, useRuntimeConfig } from 'nitropack/runtime'
import { effectScope, isRef } from 'vue'
import { logger } from '../../logger'
import { reply } from './reply'

export interface DiscordClientErrorBase {
  type: string
  client: DiscordClient
}

export interface UnknownSlashCommandError extends DiscordClientErrorBase {
  type: 'UnknownSlashCommandError'
  interaction: CommandInteraction
}

export interface MissingRequiredOptionError extends DiscordClientErrorBase {
  type: 'MissingRequiredOptionError'
  interaction: CommandInteraction
  command: SlashCommandRuntime
  option: string
}

export interface SlashCommandExecutionError extends DiscordClientErrorBase {
  type: 'SlashCommandExecutionError'
  interaction: CommandInteraction
  command: SlashCommandRuntime
  error: unknown
}

export interface SlashCommandRegistrationError extends DiscordClientErrorBase {
  type: 'SlashCommandRegistrationError'
  error: unknown
  command?: SlashCommandRuntime
}

export type DiscordClientError
  = | UnknownSlashCommandError
    | MissingRequiredOptionError
    | SlashCommandExecutionError
    | SlashCommandRegistrationError

export interface ActivityLogEntry {
  id: number
  timestamp: number
  type: 'command' | 'context-menu' | 'autocomplete' | 'error' | 'listener'
  name: string
  userId?: string
  userName?: string
  guildId?: string
  guildName?: string
  channelId?: string
  duration?: number
  status: 'ok' | 'error'
  detail?: string
}

let currentInteraction: ChatInputCommandInteraction | null = null
export function useInteraction(): ChatInputCommandInteraction | null {
  return currentInteraction
}

export class DiscordClient {
  #client: InternalClient | null = null
  public get internalClient() {
    return this.#client
  }

  #slashCommands: SlashCommandRuntime[] = []
  #contextMenus: (ContextMenuDefinition & { name: string })[] = []
  #activityLog: ActivityLogEntry[] = []
  #activityId = 0
  #onActivity?: (entry: ActivityLogEntry) => void
  #nitro: { hooks: { callHook: (name: string, ...args: any[]) => Promise<void>, hook: (name: string, fn: (...args: any[]) => any) => void } } = useNitroApp() as any
  #token: string
  #clientId: string
  #rest: REST

  constructor() {
    if (!process.env.DISCORD_TOKEN) {
      throw new Error('DISCORD_TOKEN environment variable is not set')
    }
    this.#token = process.env.DISCORD_TOKEN
    this.#rest = new REST().setToken(this.#token)

    if (!process.env.DISCORD_CLIENT_ID) {
      throw new Error('DISCORD_CLIENT_ID environment variable is not set')
    }
    this.#clientId = process.env.DISCORD_CLIENT_ID

    this.#interactionTimeout = useRuntimeConfig().discord?.interactionTimeout

    // default print errors to console
    this.#nitro.hooks.hook('discord:client:error', (error: unknown) => {
      logger.error(error)
    })
  }

  #clientOptions?: NuxtDiscordOptions['client']
  public async start(options: NuxtDiscordOptions['client']): Promise<undefined> {
    this.#clientOptions = { ...options }
    await this.#nitro.hooks.callHook('discord:client:config', this.#clientOptions)
    this.#client = new InternalClient(this.#clientOptions)
    this.#client.on(Events.InteractionCreate, interaction => this.#handleInteraction(interaction))

    this.startScope()

    const { resolve, promise } = Promise.withResolvers<undefined>()

    this.#client.once(Events.ClientReady, (readyClient) => {
      logger.log(`Discord client is ready! Logged in as ${readyClient.user?.tag}`)
      this.#nitro.hooks.callHook('discord:client:ready', this)
      resolve(undefined)
    })

    await this.#client.login(this.#token)

    return promise
  }

  public registerListeners(listeners: ListenerDefinition[]) {
    if (!this.#client) {
      logger.warn('Cannot register listeners before client is started')
      return
    }
    for (const listener of listeners) {
      const handler = async (...args: unknown[]) => {
        try {
          await (listener.execute as (...a: unknown[]) => void | Promise<void>)(...args)
        }
        catch (error) {
          logger.error(`Listener error [${listener.event}]:`, error)
        }
      }
      if (listener.once) {
        this.#client.once(listener.event, handler)
      }
      else {
        this.#client.on(listener.event, handler)
      }
    }
    if (listeners.length > 0) {
      logger.log(`Registered ${listeners.length} event listener(s)`)
    }
  }

  public addContextMenus(menus: (ContextMenuDefinition & { name: string })[]) {
    this.#contextMenus.push(...menus)
  }

  public getContextMenus() {
    return this.#contextMenus
  }

  async #handleInteraction(interaction: Interaction) {
    if (interaction.isUserContextMenuCommand() || interaction.isMessageContextMenuCommand()) {
      await this.#handleContextMenu(interaction)
      return
    }
    if (!interaction.isAutocomplete() && !interaction.isChatInputCommand()) {
      return
    }

    const activityStart = Date.now()

    const commandName = interaction.commandName
    let command: SlashCommandRuntime | SlashCommandSubcommandRuntime | undefined
      = this.#slashCommands.find(cmd => cmd.name === commandName)
    if (!command) {
      logger.warn(`Unknown slash command: ${commandName}`)
      this.#nitro.hooks.callHook('discord:client:error', {
        type: 'UnknownSlashCommandError',
        client: this,
        interaction,
      })
      return
    }

    if (command.subcommands != null && (command.subcommands?.length ?? 0) > 0) {
      const group = interaction.options.getSubcommandGroup(false)
      const subcommand = interaction.options.getSubcommand(false)
      if (group && subcommand) {
        command = command.subcommands
          .find(subcmd => subcmd.name === group)
          ?.subcommands
          ?.find(subcmd => subcmd.name === subcommand)
      }
      else if (subcommand) {
        command = command.subcommands.find(subcmd => subcmd.name === subcommand) as SlashCommandSubcommandRuntime | undefined
      }
      else {
        logger.warn(`Unknown slash command subcommand: ${commandName} ${group ?? ''} ${subcommand}`)
      }
    }

    if (!command) {
      logger.warn(`Unknown slash command: ${commandName}`)
      this.#nitro.hooks.callHook('discord:client:error', {
        type: 'UnknownSlashCommandError',
        client: this,
        interaction,
      })
      return
    }

    if (!command.execute && command.load) {
      try {
        const dynamicCommand = await command.load()
        Object.assign(command, dynamicCommand)
      }
      catch (error) {
        this.#nitro.hooks.callHook('discord:client:error', {
          type: 'SlashCommandExecutionError',
          client: this,
          interaction,
          command,
          error,
        })
        return
      }
    }

    if (!command.execute && !command.load) {
      this.#nitro.hooks.callHook('discord:client:error', {
        type: 'SlashCommandExecutionError',
        client: this,
        interaction,
        command,
        error: new Error(`Slash command "${commandName}" cannot be executed or loaded`),
      })
      return
    }

    if (interaction.isAutocomplete()) {
      await this.#handleAutocomplete(interaction, command)
    }
    else if (interaction.isChatInputCommand()) {
      await this.#handleSlashCommand(interaction, command)
      this.#logActivity({
        type: 'command',
        name: `/${commandName}`,
        status: 'ok',
        duration: Date.now() - activityStart,
        userId: interaction.user?.id,
        userName: interaction.user?.displayName,
        guildId: interaction.guildId ?? undefined,
        guildName: interaction.guild?.name,
        channelId: interaction.channelId,
      })
    }
  }

  async #handleContextMenu(interaction: import('discord.js').UserContextMenuCommandInteraction | import('discord.js').MessageContextMenuCommandInteraction): Promise<void> {
    const start = Date.now()
    const menu = this.#contextMenus.find(m => m.name === interaction.commandName)
    if (!menu) {
      logger.warn(`Unknown context menu command: ${interaction.commandName}`)
      return
    }
    const activityBase = {
      type: 'context-menu' as const,
      name: interaction.commandName,
      userId: interaction.user?.id,
      userName: interaction.user?.displayName,
      guildId: interaction.guildId ?? undefined,
      guildName: interaction.guild?.name,
      channelId: interaction.channelId,
    }
    try {
      const result: unknown = menu.type === 'user' && interaction.isUserContextMenuCommand()
        ? await menu.execute(interaction)
        : menu.type === 'message' && interaction.isMessageContextMenuCommand()
          ? await menu.execute(interaction)
          : undefined
      // Support reply builder pattern: if execute returns a function, call it with the interaction
      if (typeof result === 'function') {
        await (result as (...args: unknown[]) => unknown)(interaction, this)
      }
      else if (typeof result === 'string') {
        await (reply(result) as (...args: unknown[]) => unknown)(interaction, this)
      }
      this.#logActivity({ ...activityBase, status: 'ok', duration: Date.now() - start })
    }
    catch (error) {
      logger.error(`Context menu error [${interaction.commandName}]:`, error)
      this.#logActivity({ ...activityBase, status: 'error', duration: Date.now() - start, detail: String(error) })
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'An error occurred.', flags: MessageFlags.Ephemeral }).catch(() => {})
      }
    }
  }

  #logActivity(entry: Omit<ActivityLogEntry, 'id' | 'timestamp'>): ActivityLogEntry {
    const full: ActivityLogEntry = { ...entry, id: ++this.#activityId, timestamp: Date.now() }
    this.#activityLog.push(full)
    if (this.#activityLog.length > 200)
      this.#activityLog.shift()
    this.#onActivity?.(full)
    return full
  }

  public onActivity(callback: (entry: ActivityLogEntry) => void) {
    this.#onActivity = callback
  }

  public getActivityLog(): ActivityLogEntry[] {
    return this.#activityLog
  }

  public async stop(): Promise<void> {
    if (this.#client) {
      await this.#client.destroy()
      this.#client = null
    }
    this.stopScope()
  }

  #scope?: EffectScope
  public startScope() {
    if (this.#scope)
      return
    this.#scope = effectScope(/* detached */ true)
  }

  public stopScope() {
    if (!this.#scope)
      return
    this.#scope.stop()
    this.#scope = undefined
  }

  public isReady(): boolean {
    return this.#client?.isReady() ?? false
  }

  public addSlashCommand(command: SlashCommandRuntime) {
    const existingCommandIndex = this.#slashCommands.findIndex(cmd => cmd.name === command.name)
    if (existingCommandIndex !== -1) {
      // replace existing command
      this.#slashCommands[existingCommandIndex] = command
    }
    else {
      this.#slashCommands.push(command)
    }
  }

  public addSlashCommands(commands: SlashCommandRuntime[]) {
    for (const command of commands) {
      this.addSlashCommand(command)
    }
  }

  public removeSlashCommand(name: string) {
    const index = this.#slashCommands.findIndex(cmd => cmd.name === name)
    if (index !== -1) {
      this.#slashCommands.splice(index, 1)
    }
  }

  public clearSlashCommands() {
    this.#slashCommands = []
  }

  public getSlashCommands(): SlashCommandRuntime[] {
    return this.#slashCommands
  }

  public getSlashCommand(name: string): SlashCommandRuntime | undefined {
    return this.#slashCommands.find(cmd => cmd.name === name)
  }

  #interactionScopes: WeakMap<ChatInputCommandInteraction, EffectScope> = new WeakMap()
  #interactionTimeout?: number
  static DISCORD_TOKEN_LIFETIME = 15 * 60 * 1000 // 15 minutes
  #commandFinalizationRegistry = new FinalizationRegistry((scope: EffectScope) => scope.stop())
  async #handleSlashCommand(interaction: ChatInputCommandInteraction, command: SlashCommandRuntime | SlashCommandSubcommandRuntime): Promise<void> {
    // discord.js option getters may return API types (e.g. APIRole) alongside class types,
    // but gateway bots always receive the class instances at runtime
    const args: (SlashCommandOptionType | undefined)[] = []
    for (const option of command.options) {
      const opt = interaction.options.get(option.name, option.required)
      if (option.required && opt == null) {
        this.#nitro.hooks.callHook('discord:client:error', {
          type: 'MissingRequiredOptionError',
          client: this,
          interaction,
          command,
          option: option.name,
        })
        return
      }

      switch (option.type) {
        case ApplicationCommandOptionType.User:
          args.push(opt?.user ?? undefined)
          break
        case ApplicationCommandOptionType.Role:
          args.push(opt?.role ?? undefined)
          break
        case ApplicationCommandOptionType.Mentionable:
          args.push(opt?.user ?? opt?.member ?? opt?.role ?? undefined)
          break
        case ApplicationCommandOptionType.Attachment:
          args.push(opt?.attachment ?? undefined)
          break
        default:
          args.push(opt?.value)
          break
      }
    }

    let scope!: EffectScope
    if (this.#scope) {
      // this scope should be a child of the client scope
      this.#scope.run(() => (scope = effectScope()))
    }
    else {
      scope = effectScope()
    }

    this.#interactionScopes.set(interaction, scope)
    if (import.meta.dev)
      this.#commandFinalizationRegistry.register(command, scope)

    try {
      let result!: SlashCommandReturnType
      scope.run(() => {
        currentInteraction = interaction
        result = command.execute!(...args)
        currentInteraction = null
      })

      if (this.#clientOptions?.deferOnPromise && isPromise(result)) {
        await interaction.deferReply()
      }

      await this.#handleSlashCommandReturn(result, interaction, command)
    }
    catch (error) {
      this.#nitro.hooks.callHook('discord:client:error', {
        type: 'SlashCommandExecutionError',
        client: this,
        interaction,
        command,
        error,
      })
    }

    // Schedule scope disposal based on remaining interaction token lifetime
    if (this.#interactionTimeout !== 0) {
      const timeout = this.#interactionTimeout
        ?? Math.max(0, DiscordClient.DISCORD_TOKEN_LIFETIME - (Date.now() - interaction.createdTimestamp))
      setTimeout(() => {
        scope.stop()
        this.#interactionScopes.delete(interaction)
      }, timeout)
    }
  }

  async #handleSlashCommandReturn(
    // not sure why Awaited<SlashCommandReturnType> does't work here
    result: SlashCommandReturnType,
    interaction: ChatInputCommandInteraction,
    command: SlashCommandRuntime | SlashCommandSubcommandRuntime,
    // TODO: type this
  ): Promise<unknown> {
    // @ts-expect-error - i don't know why this error occurs
    result = await result

    if (!result) {
      return
    }

    try {
      if (typeof result === 'string' || isRef(result)) {
        return this.#handleSlashCommandReturn(reply(result), interaction, command)
      }
      else if (typeof result === 'function') {
        const scope = this.#interactionScopes.get(interaction)
        if (!scope) {
          return result.call(this, interaction, this)
        }
        else {
          return scope.run(() => result.call(this, interaction, this))
        }
      }
      else if (Symbol.iterator in result && typeof result[Symbol.iterator] === 'function') {
        const gen = result[Symbol.iterator]()
        let next = gen.next()
        while (!next.done) {
          next = gen.next(await this.#handleSlashCommandReturn(await next.value, interaction, command))
        }
        if (next.value != null) {
          return this.#handleSlashCommandReturn(next.value, interaction, command)
        }
      }
      else if (Symbol.asyncIterator in result && typeof result[Symbol.asyncIterator] === 'function') {
        const gen = result[Symbol.asyncIterator]()
        let next = await gen.next()
        while (!next.done) {
          next = await gen.next(await this.#handleSlashCommandReturn(await next.value, interaction, command))
        }
        if (next.value != null) {
          return this.#handleSlashCommandReturn(next.value, interaction, command)
        }
      }
      else {
        if (result != null) {
          throw new Error(`Unexpected return type from slash command: ${typeof result}`)
        }
      }
    }
    catch (error) {
      this.#nitro.hooks.callHook('discord:client:error', {
        type: 'SlashCommandExecutionError',
        client: this,
        interaction,
        command,
        error,
      })
    }
  }

  async #handleAutocomplete(interaction: AutocompleteInteraction, command: SlashCommandRuntime | SlashCommandSubcommandRuntime): Promise<void> {
    const commandName = interaction.commandName

    if (!command) {
      logger.warn(`Unknown slash command: ${commandName}`)
      this.#nitro.hooks.callHook('discord:client:error', {
        type: 'UnknownSlashCommandError',
        client: this,
        interaction,
      })
      return
    }

    const focusedOption = interaction.options.getFocused(true)
    const varname = command.options.find(opt => opt.name === focusedOption.name)?.varname
    if (!varname) {
      // TODO: error here
      return
    }

    const autocompleteFunction = command.optionMacros?.[varname]?.autocomplete
    if (!autocompleteFunction) {
      // TODO: error here
      return
    }

    const choices = await autocompleteFunction(focusedOption.value as string, interaction)

    await interaction.respond(choices)
  }

  #getSlashCommandBuilder<Builder extends SlashCommandBuilder | SlashCommandSubcommandGroupBuilder | SlashCommandSubcommandBuilder>(
    command: SlashCommandRuntime | SlashCommandSubcommandGroupRuntime | SlashCommandSubcommandRuntime,
    builder?: Builder,
  ): Builder {
    builder ??= new SlashCommandBuilder() as Builder
    builder
      .setName(command.name)
      .setDescription(command.description)

    if (command.nameLocalizations)
      builder.setNameLocalizations(command.nameLocalizations)
    if (command.descriptionLocalizations)
      builder.setDescriptionLocalizations(command.descriptionLocalizations)

    // Command-level properties only apply to the top-level builder
    if (builder instanceof SlashCommandBuilder) {
      if (command.nsfw != null)
        builder.setNSFW(command.nsfw)
      if (command.contexts != null)
        builder.setContexts(...command.contexts)
      if (command.defaultMemberPermissions !== undefined)
        builder.setDefaultMemberPermissions(command.defaultMemberPermissions)
    }

    if (command.subcommands != null && command.subcommands.length > 0) {
      for (const subcommand of command.subcommands) {
        if (builder instanceof SlashCommandBuilder) {
          if ('subcommands' in subcommand && (subcommand.subcommands?.length ?? 0) > 0) {
            builder.addSubcommandGroup(subcommandGroupBuilder => this.#getSlashCommandBuilder(subcommand, subcommandGroupBuilder))
          }
          else {
            builder.addSubcommand(subcommandBuilder => this.#getSlashCommandBuilder(subcommand, subcommandBuilder))
          }
        }
        else if (builder instanceof SlashCommandSubcommandGroupBuilder) {
          builder.addSubcommand(subcommandBuilder => this.#getSlashCommandBuilder(subcommand, subcommandBuilder))
        }
        else {
          // this should never happen, but just in case
          throw new TypeError(`Unexpected builder type: ${builder.constructor.name}`)
        }
      }
    }
    else if (builder instanceof SlashCommandBuilder || builder instanceof SlashCommandSubcommandBuilder) {
      for (const option of command.options) {
        switch (option.type) {
          case ApplicationCommandOptionType.String:
            builder.addStringOption((opt) => {
              setBasicOptionFields(opt, option)
              if (option.minLength)
                opt.setMinLength(option.minLength)
              if (option.maxLength)
                opt.setMaxLength(option.maxLength)
              if (option.choices)
                opt.addChoices(...option.choices)
              if (option.hasAutocomplete)
                opt.setAutocomplete(true)
              return opt
            })
            break
          case ApplicationCommandOptionType.Integer:
            builder.addIntegerOption((opt) => {
              setBasicOptionFields(opt, option)
              if (option.min)
                opt.setMinValue(option.min)
              if (option.max)
                opt.setMaxValue(option.max)
              if (option.choices)
                opt.addChoices(...option.choices)
              if (option.hasAutocomplete)
                opt.setAutocomplete(true)
              return opt
            })
            break
          case ApplicationCommandOptionType.Number:
            builder.addNumberOption((opt) => {
              setBasicOptionFields(opt, option)
              if (option.min)
                opt.setMinValue(option.min)
              if (option.max)
                opt.setMaxValue(option.max)
              if (option.choices)
                opt.addChoices(...option.choices)
              if (option.hasAutocomplete)
                opt.setAutocomplete(true)
              return opt
            })
            break
          case ApplicationCommandOptionType.Boolean:
            builder.addBooleanOption(opt => setBasicOptionFields(opt, option))
            break
          case ApplicationCommandOptionType.User:
            builder.addUserOption(opt => setBasicOptionFields(opt, option))
            break
          case ApplicationCommandOptionType.Role:
            builder.addRoleOption(opt => setBasicOptionFields(opt, option))
            break
          case ApplicationCommandOptionType.Mentionable:
            builder.addMentionableOption(opt => setBasicOptionFields(opt, option))
            break
          case ApplicationCommandOptionType.Attachment:
            builder.addAttachmentOption(opt => setBasicOptionFields(opt, option))
            break
        }
      }
    }

    return builder
  }

  #cachedRemoteSlashCommands: RESTGetAPIApplicationCommandsResult | null = null
  public async getRemoteSlashCommands() {
    this.#cachedRemoteSlashCommands = await this.#rest.get(Routes.applicationCommands(this.#clientId)) as RESTGetAPIApplicationCommandsResult
    return this.#cachedRemoteSlashCommands
  }

  public async diffRemoteSlashCommands(localCommands = this.#slashCommands, forceRefresh = false) {
    if (!this.#cachedRemoteSlashCommands || forceRefresh) {
      await this.getRemoteSlashCommands()
    }

    // Filter out context menu commands — they're managed separately
    const remoteCommands = this.#cachedRemoteSlashCommands!.filter(
      cmd => cmd.type === undefined || cmd.type === ApplicationCommandType.ChatInput,
    )
    const flattenedRemoteCommands = remoteCommands.flatMap((cmd) => {
      const subcommands = cmd.options?.flatMap((option) => {
        const name = `${cmd.name} ${option.name}`
        if (option.type === ApplicationCommandOptionType.Subcommand) {
          return [{ ...option, name, subcommands: [] }]
        }
        else if (option.type === ApplicationCommandOptionType.SubcommandGroup) {
          const subcommands = option.options?.flatMap((suboption) => {
            return suboption.type === ApplicationCommandOptionType.Subcommand
              ? [{ ...suboption, name: `${name} ${suboption.name}`, subcommands: [] }]
              : []
          }) ?? []
          return [
            { ...option, name, subcommands },
            ...subcommands,
          ]
        }
        return []
      }) ?? []

      return [
        { ...cmd, subcommands },
        ...subcommands,
      ]
    })

    type RemoteSlashCommand = typeof flattenedRemoteCommands[number]

    type LocalSlashCommand = SlashCommandRuntime | SlashCommandSubcommandRuntime | SlashCommandSubcommandGroupRuntime
    const flattenedLocalCommands = localCommands
      .flatMap<LocalSlashCommand>(
        cmd => [
          cmd,
          ...cmd.subcommands?.flatMap((subcmd) => {
            const name = `${cmd.name} ${subcmd.name}`
            return [
              { ...subcmd, name },
              ...(subcmd.subcommands?.map(subsubcmd => ({ ...subsubcmd, name: `${name} ${subsubcmd.name}` })) ?? []),
            ]
          }) ?? [],
        ],
      )

    const nameToCommands = flattenedLocalCommands.reduce((acc, command) => {
      (acc[command.name] ??= []).push(command)
      return acc
    }, {} as Record<string, LocalSlashCommand[]>)

    return flattenedLocalCommands.reduce((acc, command) => {
      // if there are multiple commands with the same name
      if (nameToCommands[command.name]!.length > 1) {
        acc.conflict.push(command)
        return acc
      }

      const remoteCommand = flattenedRemoteCommands.find(cmd => cmd.name === command.name)
      // if the remote command does not exist
      if (!remoteCommand) {
        acc.added.push(command)
      }
      else if (
        // if some properties are different
        !propsEqual(command, remoteCommand, ['description'/* TODO: more */])
        // if either command is not a subcommand
        || (!((command.subcommands?.length ?? 0) > 0 && remoteCommand.subcommands.length > 0)
          // and if the number of options is different
          && ((command.options?.length ?? 0) !== (remoteCommand.options?.length ?? 0)
            // or if the option details are different
            || ((remoteCommand.options ?? []).some((opt, i) => !optionEqual(command.options![i]!, opt)))))
      ) {
        acc.changed.push({ local: command, remote: remoteCommand })
      }
      else {
        if ('id' in remoteCommand && !command.id) {
          // if the remote command has an ID but the local command does not, it means it was registered before
          // and we need to update the local command with the remote ID
          command.id = remoteCommand.id
        }

        acc.synced.push({ local: command, remote: remoteCommand })
      }

      return acc
    }, {
      added: [] as LocalSlashCommand[],
      removed: flattenedRemoteCommands.filter(({ name }) => !(name in nameToCommands)),
      changed: [] as { local: LocalSlashCommand, remote: RemoteSlashCommand }[],
      synced: [] as { local: LocalSlashCommand, remote: RemoteSlashCommand }[],
      conflict: [] as LocalSlashCommand[],
    })
  }

  public async registerSlashCommands(configGuildIds: string[] = []) {
    const globalCommands = this.#slashCommands.filter(cmd => !cmd.guilds)
    const guildCommands = this.#slashCommands.filter(cmd => cmd.guilds)

    const results: RESTPutAPIApplicationCommandsResult = []

    // Build context menu JSON for registration
    const contextMenuJsons = this.#contextMenus.map((menu) => {
      const builder = new ContextMenuCommandBuilder()
        .setName(menu.name)
        .setType(menu.type === 'user' ? ApplicationCommandType.User : ApplicationCommandType.Message)
      return builder.toJSON()
    })

    // Register global commands + context menus
    if (globalCommands.length > 0 || contextMenuJsons.length > 0) {
      const globalResult = await this.#registerCommandsToRoute(
        Routes.applicationCommands(this.#clientId),
        globalCommands,
        contextMenuJsons,
      )
      results.push(...globalResult)
    }

    // Collect all target guild IDs: per-command specific IDs + config-level IDs for `guilds: true`
    const guildToCommands = new Map<string, SlashCommandRuntime[]>()

    for (const cmd of guildCommands) {
      const targetIds = cmd.guilds === true ? configGuildIds : cmd.guilds!
      for (const id of targetIds) {
        const list = guildToCommands.get(id)
        if (list)
          list.push(cmd)
        else
          guildToCommands.set(id, [cmd])
      }
    }

    if (guildCommands.length > 0 && guildToCommands.size === 0) {
      logger.warn(`${guildCommands.length} guild command(s) found but no guild IDs configured. Use @guild <id> or set DISCORD_GUILD_ID env var.`)
    }

    for (const [guildId, cmds] of guildToCommands) {
      const guildResult = await this.#registerCommandsToRoute(
        Routes.applicationGuildCommands(this.#clientId, guildId),
        cmds,
      )
      results.push(...guildResult)
    }

    // nullify the cache to force a refresh on next diff
    this.#cachedRemoteSlashCommands = null

    return results
  }

  async #registerCommandsToRoute(route: `/${string}`, commands: SlashCommandRuntime[], extraPayloads: unknown[] = []) {
    try {
      const body = [
        ...commands.map(command => this.#getSlashCommandBuilder(command).toJSON()),
        ...extraPayloads,
      ]
      const result = await this.#rest.put(route, { body }) as RESTPutAPIApplicationCommandsResult

      result.forEach((command, i) => {
        const localCommand = commands[i]
        if (localCommand) {
          localCommand.id = command.id
        }
      })

      return result
    }
    catch (error) {
      this.#nitro.hooks.callHook('discord:client:error', {
        type: 'SlashCommandRegistrationError',
        client: this,
        error,
      })
      return []
    }
  }
}

function setBasicOptionFields<T extends {
  setName: (name: string) => T
  setRequired: (required: boolean) => T
  setDescription: (description: string) => T
  setNameLocalizations: (map: import('discord.js').LocalizationMap | null) => T
  setDescriptionLocalizations: (map: import('discord.js').LocalizationMap | null) => T
}>(
  opt: T,
  option: { name: string, required: boolean, description: string, nameLocalizations?: import('discord.js').LocalizationMap, descriptionLocalizations?: import('discord.js').LocalizationMap },
): T {
  opt.setName(option.name).setRequired(option.required)
  opt.setDescription(option.description || option.name)
  if (option.nameLocalizations)
    opt.setNameLocalizations(option.nameLocalizations)
  if (option.descriptionLocalizations)
    opt.setDescriptionLocalizations(option.descriptionLocalizations)
  return opt
}

function propsEqual<const T, const U>(a: T, b: U, props: (keyof T & keyof U)[]): boolean
function propsEqual(a: Record<PropertyKey, unknown>, b: Record<PropertyKey, unknown>, props: PropertyKey[]): boolean {
  for (const prop of props) {
    if (a[prop] !== b[prop]) {
      return false
    }
  }
  return true
}

function optionEqual(a: SlashCommandOption, b: APIApplicationCommandOption): boolean {
  if (a.name !== b.name || a.description !== b.description || a.required !== !!b.required || a.type !== b.type) {
    return false
  }

  if (!!('choices' in a && a.choices) !== !!('choices' in b && b.choices)) {
    return false
  }
  else if ('choices' in a && a.choices && 'choices' in b && b.choices) {
    // if both has choices, compare them
    if (a.choices.length !== b.choices.length) {
      return false
    }

    for (let i = 0; i < a.choices.length; i++) {
      if (a.choices[i]!.name !== b.choices[i]!.name || a.choices[i]!.value !== b.choices[i]!.value) {
        return false
      }
    }
  }

  if (a.type === ApplicationCommandOptionType.Integer || a.type === ApplicationCommandOptionType.Number) {
    if ('min' in a !== 'min_value' in b) {
      return false
    }
    else if ('min' in a && 'min_value' in b && a.min !== b.min_value) {
      return false
    }
  }

  if (a.type === ApplicationCommandOptionType.String) {
    if ('minLength' in a !== 'min_length' in b) {
      return false
    }
    else if ('minLength' in a && 'min_length' in b && a.minLength !== b.min_length) {
      return false
    }
  }

  if (a.hasAutocomplete !== !!('autocomplete' in b && b.autocomplete)) {
    return false
  }

  // TODO: more

  return true
}

// https://stackoverflow.com/a/53955664/14835397
export function isPromise(value: any): value is Promise<unknown> {
  return typeof value?.then === 'function'
}
