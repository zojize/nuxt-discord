import type { AutocompleteInteraction, ChatInputCommandInteraction, CommandInteraction, Interaction, Message, MessageReaction, TextBasedChannel, ThreadChannel, Typing, VoiceState } from 'discord.js'
import type { EffectScope } from 'vue'
import type { MiddlewareEntry, NuxtDiscordOptions, SlashCommandOptionType, SlashCommandRuntime, SlashCommandSubcommandRuntime } from '../../../types'
import type { ContextMenuDefinition } from './defineContextMenu'
import type { ListenerDefinition } from './defineListener'
import type { MiddlewareOpts } from './defineMiddleware'
import { once } from 'node:events'
import process from 'node:process'
import { ApplicationCommandOptionType, Events, Client as InternalClient, MessageFlags, REST } from 'discord.js'
import { useNitroApp, useRuntimeConfig, useStorage } from 'nitropack/runtime'
import { effectScope, isRef, onScopeDispose } from 'vue'
import { interactionSender, scheduleAcknowledgement } from '../../acknowledgement'
import { currentInvocation, runInvocation, setInvocationFields } from '../../discordInvocation'
import { logger } from '../../logger'
import { resolveMiddlewareTags } from '../../middleware'
import { CommandRegistration, planRegistrations } from '../../registration'
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
  #registration: CommandRegistration

  constructor() {
    if (!process.env.DISCORD_TOKEN) {
      throw new Error('DISCORD_TOKEN environment variable is not set')
    }
    this.#token = process.env.DISCORD_TOKEN

    if (!process.env.DISCORD_CLIENT_ID) {
      throw new Error('DISCORD_CLIENT_ID environment variable is not set')
    }
    const appId = process.env.DISCORD_CLIENT_ID
    this.#registration = new CommandRegistration(new REST().setToken(this.#token), appId, {
      load: () => useStorage('data').getItem<string[]>(`nuxt-discord:${appId}:registration-scopes`),
      save: scopes => useStorage('data').setItem(`nuxt-discord:${appId}:registration-scopes`, scopes),
    }, (error) => {
      void this.#nitro.hooks.callHook('discord:client:error', { type: 'SlashCommandRegistrationError', client: this, error })
    })

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
  #connection?: AbortController
  #starting?: Promise<undefined>
  #stopping?: Promise<void>

  public start(options: NuxtDiscordOptions['client']): Promise<undefined> {
    if (this.#stopping)
      return this.#stopping.then(() => this.start(options))
    if (this.#starting)
      return this.#starting

    const connection = new AbortController()
    this.#connection = connection
    this.#starting = this.#connect(options, connection.signal).catch(async (error) => {
      if (!connection.signal.aborted)
        await this.stop()
      throw error
    })
    return this.#starting
  }

  async #connect(options: NuxtDiscordOptions['client'], signal: AbortSignal): Promise<undefined> {
    this.#clientOptions = { ...options }
    await this.#nitro.hooks.callHook('discord:client:config', this.#clientOptions)
    signal.throwIfAborted()
    const client = new InternalClient(this.#clientOptions)
    this.#client = client
    client.on(Events.InteractionCreate, interaction => this.dispatchInteraction(interaction))
    this.startScope()
    this.#attachListeners(this.#listeners)
    await Promise.all([once(client, Events.ClientReady, { signal }), client.login(this.#token)])
    signal.throwIfAborted()
    logger.log(`Discord client is ready! Logged in as ${client.user?.tag}`)
    void this.#nitro.hooks.callHook('discord:client:ready', this)
      ?.catch(error => logger.error('Discord ready hook failed:', error))
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
      if (!interaction.isAutocomplete() && (command?.defer || (!options.simulation && this.#clientOptions?.deferOnPromise))) {
        cancelAcknowledgement = scheduleAcknowledgement(interaction, command?.defer, !options.simulation)
        scope.run(() => onScopeDispose(cancelAcknowledgement!))
      }
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
        if (interaction.isAutocomplete()) {
          await this.#handleAutocomplete(interaction, command, scope)
          return
        }
        if (!command.execute && command.load)
          Object.assign(command, await command.load())
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
      if (interaction.isAutocomplete()) {
        if (scope.active && !interaction.responded)
          await interaction.respond([]).catch(() => {})
      }
      else if (scope.active && !interaction.replied) {
        const sender = interactionSender(interaction)
        await sender.send({ content: result.status === 'denied' ? result.detail : 'An error occurred.', flags: MessageFlags.Ephemeral }).catch(() => {})
      }
      if (!options.simulation) {
        let hookError
        if (error instanceof MiddlewareError) {
          const denied = { ...ctx, middleware: error.identifier ?? 'unknown', reason: error.reason }
          hookError = { ...denied, type: 'MiddlewareDeniedError', identifier: error.identifier, client: this }
          await this.#notify('discord:interaction:denied', denied)
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
        await this.#notify('discord:client:error', hookError)
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
        await this.#notify('discord:interaction:after', { ...ctx, status: result.status, detail: result.detail })
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

  async #notify(name: string, event: unknown) {
    try {
      await this.#nitro.hooks.callHook(name, event)
    }
    catch (error) {
      logger.error(`Discord observer failed [${name}]`, error)
    }
  }

  #logActivity(entry: Omit<ActivityLogEntry, 'id' | 'timestamp'>): ActivityLogEntry {
    const full: ActivityLogEntry = { ...entry, id: ++this.#activityId, timestamp: Date.now() }
    this.#activityLog.push(full)
    if (this.#activityLog.length > 200)
      this.#activityLog.shift()
    try {
      this.#onActivity?.(full)
    }
    catch (error) {
      logger.error('Discord activity observer failed:', error)
    }
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

  public stop(): Promise<void> {
    if (this.#stopping)
      return this.#stopping
    this.#connection?.abort()
    this.#connection = undefined
    this.#starting = undefined
    const client = this.#client
    this.#client = null
    this.stopScope()
    if (!client)
      return Promise.resolve()
    this.#stopping = Promise.resolve().then(() => client.destroy()).finally(() => {
      this.#stopping = undefined
    })
    return this.#stopping
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

  async #handleAutocomplete(interaction: AutocompleteInteraction, command: SlashCommandRuntime | SlashCommandSubcommandRuntime, scope: EffectScope): Promise<void> {
    const choices = async () => {
      if (!command.execute && command.load)
        Object.assign(command, await command.load())
      const focused = interaction.options.getFocused(true)
      const varname = command.options.find(opt => opt.name === focused.name)?.varname
      const complete = varname && command.optionMacros?.[varname]?.autocomplete
      if (!complete)
        throw new Error(`No autocomplete handler for "${focused.name}"`)
      return complete(String(focused.value), interaction)
    }
    // Autocomplete has no deferred response. Send an empty list before the
    // gateway deadline if command loading or the user's lookup runs long.
    const fallback = Promise.withResolvers<[]>()
    const elapsed = Date.now() - (interaction.createdTimestamp ?? Date.now())
    const timer = setTimeout(() => fallback.resolve([]), Math.max(0, 2000 - elapsed))
    timer.unref()
    scope.run(() => onScopeDispose(() => fallback.resolve([])))
    try {
      const result = await Promise.race([choices(), fallback.promise])
      if (scope.active && !interaction.responded)
        await interaction.respond(result.slice(0, 25))
    }
    finally {
      clearTimeout(timer)
    }
  }

  public getRemoteSlashCommands() {
    return this.#registration.read('global')
  }

  public diffRemoteSlashCommands(commands = this.#slashCommands, _forceRefresh = false) {
    return this.#registration.diff(this.#registrationPlan(commands))
  }

  #registrationPlan(commands = this.#slashCommands, guilds?: string[]) {
    const configured = useRuntimeConfig().discord?.guilds
    const targets = guilds ?? (configured?.length ? configured : (process.env.DISCORD_GUILD_ID ?? '').split(',').map(id => id.trim()).filter(Boolean))
    return planRegistrations(commands, this.#contextMenus, targets)
  }

  public async syncCommandRegistrations(options: { changedOnly?: boolean, guilds?: string[] } = {}) {
    return this.#registration.sync(this.#registrationPlan(this.#slashCommands, options.guilds), options.changedOnly)
  }

  public async registerSlashCommands(guilds?: string[]) {
    const results = await this.syncCommandRegistrations({ guilds })
    const errors = results.filter(result => result.error)
    if (errors.length)
      throw new Error(errors.map(result => `${result.scope}: ${result.error}`).join(', '))
    return results.flatMap(result => result.commands)
  }
}

// https://stackoverflow.com/a/53955664/14835397
export function isPromise(value: any): value is Promise<unknown> {
  return typeof value?.then === 'function'
}
