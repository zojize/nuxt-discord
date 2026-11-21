import type { APIApplicationCommandOption, AutocompleteInteraction, ChatInputCommandInteraction, CommandInteraction, Interaction, Message, MessageReaction, RESTGetAPIApplicationCommandsResult, RESTPutAPIApplicationCommandsResult, TextBasedChannel, ThreadChannel, Typing, VoiceState } from 'discord.js'
import type { EffectScope } from 'vue'
import type { MiddlewareEntry, NuxtDiscordOptions, SlashCommandOption, SlashCommandOptionType, SlashCommandRuntime, SlashCommandSubcommandGroupRuntime, SlashCommandSubcommandRuntime } from '../../../types'
import type { ContextMenuDefinition } from './defineContextMenu'
import type { ListenerDefinition } from './defineListener'
import type { MiddlewareOpts } from './defineMiddleware'
import process from 'node:process'
import { ApplicationCommandOptionType, ApplicationCommandType, ContextMenuCommandBuilder, Events, Client as InternalClient, MessageFlags, REST, Routes, SlashCommandBuilder, SlashCommandSubcommandBuilder, SlashCommandSubcommandGroupBuilder } from 'discord.js'
import { useNitroApp, useRuntimeConfig } from 'nitropack/runtime'
import { effectScope, isRef, onScopeDispose } from 'vue'
import { interactionSender, scheduleAcknowledgement } from '../../acknowledgement'
import { currentInvocation, runInvocation, setInvocationFields } from '../../discordInvocation'
import { logger } from '../../logger'
import { resolveMiddlewareTags } from '../../middleware'
import { MiddlewareError } from './defineMiddleware'
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

export interface MiddlewareDeniedError extends DiscordClientErrorBase {
  type: 'MiddlewareDeniedError'
  interaction: Interaction
  middleware: string
  reason: string
  identifier?: string
}

export type DiscordClientError
  = | UnknownSlashCommandError
    | MissingRequiredOptionError
    | SlashCommandExecutionError
    | SlashCommandRegistrationError
    | MiddlewareDeniedError

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
  status: 'ok' | 'denied' | 'error'
  detail?: string
}

export interface DispatchResult {
  status: ActivityLogEntry['status']
  detail?: string
  dispose: () => void
}

export function useInteraction(): ChatInputCommandInteraction | null {
  return currentInvocation()?.interaction ?? null
}

export function setCurrentChannel(channel: TextBasedChannel | null) {
  setInvocationFields({ channel })
}

export function getCurrentChannel(): TextBasedChannel | null {
  return currentInvocation()?.channel ?? null
}

class UnknownCommandError extends Error {}
class MissingOptionError extends Error {
  constructor(readonly option: string) {
    super(`Missing required option "${option}"`)
  }
}

/**
 * Map of Discord event names to a function that extracts the relevant TextBasedChannel
 * from the event's args. Used by registerListeners to set currentChannel before invoking
 * the user handler so useTextChannel() works inside listeners.
 */
const LISTENER_CHANNEL_ACCESSORS: Record<string, (...args: any[]) => TextBasedChannel | null> = {
  messageCreate: (msg: Message) => msg.channel ?? null,
  messageUpdate: (_old: Message, newMsg: Message) => newMsg?.channel ?? null,
  messageDelete: (msg: Message) => msg.channel ?? null,
  messageReactionAdd: (reaction: MessageReaction) => reaction?.message?.channel ?? null,
  messageReactionRemove: (reaction: MessageReaction) => reaction?.message?.channel ?? null,
  typingStart: (typing: Typing) => (typing?.channel as TextBasedChannel) ?? null,
  channelCreate: (ch: any) => (ch && 'send' in ch ? ch as TextBasedChannel : null),
  channelUpdate: (_old: any, newCh: any) => (newCh && 'send' in newCh ? newCh as TextBasedChannel : null),
  channelDelete: (ch: any) => (ch && 'send' in ch ? ch as TextBasedChannel : null),
  threadCreate: (thread: ThreadChannel) => thread as unknown as TextBasedChannel,
  threadUpdate: (_old: ThreadChannel, newThread: ThreadChannel) => newThread as unknown as TextBasedChannel,
  threadDelete: (thread: ThreadChannel) => thread as unknown as TextBasedChannel,
  voiceStateUpdate: (_old: VoiceState, newState: VoiceState) =>
    (newState?.channel && 'send' in newState.channel ? newState.channel as TextBasedChannel : null),
}

