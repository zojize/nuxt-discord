import type { ApplicationCommandOptionChoiceData, Interaction } from 'discord.js'
import type { SlashCommandRuntime } from '../src/types'
import { ApplicationCommandOptionType, ApplicationCommandType, AutocompleteInteraction, ButtonInteraction, ChatInputCommandInteraction, Client, ComponentType, EmbedBuilder, Events, InteractionResponseType, InteractionType, MessageFlags, ModalSubmitInteraction, SnowflakeUtil, UserContextMenuCommandInteraction } from 'discord.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import { DiscordClient } from '../src/runtime/server/utils/client'
import { cooldown } from '../src/runtime/server/utils/middleware/cooldown'
import { requireRole } from '../src/runtime/server/utils/middleware/requireRole'
import { reply } from '../src/runtime/server/utils/reply'

const hooks = vi.hoisted(() => ({ callHook: vi.fn(), hook: vi.fn() }))
vi.mock('nitropack/runtime', () => ({
  useNitroApp: () => ({ hooks }),
  useRuntimeConfig: () => ({ discord: { interactionTimeout: 0 } }),
}))

const user = { id: '100000000000000002', username: 'reader', discriminator: '0', avatar: null }
const command: SlashCommandRuntime = { name: 'search', path: 'search.ts', description: 'Search', parents: [], options: [] }

