import type { APIApplicationCommand, APIApplicationCommandOption, AutocompleteInteraction, ChatInputCommandInteraction, CommandInteraction, Interaction, RESTGetAPIApplicationCommandsResult, RESTPatchAPIApplicationCommandResult, RESTPutAPIApplicationCommandsResult } from 'discord.js'
import type { EffectScope } from 'vue'
import type { NuxtDiscordOptions, SlashCommandOption, SlashCommandOptionType, SlashCommandReturnType, SlashCommandRuntime } from '../../../types'
import process from 'node:process'
import { ApplicationCommandOptionType, Events, Client as InternalClient, REST, Routes, SlashCommandBuilder } from 'discord.js'
import { useNitroApp } from 'nitropack/runtime'
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
  #nitro = useNitroApp()
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

    // default print errors to console
    this.#nitro.hooks.hook('discord:client:error', (error) => {
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

  async #handleInteraction(interaction: Interaction) {
    // TODO: support middleware
    if (!interaction.isAutocomplete() && !interaction.isChatInputCommand()) {
      return
    }

    const commandName = interaction.commandName
    const command = this.#slashCommands.find(cmd => cmd.name === commandName)
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
    }
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
  #commandFinalizationRegistry = new FinalizationRegistry((scope: EffectScope) => scope.stop())
  async #handleSlashCommand(interaction: ChatInputCommandInteraction, command: SlashCommandRuntime): Promise<void> {
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

      // TODO: handle other types
      args.push(opt?.value)
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
      scope.run (() => {
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
  }

  async #handleSlashCommandReturn(
    // not sure why Awaited<SlashCommandReturnType> does't work here
    result: SlashCommandReturnType,
    interaction: ChatInputCommandInteraction,
    command: SlashCommandRuntime,
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

  async #handleAutocomplete(interaction: AutocompleteInteraction, command: SlashCommandRuntime): Promise<void> {
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

  #getSlashCommandBuilder(command: SlashCommandRuntime): SlashCommandBuilder {
    const builder = new SlashCommandBuilder()
      .setName(command.name)
      .setDescription(command.description)

    for (const option of command.options) {
      switch (option.type) {
        case ApplicationCommandOptionType.String:
          builder.addStringOption((opt) => {
            opt.setName(option.name)
              .setRequired(option.required)
            if (option.description.length > 0)
              opt = opt.setDescription(option.description)
            if (option.minLength)
              opt = opt.setMinLength(option.minLength)
            if (option.maxLength)
              opt = opt.setMaxLength(option.maxLength)
            if (option.choices)
              opt = opt.addChoices(...option.choices)
            if (option.hasAutocomplete) {
              opt = opt.setAutocomplete(true)
            }
            return opt
          })
          break
        case ApplicationCommandOptionType.Integer:
          builder.addIntegerOption((opt) => {
            opt.setName(option.name)
              .setRequired(option.required)
            if (option.description.length > 0)
              opt = opt.setDescription(option.description)
            if (option.min)
              opt = opt.setMinValue(option.min)
            if (option.max)
              opt = opt.setMaxValue(option.max)
            if (option.choices)
              opt = opt.addChoices(...option.choices)
            if (option.hasAutocomplete)
              opt = opt.setAutocomplete(true)
            return opt
          })
          break
        case ApplicationCommandOptionType.Number:
          builder.addNumberOption((opt) => {
            opt.setName(option.name)
              .setRequired(option.required)
            if (option.description.length > 0)
              opt = opt.setDescription(option.description)
            if (option.min)
              opt = opt.setMinValue(option.min)
            if (option.max)
              opt = opt.setMaxValue(option.max)
            if (option.choices)
              opt = opt.addChoices(...option.choices)
            if (option.hasAutocomplete)
              opt = opt.setAutocomplete(true)
            return opt
          })
          break
        case ApplicationCommandOptionType.Boolean:
          builder.addBooleanOption((opt) => {
            opt.setName(option.name)
              .setRequired(option.required)
            if (option.description.length > 0)
              opt = opt.setDescription(option.description)
            return opt
          })
          break
          // TODO: handle other types
      }
    }

    return builder
  }

  #cachedRemoteSlashCommands: RESTGetAPIApplicationCommandsResult | null = null
  public async getRemoteSlashCommands() {
    this.#cachedRemoteSlashCommands = await this.#rest.get(Routes.applicationCommands(this.#clientId)) as RESTGetAPIApplicationCommandsResult
    return this.#cachedRemoteSlashCommands
  }

  public async diffRemoteSlashCommands(localCommands = this.#slashCommands, forceRefresh = false): Promise<{
    added: SlashCommandRuntime[]
    removed: APIApplicationCommand[]
    changed: { local: SlashCommandRuntime, remote: APIApplicationCommand }[]
    synced: { local: SlashCommandRuntime, remote: APIApplicationCommand }[]
    conflict: SlashCommandRuntime[]
  }> {
    if (!this.#cachedRemoteSlashCommands || forceRefresh) {
      await this.getRemoteSlashCommands()
    }

    const remoteCommands = this.#cachedRemoteSlashCommands!

    const nameToCommands = localCommands.reduce((acc, command) => {
      (acc[command.name] ??= []).push(command)
      return acc
    }, {} as Record<string, SlashCommandRuntime[]>)

    return localCommands.reduce((acc, command) => {
      const remoteCommand = remoteCommands.find(cmd => cmd.name === command.name)

      // if there are multiple commands with the same name, we have a conflict
      if (nameToCommands[command.name].length > 1) {
        acc.conflict.push(command)
      }
      // if the remote command does not exist, we need to add it
      else if (!remoteCommand) {
        acc.added.push(command)
      }
      // check if the descriptions and options are the same
      else if (
        !propsEqual(command, remoteCommand, ['description'/* TODO: more */])
        || (command.options?.length ?? 0) !== (remoteCommand.options?.length ?? 0)
        || ((remoteCommand.options ?? []).some((opt, i) => !optionEqual(command.options![i], opt)))
      ) {
        acc.changed.push({ local: command, remote: remoteCommand })
      }
      else {
        if (remoteCommand.id && !command.id) {
          // if the remote command has an ID but the local command does not, it means it was registered before
          // and we need to update the local command with the remote ID
          command.id = remoteCommand.id
        }

        acc.synced.push({ local: command, remote: remoteCommand })
      }

      return acc
    }, {
      added: [] as SlashCommandRuntime[],
      removed: remoteCommands.filter(({ name }) => !localCommands.some(cmd => cmd.name === name)),
      changed: [] as { local: SlashCommandRuntime, remote: APIApplicationCommand }[],
      synced: [] as { local: SlashCommandRuntime, remote: APIApplicationCommand }[],
      conflict: [] as SlashCommandRuntime[],
    })
  }

  public async registerSlashCommands() {
    const diff = await this.diffRemoteSlashCommands()

    if (diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0) {
      // no changes, nothing to do
      logger.log('No changes to slash commands, skipping registration.')
      return []
    }

    // nullify the cache to force a refresh on next diff
    this.#cachedRemoteSlashCommands = null

    // do a full refresh if there are commands added or removed or more than 2 commands changed
    if (diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 2) {
      try {
        const result = await this.#rest.put(
          Routes.applicationCommands(this.#clientId),
          { body: this.#slashCommands.map(command => this.#getSlashCommandBuilder(command).toJSON()) },
        ) as RESTPutAPIApplicationCommandsResult

        result.forEach((command, i) => {
          const localCommand = this.#slashCommands[i]
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
    else {
      // only update changed commands
      const results = await Promise.allSettled(
        diff.changed.map((command) => {
          logger.log(`Updating slash command: ${command.local.name}`)
          const builder = this.#getSlashCommandBuilder(command.local)
          return this.#rest.patch(
            Routes.applicationCommand(this.#clientId, command.remote.id),
            { body: builder.toJSON() },
          ) as Promise<RESTPatchAPIApplicationCommandResult>
        }),
      )

      results.forEach((result, i) => {
        if (result.status === 'rejected') {
          this.#nitro.hooks.callHook('discord:client:error', {
            type: 'SlashCommandRegistrationError',
            client: this,
            command: result.reason.command,
            error: result.reason.error,
          })
        }
        else {
          const command = diff.changed[i]
          command.local.id = result.value.id
        }
      })

      return results
    }
  }
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
      if (a.choices[i].name !== b.choices[i].name || a.choices[i].value !== b.choices[i].value) {
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