export class DiscordClient {
  #client: InternalClient | null = null
  public get internalClient() {
    return this.#client
  }

  #slashCommands: SlashCommandRuntime[] = []
  #contextMenus: (ContextMenuDefinition & { name: string, middleware?: string[], middlewareEntries?: MiddlewareEntry[] })[] = []
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

    // Nitro serializes an unset runtime config value as an empty string.
    const timeout = useRuntimeConfig().discord?.interactionTimeout
    if (typeof timeout === 'number' && Number.isFinite(timeout) && timeout >= 0)
      this.#interactionTimeout = timeout

    // default print errors to console
    this.#nitro.hooks.hook('discord:client:error', (error: unknown) => {
      logger.error(error)
    })
  }

  #clientOptions?: NuxtDiscordOptions['client']
  #listeners: ListenerDefinition[] = []
  #starting?: Promise<undefined>

  public start(options: NuxtDiscordOptions['client']): Promise<undefined> {
    if (this.#starting)
      return this.#starting
    if (this.isReady())
      return Promise.resolve(undefined)
    this.#starting = this.#connect(options).catch(async (error) => {
      await this.stop()
      throw error
    }).finally(() => { this.#starting = undefined })
    return this.#starting
  }

  async #connect(options: NuxtDiscordOptions['client']): Promise<undefined> {
    this.#clientOptions = { ...options }
    await this.#nitro.hooks.callHook('discord:client:config', this.#clientOptions)
    this.#client = new InternalClient(this.#clientOptions)
    this.#client.on(Events.InteractionCreate, interaction => this.dispatchInteraction(interaction))

    this.startScope()

    const { resolve, promise } = Promise.withResolvers<undefined>()

    this.#client.once(Events.ClientReady, (readyClient) => {
      logger.log(`Discord client is ready! Logged in as ${readyClient.user?.tag}`)
      this.#nitro.hooks.callHook('discord:client:ready', this)
      resolve(undefined)
    })

    this.#attachListeners(this.#listeners)
    await this.#client.login(this.#token)

    return promise
  }

  public registerListeners(listeners: ListenerDefinition[]) {
    this.#listeners.push(...listeners)
    if (this.#client)
      this.#attachListeners(listeners)
  }

  #attachListeners(listeners: ListenerDefinition[]) {
    if (!this.#client)
      return
    for (const listener of listeners) {
      const accessor = LISTENER_CHANNEL_ACCESSORS[listener.event]
      const handler = async (...args: unknown[]) => {
        const scope = this.#createScope()
        try {
          const channel = accessor?.(...args) ?? null
          await runInvocation(scope, { channel }, () => (listener.execute as (...a: unknown[]) => void | Promise<void>)(...args))
        }
        catch (error) {
          logger.error(`Listener error [${listener.event}]:`, error)
        }
        finally {
          scope.stop()
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

  public async dispatchInteraction(interaction: Interaction, options: { simulation?: boolean } = {}): Promise<DispatchResult> {
    const scope = this.#createScope()
    const dispose = () => scope.stop()
    const menu = interaction.isUserContextMenuCommand() || interaction.isMessageContextMenuCommand()
    if (!menu && !interaction.isChatInputCommand() && !interaction.isAutocomplete()) {
      dispose()
      return { status: 'error', detail: 'Unsupported interaction type', dispose }
    }

    const type = menu ? 'context-menu' : interaction.isAutocomplete() ? 'autocomplete' : 'command'
    const start = Date.now()
    const ctx = { interaction, type }
    const middleware: Record<string, unknown> = {}
    const result: DispatchResult = { status: 'ok', dispose }
    let command: SlashCommandRuntime | SlashCommandSubcommandRuntime | undefined
    let cancelAcknowledgement: (() => void) | undefined
    if (!options.simulation && this.#interactionTimeout !== 0) {
      const timeout = this.#interactionTimeout ?? Math.max(0, DiscordClient.DISCORD_TOKEN_LIFETIME - (start - (interaction.createdTimestamp ?? start)))
      const timer = setTimeout(dispose, timeout)
      timer.unref()
      scope.run(() => onScopeDispose(() => clearTimeout(timer)))
    }
    try {
      if (interaction.isChatInputCommand() || interaction.isAutocomplete())
        command = this.resolveSlashCommand(interaction.commandName, interaction.options.getSubcommandGroup?.(false), interaction.options.getSubcommand?.(false))
      if (!options.simulation && interaction.isChatInputCommand() && (command?.defer || this.#clientOptions?.deferOnPromise))
        cancelAcknowledgement = scheduleAcknowledgement(interaction, command?.defer)
      await runInvocation(scope, { channel: interaction.channel as TextBasedChannel | null, interaction: interaction.isChatInputCommand() ? interaction : undefined, middleware }, async () => {
        if (!options.simulation && type !== 'autocomplete')
          await this.#nitro.hooks.callHook('discord:interaction:before', ctx)
        if (interaction.isUserContextMenuCommand() || interaction.isMessageContextMenuCommand()) {
          const menuType = interaction.isUserContextMenuCommand() ? 'user' : 'message'
          const menu = this.#contextMenus.find(m => m.name === interaction.commandName && m.type === menuType)
          if (!menu)
            throw new UnknownCommandError(`Unknown context menu "${interaction.commandName}"`)
          const entries = [...resolveMiddlewareTags(menu.middleware, menu.name), ...menu.middlewareEntries ?? []]
          await this.#runMiddleware(entries, interaction, undefined, 'context-menu', middleware, async () => {
            const value = scope.run(() => {
              if (menu.type === 'user' && interaction.isUserContextMenuCommand())
                return menu.execute(interaction)
              if (menu.type === 'message' && interaction.isMessageContextMenuCommand())
                return menu.execute(interaction)
            })
            await this.#respond(value, interaction, scope)
          })
          return
        }

        if (!command)
          throw new UnknownCommandError(`Unknown slash command "${interaction.commandName}"`)
        if (!command.execute && command.load)
          Object.assign(command, await command.load())
        if (interaction.isAutocomplete()) {
          await this.#handleAutocomplete(interaction, command)
          return
        }
        const resolved = command
        const entries = [...resolveMiddlewareTags(resolved.middleware, resolved.path), ...resolved.middlewareEntries ?? []]
        await this.#runMiddleware(entries, interaction, resolved, 'command', middleware, async () => {
          const args = this.#commandArgs(interaction, resolved)
          if (!resolved.execute)
            throw new Error(`Command "${interaction.commandName}" has no execute function`)
          await this.#respond(scope.run(() => resolved.execute!(...args)), interaction, scope)
        })
      })
    }
    catch (error) {
      result.status = error instanceof MiddlewareError ? 'denied' : 'error'
      result.detail = error instanceof Error ? error.message : String(error)
      if (!options.simulation) {
        let hookError
        if (error instanceof MiddlewareError) {
          const denied = { ...ctx, middleware: error.identifier ?? 'unknown', reason: error.reason }
          hookError = { ...denied, type: 'MiddlewareDeniedError', identifier: error.identifier, client: this }
          await this.#nitro.hooks.callHook('discord:interaction:denied', denied)
        }
        else if (error instanceof UnknownCommandError) {
          hookError = { type: 'UnknownSlashCommandError', interaction, client: this }
        }
        else if (error instanceof MissingOptionError) {
          hookError = { type: 'MissingRequiredOptionError', interaction, client: this, command, option: error.option }
        }
        else {
          hookError = { type: 'SlashCommandExecutionError', interaction, client: this, command, error }
        }
        await this.#nitro.hooks.callHook('discord:client:error', hookError)
      }
      if (interaction.isAutocomplete()) {
        if (!interaction.responded)
          await interaction.respond([]).catch(() => {})
      }
      else if (!interaction.replied) {
        const sender = interactionSender(interaction)
        await sender.send({ content: result.status === 'denied' ? result.detail : 'An error occurred.', flags: MessageFlags.Ephemeral }).catch(() => {})
      }
    }
    finally {
      cancelAcknowledgement?.()
      if (!options.simulation && type !== 'autocomplete') {
        this.#logActivity({
          type,
          name: menu ? interaction.commandName : `/${interaction.commandName}`,
          status: result.status,
          detail: result.detail,
          duration: Date.now() - start,
          userId: interaction.user?.id,
          userName: interaction.user?.displayName,
          guildId: interaction.guildId ?? undefined,
          guildName: interaction.guild?.name,
          channelId: interaction.channelId ?? undefined,
        })
        await this.#nitro.hooks.callHook('discord:interaction:after', { ...ctx, status: result.status, detail: result.detail })
      }
      if (result.status !== 'ok' || type === 'autocomplete')
        dispose()
    }
    return result
  }

  public resolveSlashCommand(name: string, group?: string | null, leaf?: string | null): SlashCommandRuntime | SlashCommandSubcommandRuntime | undefined {
    const root = this.getSlashCommand(name)
    if (!root?.subcommands?.length)
      return group || leaf ? undefined : root
    if (!leaf)
      return undefined
    if (group)
      return root.subcommands.find(cmd => cmd.name === group)?.subcommands?.find(cmd => cmd.name === leaf)
    return root.subcommands.find(cmd => cmd.name === leaf && !cmd.subcommands?.length) as SlashCommandSubcommandRuntime | undefined
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

  async #runMiddleware(
    entries: MiddlewareEntry[],
    interaction: Interaction,
    command: SlashCommandRuntime | SlashCommandSubcommandRuntime | undefined,
    type: MiddlewareOpts['type'],
    context: Record<string, unknown>,
    execute: () => Promise<void>,
  ): Promise<void> {
    const runChain = async (index: number): Promise<void> => {
      const entry = entries[index]
      if (!entry)
        return execute()
      let continuation: Promise<void> | undefined
      await entry.fn({
        interaction,
        command,
        type,
        next: async (ctx) => {
          if (continuation)
            throw new Error(`Middleware ${entry.name} called next() twice`)
          Object.assign(context, ctx)
          continuation = runChain(index + 1)
          await continuation
        },
      }, entry.options)
      if (!continuation)
        throw new MiddlewareError('Command was stopped by middleware.', entry.name)
      await continuation
    }
    await runChain(0)
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

  #interactionTimeout?: number
  static DISCORD_TOKEN_LIFETIME = 15 * 60 * 1000

  #createScope() {
    return this.#scope?.run(() => effectScope()) ?? effectScope(true)
  }

  #commandArgs(interaction: ChatInputCommandInteraction, command: SlashCommandRuntime | SlashCommandSubcommandRuntime) {
    // discord.js option getters may return API types (e.g. APIRole) alongside class types,
    // but gateway bots always receive the class instances at runtime
    const args: (SlashCommandOptionType | undefined)[] = []
    for (const option of command.options) {
      const opt = interaction.options.get(option.name, false)
      if (option.required && opt == null)
        throw new MissingOptionError(option.name)

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

    return args
  }

  async #respond(value: unknown, interaction: CommandInteraction, scope: EffectScope): Promise<unknown> {
    const result = await value
    if (result == null || !scope.active)
      return
    if (typeof result === 'string' || isRef<string>(result))
      return this.#respond(reply(result), interaction, scope)
    if (typeof result === 'function')
      return scope.run(() => result.call(this, interaction, this))
    if (typeof result !== 'object')
      throw new TypeError(`Unexpected command return type: ${typeof result}`)
    const generator = Symbol.asyncIterator in result
      ? (result as AsyncIterable<unknown>)[Symbol.asyncIterator]()
      : Symbol.iterator in result ? (result as Iterable<unknown>)[Symbol.iterator]() : undefined
    if (!generator) {
      if (interaction.replied || interaction.deferred)
        return result
      throw new Error('Unexpected command return value')
    }
    let step = await scope.run(() => generator.next())
    while (step && !step.done && scope.active) {
      const response = await this.#respond(step.value, interaction, scope)
      step = await scope.run(() => generator.next(response))
    }
    if (step?.done && step.value != null)
      return this.#respond(step.value, interaction, scope)
  }

  async #handleAutocomplete(interaction: AutocompleteInteraction, command: SlashCommandRuntime | SlashCommandSubcommandRuntime): Promise<void> {
    const focused = interaction.options.getFocused(true)
    const varname = command.options.find(opt => opt.name === focused.name)?.varname
    const complete = varname && command.optionMacros?.[varname]?.autocomplete
    if (!complete)
      throw new Error(`No autocomplete handler for "${focused.name}"`)
    await interaction.respond(await complete(String(focused.value), interaction))
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

    const nameToCommands = Object.groupBy(flattenedLocalCommands, command => command.name)

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
