import type { ApplicationCommandOptionChoiceData, Interaction, MessageFlagsResolvable } from 'discord.js'
import type { SlashCommandOption } from '../../../types'
import type { DiscordClient } from './client'
import { MessageFlagsBitField, ApplicationCommandOptionType as OptionType } from 'discord.js'

export interface SimulationRequest {
  name: string
  options?: Record<string, string | number | boolean>
}

export interface RecordedReply {
  content: string
  ephemeral: boolean
}

interface Payload {
  content?: string | null
  flags?: MessageFlagsResolvable
  ephemeral?: boolean
  files?: unknown[]
  embeds?: unknown[]
  components?: unknown[]
}

function readOption(option: SlashCommandOption, raw: string | number | boolean) {
  switch (option.type) {
    case OptionType.Boolean:
      if (raw === true || raw === 'true')
        return true
      if (raw === false || raw === 'false')
        return false
      throw new Error(`Choose True or False for “${option.name}”.`)
    case OptionType.Integer:
    case OptionType.Number: {
      const n = Number(raw)
      if (!String(raw).trim() || !Number.isFinite(n) || (option.type === OptionType.Integer && !Number.isInteger(n)))
        throw new Error(`Enter a valid ${option.type === OptionType.Integer ? 'integer' : 'number'} for “${option.name}”.`)
      return n
    }
    case OptionType.String: return String(raw)
    default: throw new Error(`The “${option.name}” option needs a Discord ${OptionType[option.type].toLowerCase()}. Run this command in Discord.`)
  }
}

function isPrivate(payload: Payload) {
  return payload.ephemeral === true || new MessageFlagsBitField(payload.flags).has('Ephemeral')
}

export async function simulateInteraction(client: DiscordClient, request: SimulationRequest, focus?: { option: string, value: string }) {
  const parts = typeof request.name === 'string' ? request.name.trim().split(/\s+/) : []
  const [name, second, third] = parts
  const group = third ? second : null
  const leaf = third ?? second ?? null
  const replies: RecordedReply[] = []
  const notices = new Set<string>()
  let choices: ApplicationCommandOptionChoiceData[] = []
  const command = name && parts.length <= 3 && client.resolveSlashCommand(name, group, leaf)
  if (!command)
    return { ok: false, error: 'Unknown command.', replies, notices: [], choices }

  function record(payload: string | Payload, index = replies.length, ephemeral?: boolean) {
    const data = typeof payload === 'string' ? { content: payload } : payload
    const previous = replies[index]
    replies[index] = {
      content: data.content ?? previous?.content ?? '',
      ephemeral: previous?.ephemeral ?? ephemeral ?? isPrivate(data),
    }
    if (data.components?.length)
      notices.add('This reply has interactive controls. Use Discord to interact with them.')
    if (data.files?.length || data.embeds?.length)
      notices.add('This reply includes attachments or embeds. Open it in Discord to view them.')
    return {
      id: String(index),
      edit: async (update: Payload) => record(update, index),
      createMessageComponentCollector: () => ({ on() {}, stop() {} }),
    }
  }

  let deferredPrivate = false
  const interaction = {
    commandName: name,
    createdTimestamp: Date.now(),
    user: { id: 'dashboard-preview-user', displayName: 'Dashboard preview' },
    channel: null,
    channelId: null,
    guild: null,
    guildId: null,
    member: null,
    inGuild: () => false,
    isAutocomplete: () => !!focus,
    isChatInputCommand: () => !focus,
    isMessageContextMenuCommand: () => false,
    isUserContextMenuCommand: () => false,
    options: {
      getSubcommandGroup: () => group,
      getSubcommand: () => leaf,
      getFocused: (withName?: boolean) => withName ? { name: focus?.option, value: focus?.value } : focus?.value,
      get(key: string) {
        const option = command.options.find(o => o.name === key)
        const raw = request.options?.[key]
        if (raw == null || !option)
          return null
        return { name: key, type: option.type, value: readOption(option, raw) }
      },
    },
    replied: false,
    deferred: false,
    async respond(values: ApplicationCommandOptionChoiceData[]) { choices = values },
    async reply(payload: Payload) {
      this.replied = true
      return record(payload)
    },
    async deferReply(payload: Payload = {}) {
      this.deferred = true
      deferredPrivate = isPrivate(payload)
    },
    async editReply(payload: Payload) {
      this.replied = true
      return record(payload, 0, this.deferred ? deferredPrivate : undefined)
    },
    async followUp(payload: Payload) { return record(payload) },
    webhook: {
      async editMessage(id: string, payload: Payload) {
        const index = replies.findIndex((_, i) => String(i) === id)
        if (index < 0)
          throw new Error('The dashboard can only edit messages from this preview.')
        return record(payload, index)
      },
    },
    async showModal() { throw new Error('This command opens a modal. Submit it in Discord.') },
  }

  const result = await client.dispatchInteraction(interaction as unknown as Interaction, { simulation: true })
  try {
    return { ok: result.status === 'ok', error: result.detail, replies, notices: [...notices], choices }
  }
  finally { result.dispose() }
}