describe('discord gateway interaction contracts', () => {
  let sdk: Client
  let bot: DiscordClient

  beforeEach(() => {
    vi.stubEnv('DISCORD_TOKEN', 'offline-test')
    vi.stubEnv('DISCORD_CLIENT_ID', '100000000000000001')
    hooks.callHook.mockReset()
    sdk = new Client({ intents: [] })
    vi.spyOn(sdk.rest, 'post').mockResolvedValue(undefined)
    vi.spyOn(sdk.rest, 'get').mockRejectedValue(new Error('Unexpected offline GET'))
    vi.spyOn(sdk.rest, 'delete').mockResolvedValue(undefined)
    vi.spyOn(sdk.rest, 'patch').mockResolvedValue({
      id: '100000000000000009',
      channel_id: '100000000000000004',
      author: user,
      type: 0,
      content: 'edited',
      timestamp: new Date().toISOString(),
      attachments: [],
      embeds: [],
      mentions: [],
    })
    bot = new DiscordClient()
  })
  afterEach(async () => {
    await sdk.destroy()
    vi.restoreAllMocks()
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  // discord.js constructs these from gateway payloads internally. Only REST is stubbed.
  function incoming<T extends Interaction>(ctor: { prototype: T }, type: InteractionType, data: Record<string, unknown> = {}, extra: Record<string, unknown> = {}): T {
    return new (ctor as unknown as new (client: Client, payload: Record<string, unknown>) => T)(sdk, {
      id: SnowflakeUtil.generate().toString(),
      application_id: '100000000000000001',
      type,
      token: 'offline-interaction',
      data: { id: '100000000000000006', name: 'search', type: ApplicationCommandType.ChatInput, ...data },
      channel_id: '100000000000000004',
      version: 1,
      user,
      entitlements: [],
      authorizing_integration_owners: {},
      ...extra,
    })
  }

  function registerAutocomplete(autocomplete: () => ApplicationCommandOptionChoiceData[] | Promise<ApplicationCommandOptionChoiceData[]>) {
    bot.addSlashCommand({
      ...command,
      options: [{ type: ApplicationCommandOptionType.String, name: 'query', varname: 'query', required: true, description: 'Search', hasAutocomplete: true }],
      optionMacros: { query: { autocomplete } },
    })
    return incoming(AutocompleteInteraction, InteractionType.ApplicationCommandAutocomplete, {
      options: [{ name: 'query', type: ApplicationCommandOptionType.String, value: 'a', focused: true }],
    })
  }

  it('retains supported reply fields when discord.js serializes the callback', async () => {
    bot.addSlashCommand({ ...command, execute: () => reply('hello', {
      embeds: [new EmbedBuilder().setDescription('first frame')],
      allowedMentions: { parse: [] },
    }) })
    const result = await bot.dispatchInteraction(incoming(ChatInputCommandInteraction, InteractionType.ApplicationCommand))
    expect(result.status).toBe('ok')
    expect(sdk.rest.post).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      body: { type: InteractionResponseType.ChannelMessageWithSource, data: expect.objectContaining({ content: 'hello', embeds: [{ description: 'first frame' }], allowed_mentions: { parse: [] } }) },
    }))
    result.dispose()
  })

  it('resolves role ids from uncached interaction members', async () => {
    const role = '100000000000000007'
    bot.addSlashCommand({ ...command, middlewareEntries: [{ ...requireRole, options: { roleId: role } }], execute: () => 'allowed' })
    for (const [roles, status] of [[[role], 'ok'], [[], 'denied']] as const) {
      const interaction = incoming(ChatInputCommandInteraction, InteractionType.ApplicationCommand, {}, { guild_id: '100000000000000005', member: { user, roles } })
      const result = await bot.dispatchInteraction(interaction)
      expect(result.status).toBe(status)
      result.dispose()
    }
  })

  it('limits each context menu independently and releases expired cooldowns', async () => {
    vi.useFakeTimers()
    const middlewareEntries = [{ ...cooldown, options: { seconds: 5 } }]
    bot.addContextMenus([
      { name: 'Inspect', type: 'user', middlewareEntries, execute: () => 'inspected' },
      { name: 'Lookup', type: 'user', middlewareEntries, execute: () => 'found' },
    ])
    const run = async (name: string) => {
      const result = await bot.dispatchInteraction(incoming(UserContextMenuCommandInteraction, InteractionType.ApplicationCommand, {
        type: ApplicationCommandType.User,
        name,
        target_id: user.id,
        resolved: { users: { [user.id]: user } },
      }))
      result.dispose()
      return result.status
    }
    expect(await run('Inspect')).toBe('ok')
    expect(await run('Inspect')).toBe('denied')
    expect(await run('Lookup')).toBe('ok')
    await vi.advanceTimersByTimeAsync(60_100)
    expect(vi.getTimerCount()).toBe(0)
    expect(await run('Inspect')).toBe('ok')
    await vi.advanceTimersByTimeAsync(60_100)
  })

  it('returns at most 25 choices for a single autocomplete interaction', async () => {
    const choices = Array.from({ length: 30 }, (_, i) => ({ name: String(i), value: String(i) }))
    const result = await bot.dispatchInteraction(registerAutocomplete(() => choices))
    expect(result.status).toBe('ok')
    expect(sdk.rest.post).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      body: { type: InteractionResponseType.ApplicationCommandAutocompleteResult, data: { choices: choices.slice(0, 25) } },
    }))
  })

  it('cancels pending gateway acknowledgements and autocomplete when the runtime stops', async () => {
    vi.useFakeTimers()
    bot.startScope()
    const wait = Promise.withResolvers<string>()
    const choices = Promise.withResolvers<ApplicationCommandOptionChoiceData[]>()
    const autocomplete = bot.dispatchInteraction(registerAutocomplete(() => choices.promise))
    bot.addSlashCommand({ ...command, defer: 'private', execute: () => wait.promise })
    const slash = bot.dispatchInteraction(incoming(ChatInputCommandInteraction, InteractionType.ApplicationCommand))
    await vi.advanceTimersByTimeAsync(100)
    bot.stopScope()
    await vi.advanceTimersByTimeAsync(3000)
    wait.resolve('too late')
    choices.resolve([])
    await Promise.all([autocomplete, slash])
    expect(sdk.rest.post).not.toHaveBeenCalled()
  })

  it('keeps existing flags when composing a ref with a private reply', async () => {
    const flags = ref(MessageFlags.SuppressEmbeds as const)
    bot.addSlashCommand({ ...command, execute: () => reply.flags(flags).ephemeral('details') })
    const result = await bot.dispatchInteraction(incoming(ChatInputCommandInteraction, InteractionType.ApplicationCommand))
    expect(sdk.rest.post).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      body: { type: InteractionResponseType.ChannelMessageWithSource, data: expect.objectContaining({ flags: MessageFlags.Ephemeral | MessageFlags.SuppressEmbeds }) },
    }))
    result.dispose()
  })

  it('acknowledges slow autocomplete before the Discord deadline and ignores late results', async () => {
    vi.useFakeTimers()
    const gate = Promise.withResolvers<ApplicationCommandOptionChoiceData[]>()
    const run = bot.dispatchInteraction(registerAutocomplete(() => gate.promise))
    await vi.advanceTimersByTimeAsync(2500)
    expect(sdk.rest.post).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      body: { type: InteractionResponseType.ApplicationCommandAutocompleteResult, data: { choices: [] } },
    }))
    gate.resolve([{ name: 'late', value: 'late' }])
    await run
    expect(sdk.rest.post).toHaveBeenCalledOnce()
  })

  it('acknowledges slow context menus before their initial response expires', async () => {
    vi.useFakeTimers()
    vi.spyOn(Client.prototype, 'login').mockImplementation(async function (this: Client<true>) {
      this.emit(Events.ClientReady, this)
      return 'offline'
    })
    await bot.start({ intents: [], deferOnPromise: true })
    const gate = Promise.withResolvers<void>()
    bot.addContextMenus([{ name: 'Inspect', type: 'user', execute: async () => {
      await gate.promise
      return reply.ephemeral('finished')
    } }])
    const interaction = incoming(UserContextMenuCommandInteraction, InteractionType.ApplicationCommand, {
      type: ApplicationCommandType.User,
      name: 'Inspect',
      target_id: user.id,
      resolved: { users: { [user.id]: user } },
    })
    const run = bot.dispatchInteraction(interaction)
    await vi.advanceTimersByTimeAsync(2100)
    expect(interaction.deferred).toBe(true)
    expect(interaction.ephemeral).toBe(true)
    gate.resolve()
    expect((await run).status).toBe('ok')
    expect(sdk.rest.patch).toHaveBeenCalledOnce()
    const edit = vi.mocked(sdk.rest.patch).mock.calls[0]![1]!.body as { content: string, flags?: number }
    expect(edit.content).toBe('finished')
    expect((edit.flags ?? 0) & MessageFlags.Ephemeral).toBe(0)
    await bot.stop()
  })

  it('delivers the private fallback even when an error hook throws', async () => {
    hooks.callHook.mockImplementation(async (name) => {
      if (name === 'discord:client:error' || name === 'discord:interaction:after')
        throw new Error('reporter offline')
    })
    bot.addSlashCommand({ ...command, execute: () => {
      throw new Error('handler failed')
    } })
    const result = await bot.dispatchInteraction(incoming(ChatInputCommandInteraction, InteractionType.ApplicationCommand))
    expect(result).toMatchObject({ status: 'error', detail: 'handler failed' })
    expect(sdk.rest.post).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      body: { type: InteractionResponseType.ChannelMessageWithSource, data: expect.objectContaining({ flags: MessageFlags.Ephemeral }) },
    }))
  })

  it('acknowledges a failing button privately and stops the actual SDK collector on disposal', async () => {
    const executeButton = vi.fn(() => {
      throw new Error('button failed')
    })
    bot.addSlashCommand({ ...command, execute: () => reply.button('Open', executeButton, { customId: 'open' }).send('Press') })
    const interaction = incoming(ChatInputCommandInteraction, InteractionType.ApplicationCommand)
    const result = await bot.dispatchInteraction(interaction)
    expect(result.status).toBe('ok')
    const button = incoming(ButtonInteraction, InteractionType.MessageComponent, { component_type: ComponentType.Button, custom_id: 'open' }, {
      message: {
        id: '100000000000000008',
        channel_id: interaction.channelId,
        author: user,
        type: 0,
        content: 'Press',
        timestamp: new Date().toISOString(),
        attachments: [],
        embeds: [],
        mentions: [],
        components: [],
      },
    })
    const followUp = vi.spyOn(button, 'followUp').mockResolvedValue({} as never)
    sdk.emit(Events.InteractionCreate, button)
    await vi.waitFor(() => expect(followUp).toHaveBeenCalledWith(expect.objectContaining({ flags: MessageFlags.Ephemeral })))
    expect(executeButton).toHaveBeenCalledOnce()
    expect(button.deferred).toBe(true)
    result.dispose()
    expect(sdk.listenerCount(Events.InteractionCreate)).toBe(0)
  })

  it('assigns a reusable modal a fresh id each time and releases pending submissions on disposal', async () => {
    const builder = reply.modal('Look up', { query: 'short' }, () => 'received')
    const scope = effectScope()
    const first = incoming(ChatInputCommandInteraction, InteractionType.ApplicationCommand)
    const second = incoming(ChatInputCommandInteraction, InteractionType.ApplicationCommand)
    const runs = scope.run(() => [builder.call(bot, first, bot), builder.call(bot, second, bot)])!
    await vi.waitFor(() => expect(sdk.listenerCount(Events.InteractionCreate)).toBe(2))
    const ids = vi.mocked(sdk.rest.post).mock.calls.map(([, req]) => (req!.body as { data: { custom_id: string } }).data.custom_id)
    expect(new Set(ids).size).toBe(2)
    scope.stop()
    await Promise.all(runs)
    expect(sdk.listenerCount(Events.InteractionCreate)).toBe(0)
  })

  it('gives a slow modal callback its own acknowledgement and finishes the private result', async () => {
    vi.useFakeTimers()
    const gate = Promise.withResolvers<void>()
    const handler = reply.modal('Look up', { query: 'short' }, () => gate.promise)
    const opening = incoming(ChatInputCommandInteraction, InteractionType.ApplicationCommand)
    const run = handler.call(bot, opening, bot)
    await vi.advanceTimersByTimeAsync(0)
    const body = vi.mocked(sdk.rest.post).mock.calls[0]![1]!.body as { data: { custom_id: string } }
    const submission = incoming(ModalSubmitInteraction, InteractionType.ModalSubmit, {
      custom_id: body.data.custom_id,
      components: [{ type: 1, components: [{ type: 4, custom_id: 'query', value: 'hello' }] }],
    })
    sdk.emit(Events.InteractionCreate, submission)
    await vi.advanceTimersByTimeAsync(2200)
    expect(submission.deferred).toBe(true)
    expect(submission.ephemeral).toBe(true)
    gate.resolve()
    await run
    expect(sdk.rest.patch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      body: expect.objectContaining({ content: 'Submitted.' }),
    }))
  })

  it.each([undefined, 'Thanks!'])('acknowledges a slash-command modal submission with result %s', async (result) => {
    const onSubmit = vi.fn(() => result)
    const handler = reply.modal('Look up', { query: 'short' }, onSubmit)
    const interaction = incoming(ChatInputCommandInteraction, InteractionType.ApplicationCommand)
    const run = handler.call(bot, interaction, bot)
    await vi.waitFor(() => expect(sdk.listenerCount(Events.InteractionCreate)).toBe(1))
    const body = vi.mocked(sdk.rest.post).mock.calls[0]![1]!.body as { data: { custom_id: string } }
    const submission = incoming(ModalSubmitInteraction, InteractionType.ModalSubmit, {
      custom_id: body.data.custom_id,
      components: [{ type: 1, components: [{ type: 4, custom_id: 'query', value: 'hello' }] }],
    })
    sdk.emit(Events.InteractionCreate, submission)
    await run
    expect(onSubmit).toHaveBeenCalledWith({ query: 'hello' }, submission)
    expect(sdk.rest.post).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({
      body: { type: InteractionResponseType.ChannelMessageWithSource, data: expect.objectContaining(result ? { content: result } : { flags: MessageFlags.Ephemeral }) },
    }))
  })
})
