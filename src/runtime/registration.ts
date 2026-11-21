import type { APIApplicationCommand, APIApplicationCommandOption, REST, RESTPostAPIApplicationCommandsJSONBody } from 'discord.js'
import type { SlashCommandRuntime, SlashCommandSubcommandGroupRuntime, SlashCommandSubcommandRuntime } from '../types'
import type { ContextMenuDefinition } from './server/utils/defineContextMenu'
import { isDeepStrictEqual } from 'node:util'
import { ApplicationCommandOptionType, ApplicationCommandType, ContextMenuCommandBuilder, Routes, SlashCommandBuilder, SlashCommandSubcommandBuilder, SlashCommandSubcommandGroupBuilder } from 'discord.js'

function getSlashCommandBuilder<Builder extends SlashCommandBuilder | SlashCommandSubcommandGroupBuilder | SlashCommandSubcommandBuilder>(
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
          builder.addSubcommandGroup(subcommandGroupBuilder => getSlashCommandBuilder(subcommand, subcommandGroupBuilder))
        }
        else {
          builder.addSubcommand(subcommandBuilder => getSlashCommandBuilder(subcommand, subcommandBuilder))
        }
      }
      else if (builder instanceof SlashCommandSubcommandGroupBuilder) {
        builder.addSubcommand(subcommandBuilder => getSlashCommandBuilder(subcommand, subcommandBuilder))
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
            if (option.minLength !== undefined)
              opt.setMinLength(option.minLength)
            if (option.maxLength !== undefined)
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
            if (option.min !== undefined)
              opt.setMinValue(option.min)
            if (option.max !== undefined)
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
            if (option.min !== undefined)
              opt.setMinValue(option.min)
            if (option.max !== undefined)
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

type Payload = RESTPostAPIApplicationCommandsJSONBody
type LocalCommand = SlashCommandRuntime | SlashCommandSubcommandRuntime | SlashCommandSubcommandGroupRuntime
interface Entry { body: Payload, local?: SlashCommandRuntime }
type ScopePlan = Map<string, Entry[]>

export function planRegistrations(commands: SlashCommandRuntime[], menus: (ContextMenuDefinition & { name: string })[], guilds: string[]) {
  const scopes: ScopePlan = new Map()
  const unassigned = []
  function add(scope: string, entry: Entry) {
    const entries = scopes.get(scope) ?? []
    entries.push(entry)
    scopes.set(scope, entries)
  }
  for (const command of commands) {
    const targets = command.guilds === true ? guilds : command.guilds || ['global']
    if (!targets.length) {
      unassigned.push(command)
      continue
    }
    const body = getSlashCommandBuilder(command, new SlashCommandBuilder()).toJSON()
    for (const scope of new Set(targets))
      add(scope, { body, local: command })
  }
  for (const menu of menus) {
    const type = menu.type === 'user' ? ApplicationCommandType.User : ApplicationCommandType.Message
    add('global', { body: new ContextMenuCommandBuilder().setName(menu.name).setType(type).toJSON() })
  }
  return { scopes, unassigned }
}

type Plan = ReturnType<typeof planRegistrations>

function identity(command: { name: string, type?: number }) {
  return `${command.type ?? ApplicationCommandType.ChatInput}:${command.name}`
}

// Discord supplies these defaults and response-only fields even when omitted on write.
function comparable(command: Payload | APIApplicationCommand) {
  return {
    type: command.type ?? ApplicationCommandType.ChatInput,
    name: command.name,
    description: ('description' in command && command.description) || '',
    nameLocalizations: command.name_localizations ?? {},
    descriptionLocalizations: ('description_localizations' in command && command.description_localizations) || {},
    contexts: [...(command.contexts ?? [0, 1, 2])].sort(),
    permissions: command.default_member_permissions ?? null,
    nsfw: command.nsfw ?? false,
    options: ('options' in command ? command.options ?? [] : []).map(optionShape),
  }
}

function optionShape(option: APIApplicationCommandOption): object {
  return {
    type: option.type,
    name: option.name,
    description: option.description,
    names: option.name_localizations ?? {},
    descriptions: option.description_localizations ?? {},
    required: option.required ?? false,
    autocomplete: 'autocomplete' in option && !!option.autocomplete,
    min: 'min_value' in option ? option.min_value : undefined,
    max: 'max_value' in option ? option.max_value : undefined,
    minLength: 'min_length' in option ? option.min_length : undefined,
    maxLength: 'max_length' in option ? option.max_length : undefined,
    channels: 'channel_types' in option ? option.channel_types : undefined,
    choices: ('choices' in option ? option.choices ?? [] : []).map(choice => ({
      name: choice.name,
      value: choice.value,
      names: choice.name_localizations ?? {},
    })),
    options: ('options' in option ? option.options ?? [] : []).map(optionShape),
  }
}

type LocalRow = LocalCommand & { scope: string }
interface RemoteRow { name: string, description: string, scope: string, id?: string, options: APIApplicationCommandOption[] }
interface Match { local: LocalRow, remote: RemoteRow }

export interface RegistrationDiff {
  added: LocalRow[]
  removed: RemoteRow[]
  changed: Match[]
  synced: Match[]
  conflict: LocalRow[]
  menuChanges: number
}

function schemaRows(command: Payload | APIApplicationCommand, scope: string) {
  const rows = new Map<string, { row: RemoteRow, schema: object }>()
  function visit(row: RemoteRow, schema: object) {
    rows.set(row.name, { row, schema })
    for (const option of row.options) {
      if (option.type === ApplicationCommandOptionType.Subcommand || option.type === ApplicationCommandOptionType.SubcommandGroup) {
        visit({ scope, name: `${row.name} ${option.name}`, description: option.description, options: option.options ?? [] }, optionShape(option))
      }
    }
  }
  visit({
    scope,
    name: command.name,
    description: ('description' in command && command.description) || '',
    options: ('options' in command && command.options) || [],
    id: 'id' in command ? command.id : undefined,
  }, comparable(command))
  return rows
}

function localRows(command: LocalCommand, scope: string, name = command.name): LocalRow[] {
  return [{ ...command, scope, name }, ...(command.subcommands ?? []).flatMap(sub => localRows(sub, scope, `${name} ${sub.name}`))]
}

function duplicates(entries: Entry[]) {
  const seen = new Set<string>()
  const repeated = new Set<string>()
  for (const { body } of entries) {
    const key = identity(body)
    if (seen.has(key))
      repeated.add(key)
    seen.add(key)
  }
  return repeated
}

interface ScopeStore {
  load: () => Promise<string[] | null>
  save: (scopes: string[]) => Promise<void>
}

export interface RegistrationResult {
  scope: string
  commands: APIApplicationCommand[]
  error?: string
}

export class CommandRegistration {
  private confirmed = new Map<string, ReturnType<typeof comparable>[]>()
  private queue = Promise.resolve()
  constructor(
    private rest: Pick<REST, 'get' | 'put'>,
    private appId: string,
    private store: ScopeStore,
    private onError: (error: unknown) => void,
  ) {}

  private route(scope: string) {
    return scope === 'global' ? Routes.applicationCommands(this.appId) : Routes.applicationGuildCommands(this.appId, scope)
  }

  async read(scope: string) {
    const query = new URLSearchParams({ with_localizations: 'true' })
    return await this.rest.get(this.route(scope), { query }) as APIApplicationCommand[]
  }

  async diff(plan: Plan): Promise<RegistrationDiff> {
    const added: LocalRow[] = []
    const removed: RemoteRow[] = []
    const changed: Match[] = []
    const synced: Match[] = []
    const conflict: LocalRow[] = plan.unassigned.map(command => ({ ...command, scope: 'unconfigured guild' }))
    let menuChanges = 0
    for (const scope of new Set([...plan.scopes.keys(), ...await this.store.load() ?? []])) {
      const desired = plan.scopes.get(scope) ?? []
      const remote = await this.read(scope)
      const existing = new Map(remote.map(cmd => [identity(cmd), cmd]))
      const duplicate = duplicates(desired)
      for (const { local, body } of desired) {
        const key = identity(body)
        const current = existing.get(key)
        existing.delete(key)
        if (!local) {
          if (!current || !isDeepStrictEqual(comparable(body), comparable(current)))
            menuChanges++
          continue
        }
        const rows = localRows(local, scope)
        if (duplicate.has(key)) {
          conflict.push(...rows)
          continue
        }
        if (!current) {
          added.push(...rows)
          continue
        }
        const wanted = schemaRows(body, scope)
        const existingRows = schemaRows(current, scope)
        for (const row of rows) {
          const match = existingRows.get(row.name)
          existingRows.delete(row.name)
          if (match) {
            const list = isDeepStrictEqual(wanted.get(row.name)?.schema, match.schema) ? synced : changed
            list.push({ local: row, remote: match.row })
          }
          else {
            added.push(row)
          }
        }
        for (const { row } of existingRows.values())
          removed.push(row)
      }
      for (const cmd of existing.values()) {
        if (cmd.type === ApplicationCommandType.ChatInput)
          removed.push(...Array.from(schemaRows(cmd, scope).values(), entry => entry.row))
        else
          menuChanges++
      }
    }
    return { added, removed, changed, synced, conflict, menuChanges }
  }

  sync(plan: Plan, changedOnly = false) {
    const pending = this.queue.then(() => this.apply(plan, changedOnly))
    this.queue = pending.then(() => {}, () => {})
    return pending
  }

  private async apply(plan: Plan, changedOnly: boolean) {
    const managed = new Set(await this.store.load() ?? [])
    const results: RegistrationResult[] = []
    if (plan.unassigned.length) {
      const error = new Error(`Set discord.guilds or DISCORD_GUILD_ID for ${plan.unassigned.map(cmd => `/${cmd.name}`).join(', ')}`)
      this.onError(error)
      results.push({ scope: 'unconfigured guild', commands: [], error: error.message })
    }
    for (const scope of new Set([...plan.scopes.keys(), ...managed])) {
      const desired = plan.scopes.get(scope) ?? []
      try {
        if (duplicates(desired).size)
          throw new Error('Duplicate command names in this scope')
        const body = desired.map(entry => entry.body)
        const schema = body.map(comparable)
        if (changedOnly && isDeepStrictEqual(this.confirmed.get(scope), schema))
          continue
        let commands = await this.read(scope)
        const byKey = new Map(commands.map(cmd => [identity(cmd), cmd]))
        const matches = body.length === commands.length && body.every((cmd, index) => {
          const existing = byKey.get(identity(cmd))
          return existing && isDeepStrictEqual(schema[index], comparable(existing))
        })
        if (!matches)
          commands = await this.rest.put(this.route(scope), { body }) as APIApplicationCommand[]
        const returned = new Map(commands.map(cmd => [identity(cmd), cmd.id]))
        for (const { local, body } of desired) {
          if (local)
            local.id = returned.get(identity(body))
        }
        if (managed.has(scope) !== (body.length > 0)) {
          if (body.length)
            managed.add(scope)
          else managed.delete(scope)
          await this.store.save([...managed])
        }
        this.confirmed.set(scope, schema)
        results.push({ scope, commands })
      }
      catch (error) {
        this.confirmed.delete(scope)
        this.onError(error)
        results.push({ scope, commands: [], error: error instanceof Error ? error.message : String(error) })
      }
    }
    return results
  }
}
